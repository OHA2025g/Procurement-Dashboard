import React, { createContext, useContext, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";

const FilterContext = createContext(null);

const FILTER_KEYS = [
  "fy",
  "department",
  "category",
  "risk_level",
  "statement",
  "payment_status",
  "value_band",
  "batch_id",
  "search",
  "procurement_status",
  "action_type",
  "recovery_status",
  "tender_stage",
  "data_source",
  "official_decision_required",
];

function readFiltersFromParams(searchParams) {
  const o = {};
  FILTER_KEYS.forEach((k) => {
    const v = searchParams.get(k);
    if (v != null && String(v).trim() !== "") o[k] = v;
  });
  return o;
}

export function FilterProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => readFiltersFromParams(searchParams), [searchParams]);

  const [meta, setMeta] = React.useState({
    departments: [],
    financial_years: [],
    categories: ["Medicine", "Equipment", "Consumables", "Services", "Others"],
    risk_levels: ["Critical", "High", "Medium", "Low"],
    statements: [],
  });
  const [metaLoaded, setMetaLoaded] = React.useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const res = await api.get("/meta/filters");
      setMeta(res.data.data);
      setMetaLoaded(true);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (localStorage.getItem("proc_token")) loadMeta();
  }, [loadMeta]);

  const updateFilter = useCallback(
    (key, value) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === "" || value === null || value === undefined) {
            next.delete(key);
          } else {
            next.set(key, String(value));
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const queryParams = useMemo(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== "" && v !== null && v !== undefined) p[k] = v;
    });
    return p;
  }, [filters]);

  const activePills = useMemo(() => Object.entries(filters).filter(([, v]) => v), [filters]);

  return (
    <FilterContext.Provider
      value={{ filters, updateFilter, clearFilters, meta, metaLoaded, queryParams, activePills, loadMeta }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  return useContext(FilterContext);
}
