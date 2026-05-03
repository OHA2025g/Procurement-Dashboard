import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Lock, Mail } from "lucide-react";

const DEMO_USERS = [
  { email: "admin@maha.gov.in", pwd: "Admin@2026", role: "Super Admin" },
  { email: "secretary@maha.gov.in", pwd: "Secretary@2026", role: "Secretary" },
  { email: "minister@maha.gov.in", pwd: "Minister@2026", role: "Minister" },
  { email: "finance@maha.gov.in", pwd: "Finance@2026", role: "Finance" },
  { email: "audit@maha.gov.in", pwd: "Audit@2026", role: "Audit" },
  { email: "depthead@maha.gov.in", pwd: "DeptHead@2026", role: "Dept Head" },
  { email: "viewer@maha.gov.in", pwd: "Viewer@2026", role: "Viewer" },
];

export default function Login() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState("admin@maha.gov.in");
  const [password, setPassword] = useState("Admin@2026");
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const res = await login(email, password);
    if (res.ok) {
      toast.success(`Welcome, ${res.user.name}`);
      navigate("/");
    } else {
      setErr(res.error);
    }
  }

  function quickFill(u) {
    setEmail(u.email);
    setPassword(u.pwd);
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[5fr_6fr]">
      {/* Left: Branding */}
      <div className="gov-grain text-white relative overflow-hidden flex flex-col justify-between p-10">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 rounded-full bg-gov-gold/15 border-2 border-gov-gold flex items-center justify-center">
              <span className="font-heading text-gov-gold text-xl font-bold">M</span>
            </div>
            <div>
              <div className="font-heading text-[17px] leading-tight text-white">Government of Maharashtra</div>
              <div className="text-[11px] tracking-[0.18em] text-gov-gold-soft uppercase font-data mt-0.5">
                Public Health Department
              </div>
            </div>
          </div>

          <div className="max-w-md">
            <div className="text-[10px] tracking-[0.28em] text-gov-gold uppercase font-data mb-3">
              Master System · Secure Portal
            </div>
            <h1 className="font-heading text-4xl lg:text-5xl text-white leading-[1.1] mb-6">
              Procurement<br />
              <span className="text-gov-gold-soft italic">Analytics</span> Dashboard
            </h1>
            <p className="text-[13px] text-white/70 leading-relaxed max-w-[420px]">
              A unified monitoring platform tracking 120 KPIs across the full procurement lifecycle — from tender
              planning through PO issuance to payment clearance and risk governance.
            </p>

            <div className="mt-12 grid grid-cols-3 gap-4 max-w-[420px]">
              <StatBit value="120" label="KPIs" />
              <StatBit value="7" label="Dashboards" />
              <StatBit value="7" label="User Roles" />
            </div>
          </div>
        </div>

        <div className="relative z-10 text-[10px] tracking-[0.14em] font-data text-white/40 uppercase">
          Confidential · Government Use Only · © 2026
        </div>
      </div>

      {/* Right: Form */}
      <div className="bg-white flex items-center justify-center p-8 relative">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase font-data text-gov-gold font-semibold mb-3">
              <Shield size={12} /> Authorized Access
            </div>
            <h2 className="font-heading text-[28px] text-gov-navy mb-1">Sign in to continue</h2>
            <p className="text-[12px] text-gov-muted">
              Use your Government of Maharashtra credentials.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-[10px] uppercase tracking-[0.14em] text-gov-muted font-data">
                Official Email
              </Label>
              <div className="relative mt-1.5">
                <Mail size={14} className="absolute left-3 top-3 text-gov-muted" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@maha.gov.in"
                  data-testid="login-email"
                  className="pl-9 h-11 font-data text-[13px] border-gov-border rounded-sm focus-visible:ring-gov-gold"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password" className="text-[10px] uppercase tracking-[0.14em] text-gov-muted font-data">
                Password
              </Label>
              <div className="relative mt-1.5">
                <Lock size={14} className="absolute left-3 top-3 text-gov-muted" />
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="login-password"
                  className="pl-9 h-11 font-data text-[13px] border-gov-border rounded-sm focus-visible:ring-gov-gold"
                />
              </div>
            </div>

            {err && (
              <div
                className="text-[12px] text-gov-crit bg-gov-crit/5 border border-gov-crit/30 px-3 py-2 rounded-sm font-data"
                data-testid="login-error"
              >
                {err}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className="w-full h-11 bg-gov-navy hover:bg-gov-navy-mid text-white font-data uppercase text-[12px] tracking-[0.14em] rounded-sm"
            >
              {loading ? "Signing In…" : "Sign In Securely"}
            </Button>
          </form>

          <div className="mt-10 pt-6 border-t border-gov-border">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gov-muted font-data mb-3">
              Demo Credentials — Click to Autofill
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  onClick={() => quickFill(u)}
                  type="button"
                  data-testid={`quick-login-${u.role.toLowerCase().replace(" ", "-")}`}
                  className="text-left px-3 py-2 bg-gov-slate hover:bg-gov-slate hover:border-gov-gold border border-gov-border rounded-sm transition-all group"
                >
                  <div className="text-[11px] font-semibold text-gov-navy group-hover:text-gov-gold">
                    {u.role}
                  </div>
                  <div className="text-[10px] font-data text-gov-muted truncate">{u.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBit({ value, label }) {
  return (
    <div>
      <div className="font-heading text-3xl text-gov-gold">{value}</div>
      <div className="text-[10px] tracking-[0.18em] uppercase text-white/50 font-data mt-0.5">{label}</div>
    </div>
  );
}
