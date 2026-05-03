import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("proc_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email: email.toLowerCase(), password });
      const { access_token, user: u } = res.data.data;
      localStorage.setItem("proc_token", access_token);
      localStorage.setItem("proc_user", JSON.stringify(u));
      setUser(u);
      return { ok: true, user: u };
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.error?.message || "Login failed";
      return { ok: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("proc_token");
    localStorage.removeItem("proc_user");
    setUser(null);
    window.location.href = "/login";
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data.data);
      localStorage.setItem("proc_user", JSON.stringify(res.data.data));
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("proc_token") && !user) refresh();
  }, [user, refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Page permission matrix (sync with backend auth.PAGE_ACCESS)
export const PAGE_ACCESS = {
  executive: ["VIEWER", "MINISTER", "SECRETARY", "DEPT_HEAD", "FINANCE_TEAM", "AUDIT_TEAM", "SUPER_ADMIN"],
  statements: ["SECRETARY", "DEPT_HEAD", "FINANCE_TEAM", "AUDIT_TEAM", "SUPER_ADMIN"],
  payment: ["SECRETARY", "DEPT_HEAD", "FINANCE_TEAM", "SUPER_ADMIN"],
  tender: ["SECRETARY", "DEPT_HEAD", "SUPER_ADMIN"],
  backlog: ["SECRETARY", "DEPT_HEAD", "AUDIT_TEAM", "SUPER_ADMIN"],
  risk: ["SECRETARY", "DEPT_HEAD", "AUDIT_TEAM", "SUPER_ADMIN"],
  actions: ["SECRETARY", "DEPT_HEAD", "FINANCE_TEAM", "AUDIT_TEAM", "SUPER_ADMIN"],
  admin: ["SUPER_ADMIN"],
  command_centre: ["VIEWER", "MINISTER", "SECRETARY", "DEPT_HEAD", "FINANCE_TEAM", "AUDIT_TEAM", "SUPER_ADMIN"],
  war_room: ["VIEWER", "MINISTER", "SECRETARY", "DEPT_HEAD", "FINANCE_TEAM", "AUDIT_TEAM", "SUPER_ADMIN"],
  department_accountability: ["SECRETARY", "DEPT_HEAD", "AUDIT_TEAM", "SUPER_ADMIN"],
  finance_control: ["SECRETARY", "DEPT_HEAD", "FINANCE_TEAM", "SUPER_ADMIN"],
  procurement_bottleneck: ["SECRETARY", "DEPT_HEAD", "AUDIT_TEAM", "SUPER_ADMIN"],
  official_decision_queue: ["SECRETARY", "DEPT_HEAD", "FINANCE_TEAM", "AUDIT_TEAM", "SUPER_ADMIN"],
};

export function canAccess(role, page) {
  return (PAGE_ACCESS[page] || []).includes(role);
}
