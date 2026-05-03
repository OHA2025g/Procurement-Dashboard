"""Excel and PDF export services."""
from __future__ import annotations
import io
import json
from datetime import datetime
from typing import Any, Dict, List

import xlsxwriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.graphics.charts.barcharts import VerticalBarChart, HorizontalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String, Rect
from reportlab.lib.colors import HexColor


NAVY = HexColor("#0B1F3A")
MID_NAVY = HexColor("#132E55")
GOLD = HexColor("#D4A024")
CRIT = HexColor("#C0392B")
HIGH = HexColor("#D68910")
MED = HexColor("#0D8E74")
LOW = HexColor("#2980B9")
SLATE = HexColor("#F4F6FA")
BORDER = HexColor("#D0D7E8")


def export_procurement_excel(records: List[Dict[str, Any]]) -> bytes:
    """Return bytes of an Excel workbook with multiple sheets."""
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})

    # Formats
    header_fmt = wb.add_format({
        "bold": True, "bg_color": "#0B1F3A", "font_color": "white",
        "border": 1, "align": "center", "valign": "vcenter",
        "text_wrap": True, "font_size": 10,
    })
    cell_fmt = wb.add_format({"border": 1, "font_size": 9, "valign": "vcenter"})
    num_fmt = wb.add_format({"border": 1, "font_size": 9, "num_format": "₹ #,##0.00 \"Cr\"",
                              "valign": "vcenter"})
    crit_fmt = wb.add_format({"border": 1, "font_size": 9, "bg_color": "#FADBD8",
                               "font_color": "#C0392B", "bold": True, "valign": "vcenter"})
    high_fmt = wb.add_format({"border": 1, "font_size": 9, "bg_color": "#FDEBD0",
                               "font_color": "#D68910", "bold": True, "valign": "vcenter"})

    cols = ["id", "statement", "department", "bureau", "category", "item_description",
            "procurement_value", "po_value", "paid_amount", "outstanding_amount",
            "current_status", "risk_level", "action_required",
            "financial_year", "budget_source", "po_number", "tender_number",
            "priority_score", "days_pending"]

    labels = ["ID", "Stmt", "Department", "Bureau", "Category", "Item",
              "Value (Cr)", "PO (Cr)", "Paid (Cr)", "Outstanding (Cr)",
              "Status", "Risk", "Action Required",
              "FY", "Budget Src", "PO #", "Tender #",
              "Priority", "Days Pending"]

    num_cols = {6, 7, 8, 9}

    # Main register
    ws = wb.add_worksheet("Procurement Register")
    ws.freeze_panes(1, 0)
    for c, label in enumerate(labels):
        ws.write(0, c, label, header_fmt)
    for r, rec in enumerate(records, start=1):
        for c, key in enumerate(cols):
            val = rec.get(key, "")
            fmt = cell_fmt
            if c in num_cols:
                fmt = num_fmt
            elif key == "risk_level":
                if val == "Critical":
                    fmt = crit_fmt
                elif val == "High":
                    fmt = high_fmt
            ws.write(r, c, val, fmt)
    # Column widths
    widths = [10, 6, 22, 22, 12, 40, 12, 12, 12, 14, 16, 10, 32, 10, 18, 14, 14, 10, 12]
    for i, w in enumerate(widths):
        ws.set_column(i, i, w)
    ws.autofilter(0, 0, len(records), len(cols) - 1)

    # Summary by statement
    ws2 = wb.add_worksheet("Summary by Statement")
    ws2.write_row(0, 0, ["Statement", "Count", "Value (Cr)", "PO (Cr)", "Paid (Cr)", "Outstanding (Cr)"],
                  header_fmt)
    statements = {"A": "PO Issued", "B": "Tender Under Process",
                  "C": "Awaited/Retender", "D": "Expired/Failed"}
    row = 1
    for code, label in statements.items():
        subset = [r for r in records if r.get("statement") == code]
        total_val = sum(r.get("procurement_value", 0) or 0 for r in subset)
        total_po = sum(r.get("po_value", 0) or 0 for r in subset)
        total_paid = sum(r.get("paid_amount", 0) or 0 for r in subset)
        total_out = sum(r.get("outstanding_amount", 0) or 0 for r in subset)
        ws2.write(row, 0, f"{code} - {label}", cell_fmt)
        ws2.write(row, 1, len(subset), cell_fmt)
        ws2.write(row, 2, round(total_val, 4), num_fmt)
        ws2.write(row, 3, round(total_po, 4), num_fmt)
        ws2.write(row, 4, round(total_paid, 4), num_fmt)
        ws2.write(row, 5, round(total_out, 4), num_fmt)
        row += 1
    for i, w in enumerate([28, 10, 14, 14, 14, 18]):
        ws2.set_column(i, i, w)

    wb.close()
    buf.seek(0)
    return buf.getvalue()


def _draw_bar_chart(data: List[Dict[str, Any]], title: str, width: int = 450, height: int = 220) -> Drawing:
    d = Drawing(width, height)
    labels = [str(x.get("label") or x.get("department") or "")[:18] for x in data[:8]]
    values = [float(x.get("value") or 0) for x in data[:8]]
    if not values:
        values = [0]
    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 40
    chart.height = height - 70
    chart.width = width - 80
    chart.data = [values]
    chart.categoryAxis.categoryNames = labels
    chart.categoryAxis.labels.angle = 30
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.dy = -4
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labels.fontSize = 7
    chart.bars[0].fillColor = NAVY
    chart.bars.strokeColor = NAVY
    d.add(chart)
    t = String(width / 2, height - 15, title, fontSize=10, fillColor=NAVY, textAnchor="middle")
    d.add(t)
    return d


def _draw_pie(per_statement: List[Dict[str, Any]], title: str, width: int = 350, height: int = 220) -> Drawing:
    d = Drawing(width, height)
    vals = [float(x.get("value") or 0) for x in per_statement]
    labs = [str(x.get("statement", "")) for x in per_statement]
    if not any(vals):
        vals = [1]
        labs = ["No data"]
    pie = Pie()
    pie.x = 50
    pie.y = 25
    pie.width = 140
    pie.height = 140
    pie.data = vals
    pie.labels = labs
    pie.slices.strokeWidth = 0.5
    pie.slices[0].fillColor = MED
    if len(vals) > 1:
        pie.slices[1].fillColor = NAVY
    if len(vals) > 2:
        pie.slices[2].fillColor = GOLD
    if len(vals) > 3:
        pie.slices[3].fillColor = CRIT
    d.add(pie)
    d.add(String(width / 2, height - 15, title, fontSize=10, fillColor=NAVY, textAnchor="middle"))
    # Legend
    for i, (lab, v) in enumerate(zip(labs, vals)):
        total = sum(vals) or 1
        pct = v / total * 100
        d.add(Rect(210, 150 - i * 20, 10, 10, fillColor=pie.slices[i].fillColor, strokeColor=None))
        d.add(String(225, 153 - i * 20, f"{lab}: ₹{v:,.2f} Cr ({pct:.1f}%)",
                     fontSize=8, fillColor=MID_NAVY))
    return d


def export_executive_pdf(
    exec_data: Dict[str, Any],
    statement_data: Dict[str, Any],
    dept_data: Dict[str, Any],
    risk_data: Dict[str, Any],
    filters_desc: str = "All data",
) -> bytes:
    """Generate an executive PDF with charts."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm,
                            title="Procurement Analytics Executive Report")

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontName="Helvetica-Bold",
                                  fontSize=18, textColor=NAVY, alignment=1, spaceAfter=6)
    sub_style = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=9, textColor=MID_NAVY,
                                alignment=1, spaceAfter=12)
    h2_style = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, textColor=NAVY,
                               spaceAfter=6, spaceBefore=10, fontName="Helvetica-Bold")
    body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=9, textColor=MID_NAVY)

    story = []

    # Cover / header
    story.append(Paragraph("GOVERNMENT OF MAHARASHTRA", title_style))
    story.append(Paragraph("Public Health Department — Procurement Analytics Report", sub_style))
    story.append(Paragraph(
        f"Generated: {datetime.now().strftime('%d %B %Y, %H:%M')} &nbsp;·&nbsp; Scope: {filters_desc}",
        sub_style))
    story.append(Paragraph("<b>CONFIDENTIAL — GOVERNMENT USE ONLY</b>",
                            ParagraphStyle("Conf", parent=styles["Normal"], fontSize=9,
                                           textColor=CRIT, alignment=1, spaceAfter=14)))

    # Executive KPIs table
    story.append(Paragraph("Executive Summary — Key Indicators", h2_style))
    kpi_rows = [
        ["Total Portfolio", f"₹ {exec_data.get('KPI-001_total_portfolio', 0):,.2f} Cr",
         "Total Items", f"{exec_data.get('KPI-002_total_items', 0):,}"],
        ["PO Issued Value", f"₹ {exec_data.get('po_issued_value', 0):,.2f} Cr",
         "Paid Value", f"₹ {exec_data.get('paid_value', 0):,.2f} Cr"],
        ["Outstanding", f"₹ {exec_data.get('outstanding_value', 0):,.2f} Cr",
         "Backlog Value", f"₹ {exec_data.get('backlog_value', 0):,.2f} Cr"],
        ["PO Conversion %", f"{exec_data.get('po_conversion_pct', 0):.1f}%",
         "Payment Completion %", f"{exec_data.get('payment_completion_pct', 0):.1f}%"],
        ["Risk Exposure %", f"{exec_data.get('risk_exposure_pct', 0):.1f}%",
         "Health Score (0–100)", f"{exec_data.get('KPI-010_health_score', 0):.1f}"],
    ]
    tbl = Table(kpi_rows, colWidths=[40 * mm, 45 * mm, 40 * mm, 45 * mm])
    tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("BACKGROUND", (0, 0), (0, -1), SLATE),
        ("BACKGROUND", (2, 0), (2, -1), SLATE),
        ("TEXTCOLOR", (0, 0), (-1, -1), MID_NAVY),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (1, 0), (1, -1), NAVY),
        ("TEXTCOLOR", (3, 0), (3, -1), NAVY),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 12))

    # Statement distribution chart
    story.append(Paragraph("Statement Distribution (₹ Cr)", h2_style))
    story.append(_draw_pie(statement_data.get("per_statement", []), "Portfolio Split"))
    story.append(Spacer(1, 8))

    # Statement table
    stmt_rows = [["Statement", "Count", "Value (Cr)", "Share %", "Risk Score"]]
    for s in statement_data.get("per_statement", []):
        stmt_rows.append([f"{s['statement']} - {'PO' if s['statement']=='A' else 'Tender' if s['statement']=='B' else 'Backlog' if s['statement']=='C' else 'Failed'}",
                          f"{s['count']:,}", f"₹ {s['value']:,.2f}",
                          f"{s['share_pct']:.1f}%", f"{s['risk_score']:,.2f}"])
    stmt_tbl = Table(stmt_rows, colWidths=[50 * mm, 25 * mm, 35 * mm, 25 * mm, 30 * mm])
    stmt_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TEXTCOLOR", (0, 1), (-1, -1), MID_NAVY),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(stmt_tbl)
    story.append(PageBreak())

    # Department top
    story.append(Paragraph("Top Departments by Portfolio Value", h2_style))
    dept_list = dept_data.get("departments", [])[:10]
    dept_chart_data = [{"label": d["department"][:20], "value": d["total_value"]} for d in dept_list]
    story.append(_draw_bar_chart(dept_chart_data, "Top 10 Departments (₹ Cr)"))
    story.append(Spacer(1, 6))

    dept_rows = [["Department", "Count", "Value (Cr)", "PO (Cr)", "Paid (Cr)", "Backlog (Cr)", "Risk"]]
    for d in dept_list:
        dept_rows.append([
            d["department"][:35], f"{d['total_count']:,}", f"₹ {d['total_value']:,.2f}",
            f"₹ {d['po_value']:,.2f}", f"₹ {d['paid']:,.2f}",
            f"₹ {d['backlog']:,.2f}", f"{d['risk_score']:.1f}"
        ])
    dept_tbl = Table(dept_rows, colWidths=[60 * mm, 16 * mm, 26 * mm, 22 * mm, 22 * mm, 24 * mm, 14 * mm])
    dept_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TEXTCOLOR", (0, 1), (-1, -1), MID_NAVY),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SLATE]),
    ]))
    story.append(dept_tbl)
    story.append(Spacer(1, 14))

    # Risk section
    story.append(Paragraph("Risk & Governance Overview", h2_style))
    risk_rows = [
        ["Indicator", "Value"],
        ["Critical / High Risk Items", f"{risk_data.get('KPI-105_high_risk_count', 0):,}"],
        ["Critical / High Risk Value (Cr)", f"₹ {risk_data.get('KPI-106_high_risk_value', 0):,.2f}"],
        ["Failed / Inactive Value (Cr)", f"₹ {risk_data.get('KPI-071_failed_total', 0):,.2f}"],
        ["Failed %", f"{risk_data.get('KPI-072_failed_pct', 0):.1f}%"],
        ["Expired Value (Cr)", f"₹ {risk_data.get('KPI-065_expired_value', 0):,.2f}"],
        ["Cancelled Value (Cr)", f"₹ {risk_data.get('KPI-069_cancelled_value', 0):,.2f}"],
    ]
    risk_tbl = Table(risk_rows, colWidths=[90 * mm, 80 * mm])
    risk_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TEXTCOLOR", (0, 1), (-1, -1), MID_NAVY),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(risk_tbl)
    story.append(Spacer(1, 14))

    # Top 10 High Value Items
    top10 = exec_data.get("top10", [])
    if top10:
        story.append(Paragraph("Top 10 High-Value Items", h2_style))
        top_rows = [["#", "Item", "Dept", "Category", "Value (Cr)", "Status", "Risk"]]
        for i, item in enumerate(top10, 1):
            top_rows.append([
                str(i), (item.get("item_description", "") or "")[:38],
                (item.get("department", "") or "")[:18],
                item.get("category", ""),
                f"₹ {item.get('procurement_value', 0):,.2f}",
                item.get("current_status", ""), item.get("risk_level", "")
            ])
        top_tbl = Table(top_rows, colWidths=[8 * mm, 60 * mm, 32 * mm, 22 * mm, 24 * mm, 22 * mm, 18 * mm])
        top_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("TEXTCOLOR", (0, 1), (-1, -1), MID_NAVY),
            ("PADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SLATE]),
        ]))
        story.append(top_tbl)

    def _on_page(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica-Oblique", 7)
        canvas.setFillColor(MID_NAVY)
        canvas.drawString(15 * mm, 10 * mm,
                          "CONFIDENTIAL — GOVERNMENT USE ONLY")
        canvas.drawRightString(195 * mm, 10 * mm,
                               f"Page {doc_.page} · Procurement Analytics")
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(1)
        canvas.line(15 * mm, 12 * mm, 195 * mm, 12 * mm)
        canvas.restoreState()

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    buf.seek(0)
    return buf.getvalue()


def export_kpi_dictionary_excel(registry_rows: List[Dict[str, Any]]) -> bytes:
    """Excel export of KPI dictionary (120 rows)."""
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    ws = wb.add_worksheet("KPI Dictionary")
    header = wb.add_format({"bold": True, "bg_color": "#0B1F3A", "font_color": "white", "border": 1})
    cell = wb.add_format({"border": 1, "font_size": 9})
    cols = ["kpi_id", "name", "group", "definition", "formula", "unit", "level",
            "visual_type", "dashboard_page", "priority", "drilldown_filter_preset", "api_endpoint"]
    for c, h in enumerate(cols):
        ws.write(0, c, h, header)
    for r, row in enumerate(registry_rows, start=1):
        for c, h in enumerate(cols):
            val = row.get(h, "")
            if isinstance(val, (dict, list)):
                val = json.dumps(val, default=str)
            ws.write(r, c, val, cell)
    ws.set_column(0, 0, 10)
    ws.set_column(1, 1, 36)
    ws.set_column(2, 2, 22)
    ws.set_column(3, 5, 40)
    ws.freeze_panes(1, 0)
    wb.close()
    buf.seek(0)
    return buf.getvalue()


def export_record_pdf(rec: Dict[str, Any], *, title: str = "Procurement record", user_label: str = "") -> bytes:
    """Single-record PDF summary."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(title, styles["Title"]),
        Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M UTC')} · {user_label}", styles["Normal"]),
        Spacer(1, 10),
    ]
    rows = [[k, str(v)[:500]] for k, v in sorted(rec.items()) if k != "_id"]
    t = Table(rows, colWidths=[45 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (0, -1), SLATE),
    ]))
    story.append(t)
    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


def export_kpi_summary_excel(kpi_items: List[Dict[str, Any]], applied_filters: Dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    hdr = wb.add_format({"bold": True, "bg_color": "#0B1F3A", "font_color": "white", "border": 1})
    cell = wb.add_format({"border": 1, "font_size": 9})
    by_group: Dict[str, List[Dict[str, Any]]] = {}
    for row in kpi_items or []:
        g = row.get("group") or "Other"
        by_group.setdefault(g, []).append(row)
    for g, rows in by_group.items():
        ws = wb.add_worksheet(g[:31].replace("/", "-"))
        cols = ["kpi_id", "kpi_name", "group", "formatted_value", "unit", "formula", "dashboard_page", "priority"]
        for c, h in enumerate(cols):
            ws.write(0, c, h, hdr)
        for r, row in enumerate(rows, start=1):
            for c, h in enumerate(cols):
                ws.write(r, c, str(row.get(h, "")), cell)
    wsf = wb.add_worksheet("Applied Filters")
    wsf.write(0, 0, "Key", hdr)
    wsf.write(0, 1, "Value", hdr)
    rr = 1
    for k, v in (applied_filters or {}).items():
        wsf.write(rr, 0, str(k), cell)
        wsf.write(rr, 1, str(v), cell)
        rr += 1
    wsf.write(rr + 1, 0, "Generated At", hdr)
    wsf.write(rr + 1, 1, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"), cell)
    wb.close()
    buf.seek(0)
    return buf.getvalue()


def export_action_tracker_excel(rows: List[Dict[str, Any]], applied_filters: Dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    hdr = wb.add_format({"bold": True, "bg_color": "#0B1F3A", "font_color": "white", "border": 1})
    cell = wb.add_format({"border": 1, "font_size": 9})
    cols = [
        "action_id", "record_id", "statement", "department", "category", "item_description",
        "procurement_value", "po_value", "paid_amount", "outstanding_amount", "current_status",
        "payment_status_cached", "risk_level", "priority_score", "action_type", "action_required",
        "next_best_action", "suggested_owner", "assigned_to", "escalation_level", "action_status",
        "target_date", "remarks", "updated_at",
    ]
    ws = wb.add_worksheet("Action Tracker")
    for c, h in enumerate(cols):
        ws.write(0, c, h, hdr)
    for r, row in enumerate(rows or [], start=1):
        for c, h in enumerate(cols):
            ws.write(r, c, str(row.get(h, "")), cell)
    ws2 = wb.add_worksheet("Applied Filters")
    ws2.write(0, 0, "Key", hdr)
    ws2.write(0, 1, "Value", hdr)
    for i, (k, v) in enumerate((applied_filters or {}).items(), start=1):
        ws2.write(i, 0, str(k), cell)
        ws2.write(i, 1, str(v), cell)
    wb.close()
    buf.seek(0)
    return buf.getvalue()


def export_drilldown_pdf(
    scope_title: str,
    applied_filters: Dict[str, Any],
    summary: Dict[str, Any],
    top_by_value: List[Dict[str, Any]],
    top_by_risk: List[Dict[str, Any]],
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Drill-Down Report", styles["Title"]),
        Paragraph(scope_title or "Scope", styles["Heading3"]),
        Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 8),
        Paragraph("Applied filters", styles["Heading4"]),
        Paragraph(str(applied_filters), styles["Normal"]),
        Spacer(1, 8),
        Paragraph("Summary KPIs", styles["Heading4"]),
        Paragraph(str(summary), styles["Normal"]),
        Spacer(1, 8),
        Paragraph("Top 10 by value (tabular)", styles["Heading4"]),
    ]
    if top_by_value:
        tv = [[str(x.get("id")), str(x.get("item_description", ""))[:60],
               str(x.get("procurement_value"))] for x in top_by_value[:10]]
        t1 = Table([["ID", "Item", "Value (Cr)"]] + tv, colWidths=[25 * mm, 100 * mm, 30 * mm])
        t1.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, BORDER), ("FONTSIZE", (0, 0), (-1, -1), 7)]))
        story.append(t1)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Top by risk / priority", styles["Heading4"]))
    if top_by_risk:
        tr = [[str(x.get("id")), str(x.get("risk_level")), str(x.get("priority_score"))] for x in top_by_risk[:10]]
        t2 = Table([["ID", "Risk", "Priority"]] + tr, colWidths=[35 * mm, 35 * mm, 35 * mm])
        t2.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, BORDER), ("FONTSIZE", (0, 0), (-1, -1), 7)]))
        story.append(t2)
    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


def export_page_pdf(page: str, applied_filters: Dict[str, Any], kpi_block: Dict[str, Any], narrative: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"Dashboard — {page}", styles["Title"]),
        Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 8),
        Paragraph("Applied filters", styles["Heading4"]),
        Paragraph(str(applied_filters), styles["Normal"]),
        Spacer(1, 8),
        Paragraph("KPI snapshot", styles["Heading4"]),
        Paragraph(str(kpi_block)[:8000], styles["Normal"]),
        Spacer(1, 8),
        Paragraph("Narrative", styles["Heading4"]),
        Paragraph(narrative or "—", styles["Normal"]),
    ]
    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


def export_data_quality_excel(batch_meta: Dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    hdr = wb.add_format({"bold": True, "bg_color": "#0B1F3A", "font_color": "white", "border": 1})
    cell = wb.add_format({"border": 1, "font_size": 9})
    ws = wb.add_worksheet("Batch Summary")
    ws.write(0, 0, "Field", hdr)
    ws.write(0, 1, "Value", hdr)
    r = 1
    for k, v in (batch_meta or {}).items():
        ws.write(r, 0, str(k), cell)
        ws.write(r, 1, str(v)[:2000], cell)
        r += 1
    w2 = wb.add_worksheet("Notes")
    w2.write(0, 0, "Detail sheets are placeholders until upload pipeline emits row-level QA rows.", cell)
    wb.close()
    buf.seek(0)
    return buf.getvalue()
