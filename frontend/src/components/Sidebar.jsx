import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Layers, CreditCard, Gavel, Inbox, ShieldAlert,
  ListChecks, Settings, LogOut, User as UserIcon, BellRing, BookOpen,
  RadioTower, MonitorPlay, Users2, Landmark, GitBranch, Scale,
} from "lucide-react";
import { useAuth, canAccess } from "@/contexts/AuthContext";

const NAV_SECTIONS = [
  {
    title: null,
    items: [
      { key: "executive", accessKey: "executive", to: "/", label: "Executive Overview", icon: LayoutDashboard },
    ],
  },
  {
    title: null,
    items: [
      { key: "statements", accessKey: "statements", to: "/statements", label: "Statement Analysis", icon: Layers },
      { key: "payment", accessKey: "payment", to: "/payment", label: "PO & Payment", icon: CreditCard },
      { key: "tender", accessKey: "tender", to: "/tender", label: "Tender Pipeline", icon: Gavel },
      { key: "backlog", accessKey: "backlog", to: "/backlog", label: "Backlog & Retender", icon: Inbox },
      { key: "risk", accessKey: "risk", to: "/risk", label: "Risk & Governance", icon: ShieldAlert },
      { key: "actions", accessKey: "actions", to: "/actions", label: "Action Tracker", icon: ListChecks },
      { key: "alerts", accessKey: "actions", to: "/alerts", label: "Alerts & Escalation", icon: BellRing },
      { key: "admin", accessKey: "admin", to: "/admin", label: "Data Management", icon: Settings },
    ],
  },
  {
    title: "Command & review",
    items: [
      { key: "kpi-dictionary", accessKey: "executive", to: "/kpi-dictionary", label: "KPI Dictionary", icon: BookOpen },
      { key: "command-centre", accessKey: "command_centre", to: "/command-centre", label: "Command Centre", icon: RadioTower },
      { key: "war-room", accessKey: "war_room", to: "/war-room", label: "War Room", icon: MonitorPlay },
      { key: "department-accountability", accessKey: "department_accountability", to: "/department-accountability", label: "Dept accountability", icon: Users2 },
      { key: "finance-control", accessKey: "finance_control", to: "/finance-control", label: "Finance control", icon: Landmark },
      { key: "procurement-bottleneck", accessKey: "procurement_bottleneck", to: "/procurement-bottleneck", label: "Bottleneck", icon: GitBranch },
      { key: "official-decision-queue", accessKey: "official_decision_queue", to: "/official-decision-queue", label: "Official decisions", icon: Scale },
    ],
  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside
      className="bg-gov-navy text-white w-64 flex-shrink-0 flex flex-col h-screen sticky top-0 border-r border-gov-navy-mid"
      data-testid="sidebar"
    >
      <div className="px-5 py-5 border-b border-gov-navy-mid">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gov-gold/15 border border-gov-gold/40 flex items-center justify-center shrink-0">
            <span className="font-heading text-gov-gold text-lg font-bold">M</span>
          </div>
          <div className="min-w-0">
            <div className="font-heading text-[13px] leading-tight text-white/95">
              Government of
              <br />Maharashtra
            </div>
            <div className="mt-0.5 text-[10px] tracking-[0.14em] text-white/50 uppercase font-data">
              Public Health Dept.
            </div>
          </div>
        </div>
        <div className="mt-4 text-[10px] tracking-[0.18em] text-gov-gold font-data uppercase">
          Procurement Analytics
        </div>
        <div className="text-[10px] tracking-[0.1em] text-white/40 font-data">v 1.0 · Secure Portal</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} className="mb-1">
            {section.title && (
              <div className="px-5 pt-3 pb-1 text-[9px] uppercase tracking-[0.2em] text-white/40 font-data">
                {section.title}
              </div>
            )}
            {section.items.map(({ key, accessKey, to, label, icon: Icon }) => {
              const allowed = user?.role && canAccess(user.role, accessKey);
              if (!allowed) return null;
              return (
                <NavLink
                  key={key}
                  to={to}
                  end={to === "/"}
                  data-testid={`nav-${key}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-5 py-2.5 text-[13px] transition-colors ${
                      isActive
                        ? "sidebar-link-active text-gov-gold-soft font-semibold"
                        : "text-white/75 hover:text-white hover:bg-gov-navy-mid"
                    }`
                  }
                >
                  <Icon size={16} strokeWidth={1.8} />
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-gov-navy-mid p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-gov-gold/20 border border-gov-gold/40 flex items-center justify-center">
            <UserIcon size={14} className="text-gov-gold-soft" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold truncate" data-testid="sidebar-user-name">
              {user?.name || "—"}
            </div>
            <div className="text-[10px] text-gov-gold-soft tracking-wide uppercase font-data">
              {user?.role?.replaceAll("_", " ") || "Guest"}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          data-testid="sidebar-logout-btn"
          className="w-full flex items-center justify-center gap-2 text-[11px] uppercase tracking-wider py-2 border border-white/20 hover:border-gov-gold hover:text-gov-gold text-white/80 transition-colors font-data"
        >
          <LogOut size={13} /> Sign Out
        </button>
      </div>
    </aside>
  );
}
