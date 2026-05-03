import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef();

  const load = () =>
    api.get("/alerts", { params: { limit: 5, unresolved: true } })
      .then((r) => { setAlerts(r.data.data.alerts); setUnread(r.data.data.unread_count); })
      .catch(() => {});

  useEffect(() => {
    load();
    const i = setInterval(load, 60000); // 1 min poll
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        className="relative p-2 hover:bg-gov-slate rounded-sm"
        onClick={() => setOpen((o) => !o)}
        data-testid="notifications-bell-btn"
      >
        <Bell size={16} className="text-gov-navy-mid" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gov-crit text-white text-[9px] font-bold font-data flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 bg-white border border-gov-border shadow-elev rounded-sm z-50"
          data-testid="notifications-dropdown"
        >
          <div className="px-4 py-3 border-b border-gov-border bg-gov-navy text-white flex items-center justify-between">
            <div className="text-[12px] font-semibold tracking-wider uppercase font-data">Alerts</div>
            <span className="text-[10px] font-data text-gov-gold-soft">{unread} unresolved</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {alerts.length === 0 && (
              <div className="text-center py-6 text-[12px] text-gov-muted">No active alerts</div>
            )}
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`px-4 py-3 border-b border-gov-border row-${a.severity?.toLowerCase()}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <StatusBadge level={a.severity} />
                  <span className="text-[10px] font-data text-gov-muted">
                    {new Date(a.triggered_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-[12px] text-gov-navy font-semibold mb-0.5">{a.kpi_name}</div>
                <div className="text-[11px] text-gov-muted line-clamp-2">{a.message}</div>
              </div>
            ))}
          </div>
          <Link
            to="/alerts"
            onClick={() => setOpen(false)}
            data-testid="notifications-viewall"
            className="block text-center py-2.5 text-[11px] font-data uppercase tracking-wider text-gov-gold hover:bg-gov-slate border-t border-gov-border"
          >
            View all alerts →
          </Link>
        </div>
      )}
    </div>
  );
}
