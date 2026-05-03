import axios from "axios";

/** EasyPanel / Docker: set REACT_APP_BACKEND_URL on the frontend container; entrypoint writes public/runtime-env.js */
function getBackendBaseUrl() {
  if (typeof window !== "undefined" && window.__RUNTIME_CONFIG__?.REACT_APP_BACKEND_URL) {
    return String(window.__RUNTIME_CONFIG__.REACT_APP_BACKEND_URL).replace(/\/$/, "");
  }
  return process.env.REACT_APP_BACKEND_URL;
}

const BASE_URL = getBackendBaseUrl();
export const API_BASE = `${BASE_URL}/api`;

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("proc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("proc_token");
      localStorage.removeItem("proc_user");
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const fmtCr = (v) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(2)} K Cr`;
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
};

export const fmtNum = (v) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return new Intl.NumberFormat("en-IN").format(v);
};

export const fmtPct = (v) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${Number(v).toFixed(1)}%`;
};

export const riskColor = {
  Critical: "#C0392B",
  High: "#D68910",
  Medium: "#0D8E74",
  Low: "#2980B9",
};

export const statementColor = {
  A: "#0D8E74",
  B: "#132E55",
  C: "#D4A024",
  D: "#C0392B",
};

export const statementLabel = {
  A: "PO Issued",
  B: "Tender Under Process",
  C: "Awaited / Retender",
  D: "Expired / Cancelled",
};
