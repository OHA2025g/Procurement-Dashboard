import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, CheckCircle2, Clock, Mail, PlayCircle, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function Alerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [meta, setMeta] = useState({ unread_count: 0, smtp_configured: false });
  const [prefs, setPrefs] = useState({ email: true, in_app: true });
  const [running, setRunning] = useState({ kpi: false, esc: false });
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);

  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "SECRETARY";

  const load = () => {
    api.get("/alerts", { params: { limit: 100, unresolved: unresolvedOnly } })
      .then((r) => { setAlerts(r.data.data.alerts); setMeta({ unread_count: r.data.data.unread_count, smtp_configured: r.data.data.smtp_configured }); });
    api.get("/notifications/prefs").then((r) => setPrefs(r.data.data));
    if (isAdmin) {
      api.get("/escalation/log", { params: { limit: 50 } }).then((r) => setEscalations(r.data.data));
    }
  };

  useEffect(load, [unresolvedOnly]);

  async function resolve(id) {
    await api.put(`/alerts/${id}/resolve`);
    toast.success("Alert marked resolved");
    load();
  }

  async function runKpi() {
    setRunning((r) => ({ ...r, kpi: true }));
    try {
      const res = await api.post("/alerts/run-check");
      toast.success(`Check complete · ${res.data.data.triggered} alert(s) triggered`);
      load();
    } catch (e) { toast.error("Check failed"); }
    finally { setRunning((r) => ({ ...r, kpi: false })); }
  }

  async function runEsc() {
    setRunning((r) => ({ ...r, esc: true }));
    try {
      const res = await api.post("/alerts/run-escalation");
      const d = res.data.data;
      toast.success(`Escalated · L1:${d.to_L1} · L2:${d.to_L2} · L5:${d.to_L5}`);
      load();
    } catch (e) { toast.error("Escalation failed"); }
    finally { setRunning((r) => ({ ...r, esc: false })); }
  }

  async function savePrefs(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await api.put("/notifications/prefs", next);
    toast.success("Preference saved");
  }

  const unresolved = alerts.filter((a) => !a.resolved_at);
  const critical = alerts.filter((a) => a.severity === "Critical").length;
  const high = alerts.filter((a) => a.severity === "High").length;

  return (
    <Layout
      title="Alert Log & Escalation Register"
      subtitle="KPI threshold alerts · Automated escalation audit trail"
      page="actions"
      showFilterBar={false}
    >
      {/* Top KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KPICard label="Unresolved" value={unresolved.length} tone="crit" icon={Bell} testId="alert-unresolved" />
        <KPICard label="Critical Alerts" value={critical} tone="crit" testId="alert-critical" />
        <KPICard label="High Alerts" value={high} tone="high" testId="alert-high" />
        <KPICard label="Total (Last 100)" value={alerts.length} tone="gold" testId="alert-total" />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-gov-gold" />
            <h3 className="font-heading text-[15px] text-gov-navy">Manual Triggers</h3>
          </div>
          <p className="text-[12px] text-gov-muted mb-4">
            Scheduled cron runs every <span className="font-data text-gov-navy font-semibold">60 minutes</span>.
            Use these to run immediately (SUPER_ADMIN & SECRETARY only).
          </p>
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={runKpi}
              disabled={!isAdmin || running.kpi}
              data-testid="run-kpi-check-btn"
              className="bg-gov-navy hover:bg-gov-navy-mid text-white font-data uppercase text-[11px] tracking-wider"
            >
              <PlayCircle size={14} className="mr-1.5" />
              {running.kpi ? "Checking..." : "Run KPI Threshold Check"}
            </Button>
            <Button
              onClick={runEsc}
              disabled={!isAdmin || running.esc}
              data-testid="run-escalation-btn"
              variant="outline"
              className="font-data uppercase text-[11px] tracking-wider border-gov-border"
            >
              <Clock size={14} className="mr-1.5" />
              {running.esc ? "Escalating..." : "Run Escalation Cycle"}
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t border-gov-border text-[11px] font-data text-gov-muted grid grid-cols-2 gap-2">
            <div>Payment Completion &lt; <span className="text-gov-navy font-semibold">60%</span> → HIGH</div>
            <div>Backlog % &gt; <span className="text-gov-navy font-semibold">25%</span> → HIGH</div>
            <div>Risk Exposure &gt; <span className="text-gov-navy font-semibold">30%</span> → CRITICAL</div>
            <div>PO Conversion &lt; <span className="text-gov-navy font-semibold">50%</span> → HIGH</div>
          </div>
        </div>

        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail size={16} className="text-gov-gold" />
            <h3 className="font-heading text-[15px] text-gov-navy">Your Notifications</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gov-border">
              <div>
                <div className="text-[12px] font-semibold text-gov-navy">Email alerts</div>
                <div className="text-[10px] font-data uppercase tracking-wide text-gov-muted">Send critical alerts to inbox</div>
              </div>
              <Switch checked={prefs.email} onCheckedChange={(v) => savePrefs("email", v)} data-testid="pref-email" />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-[12px] font-semibold text-gov-navy">In-app alerts</div>
                <div className="text-[10px] font-data uppercase tracking-wide text-gov-muted">Topbar bell & log</div>
              </div>
              <Switch checked={prefs.in_app} onCheckedChange={(v) => savePrefs("in_app", v)} data-testid="pref-inapp" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gov-border flex items-center gap-2 text-[10px] font-data">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.smtp_configured ? "#0D8E74" : "#D68910" }} />
            <span className="text-gov-muted uppercase tracking-wider">
              SMTP: {meta.smtp_configured ? "Live" : "Mock (log only)"}
            </span>
          </div>
        </div>
      </div>

      {/* Alert toolbar */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card mb-4 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="text-[11px] uppercase tracking-[0.14em] font-data text-gov-navy font-semibold">Alert Log</div>
          <div className="flex items-center gap-2 text-[11px] font-data text-gov-navy-mid">
            <Switch checked={unresolvedOnly} onCheckedChange={setUnresolvedOnly} data-testid="unresolved-only-toggle" />
            <span>Unresolved only</span>
          </div>
        </div>
        <div className="text-[11px] font-data text-gov-muted">{alerts.length} shown · {meta.unread_count} unread</div>
      </div>

      {/* Alert table */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card mb-8" data-testid="alerts-table">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gov-navy text-white text-[10px] uppercase tracking-wider font-data">
                <th className="text-left px-4 py-2.5 w-24">Severity</th>
                <th className="text-left px-4 py-2.5 w-28">KPI</th>
                <th className="text-left px-4 py-2.5">Message</th>
                <th className="text-left px-4 py-2.5 w-28">Threshold</th>
                <th className="text-left px-4 py-2.5 w-28">Actual</th>
                <th className="text-left px-4 py-2.5 w-40">Triggered</th>
                <th className="text-center px-4 py-2.5 w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className={`border-b border-gov-border row-${a.severity?.toLowerCase()} ${a.resolved_at ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5"><StatusBadge level={a.severity} /></td>
                  <td className="px-4 py-2.5 font-data text-[11px] text-gov-navy font-semibold">{a.kpi_id}</td>
                  <td className="px-4 py-2.5 text-gov-navy-mid max-w-[400px]">{a.message}</td>
                  <td className="px-4 py-2.5 font-data text-[11px] text-gov-muted">{a.threshold}</td>
                  <td className="px-4 py-2.5 font-data text-[11px] font-semibold" style={{ color: a.severity === "Critical" ? "#C0392B" : "#D68910" }}>{a.actual_value}</td>
                  <td className="px-4 py-2.5 font-data text-[10px] text-gov-muted">{new Date(a.triggered_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5 text-center">
                    {a.resolved_at ? (
                      <span className="text-[10px] uppercase font-data text-gov-med flex items-center justify-center gap-1">
                        <CheckCircle2 size={12} /> Resolved
                      </span>
                    ) : (
                      <button
                        onClick={() => resolve(a.id)}
                        data-testid={`resolve-alert-${a.id}`}
                        className="text-[10px] uppercase font-data tracking-wider text-gov-med border border-gov-med/30 hover:bg-gov-med hover:text-white px-2 py-0.5 rounded-sm"
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gov-muted text-[12px]">No alerts to display.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Escalation Log (admin only) */}
      {isAdmin && (
        <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="escalation-log">
          <div className="px-5 py-4 border-b border-gov-border flex items-center gap-2">
            <Shield size={16} className="text-gov-gold" />
            <div>
              <div className="font-heading text-[15px] text-gov-navy">Escalation Audit Trail</div>
              <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">
                Last {escalations.length} auto-escalations · 7d→L1 · 14d→L2 · 30d+Critical→L5 (Minister)
              </div>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[440px]">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0">
                <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                  <th className="text-left px-4 py-2.5 w-24">Level Bump</th>
                  <th className="text-left px-4 py-2.5">Item</th>
                  <th className="text-left px-4 py-2.5">Department</th>
                  <th className="text-right px-4 py-2.5 w-24">Value (Cr)</th>
                  <th className="text-left px-4 py-2.5 w-20">Risk</th>
                  <th className="text-right px-4 py-2.5 w-16">Days</th>
                  <th className="text-left px-4 py-2.5 w-40">At</th>
                </tr>
              </thead>
              <tbody>
                {escalations.map((e) => {
                  const levelColor = e.to_level >= 5 ? "#C0392B" : e.to_level >= 2 ? "#D68910" : "#2980B9";
                  return (
                    <tr key={e.id} className={`border-b border-gov-border row-${e.risk_level?.toLowerCase()}`}>
                      <td className="px-4 py-2.5">
                        <span className="font-data text-[11px] font-bold" style={{ color: levelColor }}>
                          L{e.from_level} → L{e.to_level}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 max-w-[320px] truncate" title={e.item}>{e.item}</td>
                      <td className="px-4 py-2.5 text-gov-navy-mid truncate max-w-[200px]">{e.department}</td>
                      <td className="px-4 py-2.5 text-right stat-num">₹ {(e.value_cr || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5"><StatusBadge level={e.risk_level} /></td>
                      <td className="px-4 py-2.5 text-right stat-num">{e.days_pending}</td>
                      <td className="px-4 py-2.5 font-data text-[10px] text-gov-muted">{new Date(e.escalated_at).toLocaleString("en-IN")}</td>
                    </tr>
                  );
                })}
                {escalations.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-gov-muted text-[12px]">No escalations recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
