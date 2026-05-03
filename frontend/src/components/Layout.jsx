import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import FilterBar from "@/components/FilterBar";
import NotificationBell from "@/components/NotificationBell";
import { useAuth, canAccess } from "@/contexts/AuthContext";
import { useFilters } from "@/contexts/FilterContext";
import { Button } from "@/components/ui/button";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { toast } from "sonner";
import AnimatedPageWrapper from "@/components/animations/AnimatedPageWrapper";

export default function Layout({ title, subtitle, children, page = "executive", showFilterBar = true, showExport = true }) {
  const { user } = useAuth();
  const { queryParams } = useFilters();
  const [exporting, setExporting] = useState({ pdf: false, excel: false });
  const navigate = useNavigate();

  const now = useMemo(() => new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }), []);

  if (!user) {
    navigate("/login");
    return null;
  }
  if (!canAccess(user.role, page)) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="bg-white border border-gov-border p-8 rounded-sm max-w-xl">
            <h1 className="font-heading text-2xl text-gov-navy mb-2">Access Restricted</h1>
            <p className="text-[13px] text-gov-muted">
              Your role <span className="font-data text-gov-crit">{user.role}</span> does not have access to this page.
            </p>
          </div>
        </main>
      </div>
    );
  }

  async function handleExport(type) {
    setExporting((s) => ({ ...s, [type]: true }));
    try {
      const token = localStorage.getItem("proc_token");
      const qs = new URLSearchParams(queryParams).toString();
      const url = `${API_BASE}/export/${type}${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const ext = type === "pdf" ? "pdf" : "xlsx";
      const fname = `procurement_${page}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${type.toUpperCase()} downloaded`);
    } catch (e) {
      toast.error(`Export failed: ${e.message}`);
    } finally {
      setExporting((s) => ({ ...s, [type]: false }));
    }
  }

  return (
    <div className="flex min-h-screen bg-gov-slate">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gov-border px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="font-heading text-[22px] text-gov-navy leading-tight truncate gold-underline" data-testid="page-title">
                {title}
              </h1>
              {subtitle && <div className="text-[11px] text-gov-muted font-data uppercase tracking-[0.14em] mt-1">{subtitle}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right mr-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-gov-muted font-data">Last refreshed</div>
              <div className="text-[12px] font-data text-gov-navy-mid">{now}</div>
            </div>
            <NotificationBell />
            {showExport && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExport("excel")}
                  disabled={exporting.excel}
                  data-testid="export-excel-btn"
                  className="h-9 text-[11px] uppercase tracking-wider border-gov-border text-gov-navy hover:bg-gov-slate font-data"
                >
                  <FileSpreadsheet size={13} className="mr-1.5" />
                  {exporting.excel ? "Exporting…" : "Excel"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleExport("pdf")}
                  disabled={exporting.pdf}
                  data-testid="export-pdf-btn"
                  className="h-9 text-[11px] uppercase tracking-wider bg-gov-navy hover:bg-gov-navy-mid text-white font-data"
                >
                  <FileDown size={13} className="mr-1.5" />
                  {exporting.pdf ? "Generating…" : "PDF Report"}
                </Button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 px-8 py-6">
          {showFilterBar && <FilterBar />}
          <AnimatedPageWrapper>{children}</AnimatedPageWrapper>
          <footer className="mt-12 pt-6 border-t border-gov-border text-[10px] text-gov-muted font-data uppercase tracking-[0.14em] text-center">
            Confidential — Government Use Only &nbsp;·&nbsp; Procurement Analytics System &nbsp;·&nbsp; © 2026 Govt. of Maharashtra
          </footer>
        </div>
      </main>
    </div>
  );
}
