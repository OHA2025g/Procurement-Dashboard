import React, { useEffect, useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDrilldown } from "@/contexts/DrilldownContext";
import { api } from "@/lib/api";

export default function KPIDictionary() {
  const { openDrilldown } = useDrilldown();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/kpi-dictionary")
      .then((r) => {
        if (!cancelled) setRows(r.data.data || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter(
      (r) =>
        (r.kpi_id || "").toLowerCase().includes(s) ||
        (r.name || "").toLowerCase().includes(s) ||
        (r.group || "").toLowerCase().includes(s) ||
        (r.dashboard_page || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  async function exportDictionaryExcel() {
    try {
      const res = await api.get("/export/kpi-dictionary/excel", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `kpi_dictionary_${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }

  return (
    <Layout title="KPI Dictionary" subtitle="120 KPIs — definitions, formulas, and drill-down" page="executive" showFilterBar>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          className="max-w-sm h-9 text-[12px] font-data"
          placeholder="Filter by ID, name, group, page…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-[11px] text-gov-muted font-data">
          {loading ? "Loading…" : `${filtered.length} / ${rows.length} KPIs`}
        </span>
        <Button variant="outline" size="sm" className="font-data text-[11px]" onClick={exportDictionaryExcel}>
          Export Excel
        </Button>
      </div>
      <div className="bg-white border border-gov-border rounded-sm shadow-card overflow-auto max-h-[70vh]">
        <table className="w-full text-[12px] min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
              <th className="text-left px-3 py-2.5">KPI ID</th>
              <th className="text-left px-3 py-2.5">Name</th>
              <th className="text-left px-3 py-2.5">Group</th>
              <th className="text-left px-3 py-2.5">Formula</th>
              <th className="text-left px-3 py-2.5">Unit</th>
              <th className="text-left px-3 py-2.5">Page</th>
              <th className="text-left px-3 py-2.5">Visual</th>
              <th className="text-right px-3 py-2.5 w-32">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.kpi_id} className="border-b border-gov-border hover:bg-gov-slate/40">
                <td className="px-3 py-2 font-data text-gov-muted whitespace-nowrap">{r.kpi_id}</td>
                <td className="px-3 py-2 font-semibold text-gov-navy max-w-[220px]">{r.name}</td>
                <td className="px-3 py-2 text-[11px]">{r.group}</td>
                <td className="px-3 py-2 font-data text-[11px] text-gov-navy-mid max-w-[280px]">{r.formula}</td>
                <td className="px-3 py-2 font-data">{r.unit}</td>
                <td className="px-3 py-2 text-[11px]">{r.dashboard_page}</td>
                <td className="px-3 py-2 text-[11px]">{r.visual_type}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-data text-[11px]"
                    onClick={() =>
                      openDrilldown({
                        title: `${r.kpi_id} — ${r.name}`,
                        filters:
                          typeof r.drilldown_filter_preset === "object" && r.drilldown_filter_preset !== null
                            ? r.drilldown_filter_preset
                            : { kpi_preset: r.drilldown_filter_preset || "total_portfolio" },
                        kpiId: r.kpi_id,
                        source: "dictionary",
                      })
                    }
                  >
                    View records
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[11px] text-gov-muted font-data">
        Drill-down uses <code className="text-gov-navy">GET /api/drilldown/records</code> with{" "}
        <code>kpi_preset</code> and URL-synced global filters.
      </p>
    </Layout>
  );
}
