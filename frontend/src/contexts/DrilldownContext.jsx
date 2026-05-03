import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { useFilters } from "@/contexts/FilterContext";

const DrilldownContext = createContext(null);

/**
 * @typedef {Object} DrillPayload
 * @property {string} [title]
 * @property {string} [kpiId]
 * @property {'kpi_card'|'chart'|'table'|'narrative'|'dictionary'} [source]
 * @property {string} [metric]
 * @property {Record<string, string|number>} [filters] overlay filters (statement, kpi_preset, …)
 */

export function DrilldownProvider({ children }) {
  const { filters: globalFilters, queryParams } = useFilters();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Drill-down");
  const [kpiId, setKpiId] = useState(null);
  const [source, setSource] = useState(null);
  const [metric, setMetric] = useState(null);
  const [drillFilters, setDrillFilters] = useState({});
  const [recordDetailId, setRecordDetailId] = useState(null);

  const openRecordDetail = useCallback((id) => {
    if (!id) return;
    setOpen(false);
    setRecordDetailId(id);
  }, []);

  const closeRecordDetail = useCallback(() => setRecordDetailId(null), []);

  const openDrilldown = useCallback((payload = {}) => {
    setTitle(payload.title || "Records");
    setKpiId(payload.kpiId || null);
    setSource(payload.source || null);
    setMetric(payload.metric || null);
    setDrillFilters(payload.filters || {});
    setOpen(true);
  }, []);

  const closeDrilldown = useCallback(() => {
    setOpen(false);
  }, []);

  const updateDrillFilters = useCallback((patch) => {
    setDrillFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const replaceDrillFilters = useCallback((next) => {
    setDrillFilters(next && typeof next === "object" ? next : {});
  }, []);

  const handleDrilldown = openDrilldown;

  const value = useMemo(
    () => ({
      open,
      setOpen,
      title,
      kpiId,
      source,
      metric,
      drillFilters,
      globalFilters,
      queryParams,
      openDrilldown,
      handleDrilldown,
      closeDrilldown,
      updateDrillFilters,
      replaceDrillFilters,
      recordDetailId,
      openRecordDetail,
      closeRecordDetail,
    }),
    [
      open,
      title,
      kpiId,
      source,
      metric,
      drillFilters,
      globalFilters,
      queryParams,
      openDrilldown,
      closeDrilldown,
      updateDrillFilters,
      replaceDrillFilters,
      recordDetailId,
      openRecordDetail,
      closeRecordDetail,
      handleDrilldown,
    ]
  );

  return <DrilldownContext.Provider value={value}>{children}</DrilldownContext.Provider>;
}

export function useDrilldown() {
  const ctx = useContext(DrilldownContext);
  if (!ctx) throw new Error("useDrilldown must be used within DrilldownProvider");
  return ctx;
}
