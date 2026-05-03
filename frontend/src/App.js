import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { FilterProvider } from "@/contexts/FilterContext";
import { DrilldownProvider } from "@/contexts/DrilldownContext";
import DrilldownShell from "@/components/DrilldownShell";
import { Toaster } from "@/components/ui/sonner";

import Login from "@/pages/Login";
import Executive from "@/pages/Executive";
import Statements from "@/pages/Statements";
import Payment from "@/pages/Payment";
import Tender from "@/pages/Tender";
import Backlog from "@/pages/Backlog";
import Risk from "@/pages/Risk";
import Actions from "@/pages/Actions";
import Alerts from "@/pages/Alerts";
import Admin from "@/pages/Admin";
import KPIDictionary from "@/pages/KPIDictionary";
import CommandCentre from "@/pages/CommandCentre";
import WarRoom from "@/pages/WarRoom";
import DepartmentAccountability from "@/pages/DepartmentAccountability";
import FinanceControl from "@/pages/FinanceControl";
import ProcurementBottleneck from "@/pages/ProcurementBottleneck";
import OfficialDecisionQueue from "@/pages/OfficialDecisionQueue";

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Executive /></Protected>} />
      <Route path="/statements" element={<Protected><Statements /></Protected>} />
      <Route path="/payment" element={<Protected><Payment /></Protected>} />
      <Route path="/tender" element={<Protected><Tender /></Protected>} />
      <Route path="/backlog" element={<Protected><Backlog /></Protected>} />
      <Route path="/risk" element={<Protected><Risk /></Protected>} />
      <Route path="/actions" element={<Protected><Actions /></Protected>} />
      <Route path="/alerts" element={<Protected><Alerts /></Protected>} />
      <Route path="/admin" element={<Protected><Admin /></Protected>} />
      <Route path="/kpi-dictionary" element={<Protected><KPIDictionary /></Protected>} />
      <Route path="/command-centre" element={<Protected><CommandCentre /></Protected>} />
      <Route path="/war-room" element={<Protected><WarRoom /></Protected>} />
      <Route path="/department-accountability" element={<Protected><DepartmentAccountability /></Protected>} />
      <Route path="/finance-control" element={<Protected><FinanceControl /></Protected>} />
      <Route path="/procurement-bottleneck" element={<Protected><ProcurementBottleneck /></Protected>} />
      <Route path="/official-decision-queue" element={<Protected><OfficialDecisionQueue /></Protected>} />
      <Route path="/dashboard/command-centre" element={<Navigate to="/command-centre" replace />} />
      <Route path="/dashboard/war-room" element={<Navigate to="/war-room" replace />} />
      <Route path="/dashboard/department-accountability" element={<Navigate to="/department-accountability" replace />} />
      <Route path="/dashboard/finance-control" element={<Navigate to="/finance-control" replace />} />
      <Route path="/dashboard/procurement-bottleneck" element={<Navigate to="/procurement-bottleneck" replace />} />
      <Route path="/dashboard/official-decision-queue" element={<Navigate to="/official-decision-queue" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <FilterProvider>
            <DrilldownProvider>
              <AppRoutes />
              <DrilldownShell />
            </DrilldownProvider>
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  fontFamily: "IBM Plex Sans, system-ui, sans-serif",
                  fontSize: 13,
                  border: "1px solid #D0D7E8",
                  background: "#fff",
                  color: "#0B1F3A",
                },
              }}
            />
          </FilterProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
