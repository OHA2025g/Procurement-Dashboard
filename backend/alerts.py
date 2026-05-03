"""Alerts & Email service. Checks KPI thresholds, sends via SMTP (optional) + logs."""
from __future__ import annotations
import os
import smtplib
import ssl
import logging
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Dict, Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from kpi_engine import KPIEngine

logger = logging.getLogger("alerts")

# Thresholds from env
PAYMENT_MIN = float(os.environ.get("ALERT_PAYMENT_COMPLETION_MIN", "60"))
BACKLOG_MAX = float(os.environ.get("ALERT_BACKLOG_PCT_MAX", "25"))
RISK_MAX = float(os.environ.get("ALERT_RISK_EXPOSURE_MAX", "30"))
PO_MIN = float(os.environ.get("ALERT_PO_CONVERSION_MIN", "50"))


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER"))


async def send_email(to_emails: List[str], subject: str, body_html: str, body_text: str = "") -> Dict[str, Any]:
    """Try SMTP; fall back to log only. Returns {delivered: bool, method: str}."""
    if not to_emails:
        return {"delivered": False, "method": "no-recipients"}

    if not smtp_configured():
        logger.info(f"[EMAIL-MOCK] to={to_emails} subject={subject!r}\n{body_text or body_html}")
        return {"delivered": False, "method": "mock-log"}

    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ["SMTP_USER"]
    pwd = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("SMTP_FROM", user)
    tls = os.environ.get("SMTP_TLS", "true").lower() == "true"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(to_emails)
    if body_text:
        msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=15) as server:
            if tls:
                server.starttls(context=context)
            server.login(user, pwd)
            server.sendmail(sender, to_emails, msg.as_string())
        logger.info(f"[EMAIL-SENT] to={to_emails} subject={subject!r}")
        return {"delivered": True, "method": "smtp"}
    except Exception as e:
        logger.error(f"[EMAIL-FAIL] {e} — falling back to log")
        logger.info(f"[EMAIL-MOCK] to={to_emails} subject={subject!r}\n{body_text}")
        return {"delivered": False, "method": f"smtp-error: {e}"}


async def recipients_for(db: AsyncIOMotorDatabase, roles: List[str]) -> List[Dict[str, str]]:
    """Return active users of given roles who opted in to email alerts."""
    cursor = db.users.find({
        "role": {"$in": roles},
        "is_active": True,
    }, {"_id": 0, "email": 1, "name": 1, "role": 1, "notif_email": 1, "notif_inapp": 1})
    out: List[Dict[str, str]] = []
    async for u in cursor:
        # Default: email ON (if notif_email missing), inapp ON
        email_opt = u.get("notif_email", True)
        inapp_opt = u.get("notif_inapp", True)
        out.append({
            "email": u["email"],
            "name": u.get("name", ""),
            "role": u.get("role", ""),
            "email_opt": email_opt,
            "inapp_opt": inapp_opt,
        })
    return out


def _fmt_email(alert: Dict[str, Any]) -> tuple:
    sev = alert["severity"]
    color = {"Critical": "#C0392B", "High": "#D68910", "Medium": "#0D8E74", "Low": "#2980B9"}.get(sev, "#0B1F3A")
    subject = f"[{sev.upper()}] Procurement Alert — {alert['kpi_name']}"
    html = f"""
<html><body style="font-family:-apple-system,sans-serif;background:#F4F6FA;padding:24px;color:#0B1F3A">
  <div style="max-width:600px;margin:auto;background:#fff;border:1px solid #D0D7E8;border-radius:4px;overflow:hidden">
    <div style="background:#0B1F3A;padding:20px 28px;border-bottom:3px solid #D4A024">
      <div style="color:#D4A024;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Government of Maharashtra · Procurement Analytics</div>
      <div style="color:#fff;font-size:22px;font-weight:600">{subject}</div>
    </div>
    <div style="padding:24px 28px">
      <div style="display:inline-block;padding:4px 12px;background:{color}15;color:{color};border:1px solid {color};border-radius:3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">{sev}</div>
      <p style="font-size:14px;line-height:1.6;margin:12px 0">{alert['message']}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px">
        <tr><td style="padding:8px;border-bottom:1px solid #D0D7E8;color:#5B6780">KPI</td><td style="padding:8px;border-bottom:1px solid #D0D7E8;font-weight:600">{alert['kpi_name']}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #D0D7E8;color:#5B6780">Threshold</td><td style="padding:8px;border-bottom:1px solid #D0D7E8;font-family:monospace">{alert['threshold']}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #D0D7E8;color:#5B6780">Actual Value</td><td style="padding:8px;border-bottom:1px solid #D0D7E8;font-family:monospace;color:{color};font-weight:600">{alert['actual_value']}</td></tr>
        <tr><td style="padding:8px;color:#5B6780">Triggered</td><td style="padding:8px;font-family:monospace">{alert['triggered_at']}</td></tr>
      </table>
      <p style="font-size:12px;color:#5B6780;margin-top:24px">Please review the Procurement Analytics Dashboard for further action.</p>
    </div>
    <div style="background:#F4F6FA;padding:12px 28px;border-top:1px solid #D0D7E8;font-size:10px;color:#5B6780;letter-spacing:1px;text-transform:uppercase">
      Confidential — Government Use Only
    </div>
  </div>
</body></html>
"""
    text = f"{subject}\n\n{alert['message']}\nThreshold: {alert['threshold']}\nActual: {alert['actual_value']}\nTriggered: {alert['triggered_at']}"
    return subject, html, text


async def check_kpi_thresholds(db: AsyncIOMotorDatabase) -> List[Dict[str, Any]]:
    """Compute current KPIs, compare with thresholds, create alerts."""
    kpi = KPIEngine(db)
    exec_data = await kpi.executive(None)

    triggered: List[Dict[str, Any]] = []

    def add(kpi_id, name, sev, threshold, actual, msg):
        triggered.append({
            "id": uuid.uuid4().hex,
            "kpi_id": kpi_id,
            "kpi_name": name,
            "severity": sev,
            "threshold": threshold,
            "actual_value": actual,
            "message": msg,
            "triggered_at": _iso_now(),
            "resolved_at": None,
            "notified_users": [],
        })

    pay = exec_data.get("payment_completion_pct") or 0
    if pay < PAYMENT_MIN:
        add("KPI-033", "Payment Completion %", "High",
            f"≥ {PAYMENT_MIN}%", f"{pay:.1f}%",
            f"Payment completion has fallen to {pay:.1f}%, below the {PAYMENT_MIN}% threshold. "
            f"Outstanding value stands at ₹{exec_data.get('outstanding_value', 0):.2f} Cr.")

    backlog_pct = 0
    total = exec_data.get("KPI-001_total_portfolio") or 1
    backlog_pct = (exec_data.get("backlog_value") or 0) / total * 100 if total else 0
    if backlog_pct > BACKLOG_MAX:
        add("KPI-058", "Backlog %", "High",
            f"≤ {BACKLOG_MAX}%", f"{backlog_pct:.1f}%",
            f"Backlog share is {backlog_pct:.1f}% of total portfolio, exceeding {BACKLOG_MAX}%. "
            f"Total backlog value: ₹{exec_data.get('backlog_value', 0):.2f} Cr.")

    risk = exec_data.get("risk_exposure_pct") or 0
    if risk > RISK_MAX:
        add("KPI-104", "Risk Exposure %", "Critical",
            f"≤ {RISK_MAX}%", f"{risk:.1f}%",
            f"Risk exposure is {risk:.1f}%, exceeding the critical threshold of {RISK_MAX}%. "
            f"Immediate review by Secretariat is required.")

    po_conv = exec_data.get("po_conversion_pct") or 0
    if po_conv < PO_MIN:
        add("KPI-023", "PO Conversion %", "High",
            f"≥ {PO_MIN}%", f"{po_conv:.1f}%",
            f"PO conversion is {po_conv:.1f}%, below the {PO_MIN}% target. Tender progression is slow.")

    # Save alerts (insert_one mutates dict to add ObjectId _id; pop it to keep response JSON-serializable)
    alert_ids = []
    for a in triggered:
        await db.alert_log.insert_one(a)
        a.pop("_id", None)
        alert_ids.append(a["id"])

    # Notify
    if triggered:
        recipients = await recipients_for(db, ["SECRETARY", "MINISTER", "SUPER_ADMIN"])
        emails_opted = [r["email"] for r in recipients if r.get("email_opt")]
        for a in triggered:
            subject, html, text = _fmt_email(a)
            result = await send_email(emails_opted, subject, html, text)
            await db.alert_log.update_one(
                {"id": a["id"]},
                {"$set": {"notified_users": emails_opted, "delivery": result}},
            )
    logger.info(f"[ALERTS] Created {len(triggered)} alerts. SMTP={'configured' if smtp_configured() else 'mock'}")
    return triggered


async def run_escalation(db: AsyncIOMotorDatabase) -> Dict[str, int]:
    """Apply aging rules. Returns counts per level bumped."""
    L1_DAYS = int(os.environ.get("ESCALATION_L1_DAYS", "7"))
    L2_DAYS = int(os.environ.get("ESCALATION_L2_DAYS", "14"))
    L5_DAYS = int(os.environ.get("ESCALATION_L5_DAYS", "30"))

    bumped = {"to_L1": 0, "to_L2": 0, "to_L5": 0}
    now = datetime.now(timezone.utc)

    # Fetch pending (non-closed, non-cancelled) action records
    cursor = db.procurement.find({
        "current_status": {"$nin": ["Closed", "Cancelled"]},
        "action_required": {"$ne": ""},
    })

    async for rec in cursor:
        days = rec.get("days_pending", 0) or 0
        current_level = rec.get("escalation_level", 0) or 0
        new_level = current_level
        risk = rec.get("risk_level", "Low")

        if days >= L5_DAYS and current_level < 5 and risk == "Critical":
            new_level = 5  # Minister's Office
        elif days >= L2_DAYS and current_level < 2:
            new_level = 2
        elif days >= L1_DAYS and current_level < 1:
            new_level = 1

        if new_level != current_level:
            await db.procurement.update_one(
                {"id": rec["id"]},
                {"$set": {"escalation_level": new_level, "updated_at": _iso_now()}}
            )
            # Log to escalation_log
            await db.escalation_log.insert_one({
                "id": uuid.uuid4().hex,
                "record_id": rec["id"],
                "from_level": current_level,
                "to_level": new_level,
                "days_pending": days,
                "risk_level": risk,
                "item": rec.get("item_description", "")[:200],
                "department": rec.get("department", ""),
                "value_cr": rec.get("procurement_value", 0),
                "escalated_at": _iso_now(),
                "auto": True,
            })
            if new_level == 1:
                bumped["to_L1"] += 1
            elif new_level == 2:
                bumped["to_L2"] += 1
            elif new_level == 5:
                bumped["to_L5"] += 1

    # Notify Minister for any L5 created recently
    if bumped["to_L5"] > 0:
        recipients = await recipients_for(db, ["MINISTER", "SECRETARY", "SUPER_ADMIN"])
        opted = [r["email"] for r in recipients if r.get("email_opt")]
        subject = f"[CRITICAL] {bumped['to_L5']} case(s) escalated to Minister's Office (L5)"
        msg = {
            "id": uuid.uuid4().hex,
            "kpi_id": "ESC-L5",
            "kpi_name": "Auto-Escalation to Minister",
            "severity": "Critical",
            "threshold": f"{L5_DAYS} days unresolved + Critical risk",
            "actual_value": f"{bumped['to_L5']} cases",
            "message": f"{bumped['to_L5']} critical cases crossed {L5_DAYS} days unresolved and have been auto-escalated to Minister's Office (L5). Immediate review required.",
            "triggered_at": _iso_now(),
            "resolved_at": None,
            "notified_users": opted,
        }
        await db.alert_log.insert_one(msg)
        msg.pop("_id", None)
        s, h, t = _fmt_email(msg)
        await send_email(opted, s, h, t)

    logger.info(f"[ESCALATION] bumped={bumped}")
    return bumped
