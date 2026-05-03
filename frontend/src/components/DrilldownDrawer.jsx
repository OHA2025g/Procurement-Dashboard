import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, API_BASE, fmtCr, fmtPct, fmtNum } from "@/lib/api";
import { mergeDrillParams } from "@/lib/drilldownApi";
import { useDrilldown } from "@/contexts/DrilldownContext";
import StatusBadge from "@/components/StatusBadge";
import DrilldownMiniCharts from "@/components/drilldown/DrilldownMiniCharts";
import DrilldownSuggestions from "@/components/drilldown/DrilldownSuggestions";
import DrilldownBreadcrumb from "@/components/drilldown/DrilldownBreadcrumb";
import { X, Download, Search, FileText } from "lucide-react";
import { toast } from "sonner";

function unwrapApi(res) {
  return res?.data?.data !== undefined ? res.data.data : res?.data;
}

function formatDrillError(reason) {
  const d = reason?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => (e && typeof e === "object" ? e.msg || String(e) : String(e))).join("; ");
  if (d && typeof d === "object") return JSON.stringify(d);
  return reason?.message || "Drill-down request failed";
}

export default function DrilldownDrawer({ onRowDetail }) {
  const {
    open,
    closeDrilldown,
    title,
    drillFilters,
    queryParams,
    updateDrillFilters,
    replaceDrillFilters,
  } = useDrilldown();

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [distributions, setDistributions] = useState(null);
  const [topByValue, setTopByValue] = useState([]);
  const [topByRisk, setTopByRisk] = useState([]);
  const [topByOut, setTopByOut] = useState([]);
  const [rows, setRows] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sortBy, setSortBy] = useState("procurement_value");
  const [sortOrder, setSortOrder] = useState("desc");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [facetLoadError, setFacetLoadError] = useState(null);

  const baseParams = useCallback(
    () => ({
      ...mergeDrillParams(queryParams || {}, drillFilters),
      search: appliedSearch.trim() || drillFilters.search || undefined,
    }),
    [queryParams, drillFilters, appliedSearch]
  );

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    setFacetLoadError(null);
    const params = {
      ...baseParams(),
      page,
      page_size: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder,
    };
    const bp = baseParams();

    const endpoints = [
      () => api.get("/drilldown/records", { params }),
      () => api.get("/drilldown/summary", { params: bp }),
      () => api.get("/drilldown/facets", { params: bp }),
      () => api.get("/drilldown/top-items", { params: { ...bp, metric: "value", limit: 5 } }),
      () => api.get("/drilldown/top-items", { params: { ...bp, metric: "risk", limit: 5 } }),
      () => api.get("/drilldown/top-items", { params: { ...bp, metric: "outstanding", limit: 5 } }),
    ];

    const results = await Promise.allSettled(endpoints.map((fn) => fn()));
    const errAt = (i) => (results[i].status === "rejected" ? formatDrillError(results[i].reason) : null);
    const criticalMsg = errAt(0) || errAt(1);
    const facetMsg = errAt(2);

    if (criticalMsg) {
      setLoadError(criticalMsg);
      toast.error(criticalMsg);
    }
    if (!criticalMsg && facetMsg) {
      setFacetLoadError(facetMsg);
    }

    const recRes = results[0].status === "fulfilled" ? results[0].value : null;
    const sumRes = results[1].status === "fulfilled" ? results[1].value : null;
    const distRes = results[2].status === "fulfilled" ? results[2].value : null;
    const tv = results[3].status === "fulfilled" ? results[3].value : null;
    const tr = results[4].status === "fulfilled" ? results[4].value : null;
    const to = results[5].status === "fulfilled" ? results[5].value : null;

    const d = recRes ? unwrapApi(recRes) : null;
    setRows(d?.records || []);
    setTotalRecords(d?.total_records ?? 0);
    setTotalPages(d?.total_pages || 1);
    setSummary(sumRes ? unwrapApi(sumRes) : null);
    setDistributions(distRes ? unwrapApi(distRes) : null);
    const tvData = tv ? unwrapApi(tv) : null;
    setTopByValue(tvData?.items || []);
    const trData = tr ? unwrapApi(tr) : null;
    setTopByRisk(trData?.items || []);
    const toData = to ? unwrapApi(to) : null;
    setTopByOut(toData?.items || []);

    setLoading(false);
  }, [open, baseParams, page, pageSize, sortBy, sortOrder]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (open) {
      setPage(1);
      setSearchInput("");
      setAppliedSearch("");
    }
  }, [open, drillFilters]);

  const breadcrumb = summary?.scope_title || title;

  const filterChain = useMemo(() => {
    const af = summary?.applied_filters || {};
    const c = [];
    if (af.statement) c.push({ field: "statement", value: af.statement, label: `Statement ${af.statement}` });
    if (af.department) c.push({ field: "department", value: af.department, label: String(af.department) });
    if (af.category) c.push({ field: "category", value: af.category, label: String(af.category) });
    if (af.risk_level) c.push({ field: "risk_level", value: af.risk_level, label: `Risk ${af.risk_level}` });
    return c;
  }, [summary]);

  const breadcrumbSegments = useMemo(() => {
    const s = [{ label: "All procurement" }];
    filterChain.forEach((x) => s.push({ label: x.label }));
    if (title && drillFilters?.kpi_preset) {
      s.push({ label: title.slice(0, 56), disabled: true });
    }
    return s;
  }, [filterChain, title, drillFilters?.kpi_preset]);

  const onBreadcrumbNavigate = useCallback(
    (segmentIndex) => {
      const seg = breadcrumbSegments[segmentIndex];
      if (seg?.disabled) return;
      if (segmentIndex === 0) {
        replaceDrillFilters(drillFilters.kpi_preset ? { kpi_preset: drillFilters.kpi_preset } : {});
        return;
      }
      const next = {};
      if (drillFilters.kpi_preset) next.kpi_preset = drillFilters.kpi_preset;
      for (let j = 0; j < segmentIndex; j += 1) {
        const ch = filterChain[j];
        if (ch) next[ch.field] = ch.value;
      }
      replaceDrillFilters(next);
    },
    [breadcrumbSegments, drillFilters, filterChain, replaceDrillFilters]
  );

  function exportPdf() {
    const q = new URLSearchParams();
    const p = baseParams();
    Object.entries(p).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    });
    const token = localStorage.getItem("proc_token");
    fetch(`${API_BASE}/export/drilldown/pdf?${q.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `drilldown_${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeDrilldown()}>
      <DialogContent
        className={
          "left-[50%] top-[50%] flex max-h-[85vh] h-[85vh] w-[75vw] max-w-[min(1600px,95vw)] " +
          "translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden rounded-sm border-gov-border bg-white p-0 " +
          "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] " +
          "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] " +
          "[&>button.absolute]:hidden"
        }
        data-testid="drilldown-drawer"
      >
        <DialogDescription className="sr-only">
          Procurement records table for the selected KPI scope. Use search, pagination, and row actions as needed.
        </DialogDescription>
        <DialogHeader className="px-5 py-4 border-b border-gov-border bg-gov-navy text-white shrink-0 space-y-0 text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-white font-heading text-base pr-6">{title}</DialogTitle>
              <div className="text-[11px] font-data text-gov-gold-soft mt-1 leading-snug">{breadcrumb}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="font-data text-[11px] h-8 text-gov-navy"
                onClick={exportPdf}
              >
                <FileText size={14} className="mr-1" /> PDF
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 shrink-0"
                onClick={closeDrilldown}
                aria-label="Close"
              >
                <X size={18} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <DrilldownBreadcrumb segments={breadcrumbSegments} onNavigate={onBreadcrumbNavigate} />

        {loadError && (
          <div className="px-5 py-2 border-b border-red-200 bg-red-50 text-red-900 text-[11px] font-data shrink-0" role="alert">
            {loadError}
          </div>
        )}

        <div className="px-5 py-3 border-b border-gov-border flex flex-wrap gap-2 items-center bg-gov-slate/50 shrink-0">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gov-muted" />
            <Input
              className="pl-8 h-9 text-[12px]"
              placeholder="Search item, dept, PO…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setAppliedSearch(searchInput.trim());
                  setPage(1);
                }
              }}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="font-data text-[11px] h-9"
            onClick={() => {
              setAppliedSearch(searchInput.trim());
              setPage(1);
            }}
          >
            Apply
          </Button>
          <ExportDrillButton getParams={baseParams} />
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 px-5 py-3 border-b border-gov-border shrink-0">
            <MiniStat label="Records" value={fmtNum(summary.total_records)} />
            <MiniStat label="Total value (Cr)" value={`₹ ${fmtCr(summary.total_value)}`} />
            <MiniStat label="PO value" value={`₹ ${fmtCr(summary.po_value)}`} />
            <MiniStat label="Paid" value={`₹ ${fmtCr(summary.paid_amount)}`} />
            <MiniStat label="Outstanding" value={`₹ ${fmtCr(summary.outstanding_amount)}`} />
            <MiniStat label="Backlog" value={`₹ ${fmtCr(summary.backlog_value)}`} />
            <MiniStat label="Risk value" value={`₹ ${fmtCr(summary.risk_value)}`} />
            <MiniStat label="Payment %" value={fmtPct(summary.payment_completion_pct)} />
            <MiniStat label="Risk exposure %" value={fmtPct(summary.risk_exposure_pct)} />
            <MiniStat label="Critical / High" value={`${summary.critical_count} / ${summary.high_risk_count}`} />
          </div>
        )}

        <DrilldownMiniCharts
          distributions={distributions}
          loading={loading && !distributions && !facetLoadError}
          fetchError={facetLoadError}
        />

        <DrilldownSuggestions
          summary={summary}
          onSuggestDrill={(filters) => updateDrillFilters(filters)}
        />

        {(topByValue.length > 0 || topByRisk.length > 0 || topByOut.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-5 py-3 border-b border-gov-border bg-gov-slate/20 shrink-0">
            <TopList title="Top value" rows={topByValue} onPick={(id) => onRowDetail?.(id)} />
            <TopList title="Top risk score" rows={topByRisk} onPick={(id) => onRowDetail?.(id)} />
            <TopList title="Top outstanding" rows={topByOut} onPick={(id) => onRowDetail?.(id)} />
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0">
          {loading && <div className="p-6 text-[13px] text-gov-muted">Loading…</div>}
          {!loading && (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-10 bg-gov-slate border-b-2 border-gov-border">
                <tr className="text-[9px] uppercase tracking-wider font-data text-gov-muted">
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Statement</th>
                  <th className="text-left px-3 py-2">Dept</th>
                  <th className="text-left px-3 py-2">Cat</th>
                  <th className="text-left px-3 py-2 min-w-[140px]">Item</th>
                  <th className="text-right px-3 py-2">Value</th>
                  <th className="text-right px-3 py-2">PO</th>
                  <th className="text-right px-3 py-2">Paid</th>
                  <th className="text-right px-3 py-2">Out</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Pay</th>
                  <th className="text-left px-3 py-2">Risk</th>
                  <th className="text-right px-3 py-2">Pri</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-gov-border hover:bg-gov-slate/60 cursor-pointer"
                    onClick={() => onRowDetail?.(r.id)}
                  >
                    <td className="px-3 py-2 font-data text-gov-muted truncate max-w-[72px]" title={r.id}>{r.id?.slice(0, 8)}…</td>
                    <td className="px-3 py-2 font-data">{r.statement}</td>
                    <td className="px-3 py-2 truncate max-w-[100px]" title={r.department}>{r.department}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={r.item_description}>{r.item_description}</td>
                    <td className="px-3 py-2 text-right stat-num">{fmtCr(r.procurement_value)}</td>
                    <td className="px-3 py-2 text-right stat-num">{fmtCr(r.po_value)}</td>
                    <td className="px-3 py-2 text-right stat-num">{fmtCr(r.paid_amount)}</td>
                    <td className="px-3 py-2 text-right stat-num">{fmtCr(r.outstanding_amount)}</td>
                    <td className="px-3 py-2 font-data text-[10px] uppercase">{r.current_status?.replaceAll("_", " ")}</td>
                    <td className="px-3 py-2 text-[10px]">{r.payment_status}</td>
                    <td className="px-3 py-2"><StatusBadge level={r.risk_level} /></td>
                    <td className="px-3 py-2 text-right">{r.priority_score?.toFixed(0)}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={13} className="text-center py-8 text-gov-muted">No records for this scope.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gov-border flex items-center justify-between shrink-0 bg-white">
          <div className="text-[11px] font-data text-gov-muted">
            Page {page} / {totalPages} · {totalRecords} records
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="border border-gov-border rounded-sm px-2 py-1.5 bg-white">
      <div className="text-[8px] uppercase tracking-wider text-gov-muted font-data">{label}</div>
      <div className="text-[13px] font-data font-semibold text-gov-navy">{value}</div>
    </div>
  );
}

function TopList({ title, rows, onPick }) {
  if (!rows?.length) return null;
  return (
    <div className="border border-gov-border rounded-sm bg-white p-2">
      <div className="text-[9px] uppercase tracking-wider text-gov-muted font-data mb-1">{title}</div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="text-left w-full text-[10px] font-data text-gov-navy hover:text-gov-gold truncate"
              onClick={() => onPick?.(r.id)}
              title={r.item_description}
            >
              {(r.item_description || r.id || "").slice(0, 42)}
              {r.procurement_value != null && (
                <span className="text-gov-muted ml-1">₹{fmtCr(r.procurement_value)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExportDrillButton({ getParams }) {
  const handle = () => {
    const { url, token } = (() => {
      const q = new URLSearchParams();
      const p = getParams();
      Object.entries(p).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
      });
      return { url: `${API_BASE}/export/drill/excel?${q.toString()}`, token: localStorage.getItem("proc_token") };
    })();
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `drilldown_${Date.now()}.xlsx`;
        a.click();
      })
      .catch(() => {});
  };
  return (
    <Button size="sm" variant="outline" className="font-data text-[11px] h-9 gap-1" onClick={handle}>
      <Download size={14} /> Excel
    </Button>
  );
}
