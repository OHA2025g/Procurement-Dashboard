import React from "react";
import Layout from "@/components/Layout";
import { Link } from "react-router-dom";

export default function CommandCentre() {
  return (
    <Layout title="Command Centre" subtitle="Cross-portfolio command view" page="command_centre" showExport={false}>
      <div className="bg-white border border-gov-border rounded-sm shadow-card p-6 max-w-3xl">
        <p className="text-[13px] text-gov-navy-mid leading-relaxed mb-4">
          This route is reserved for a consolidated command view. Use the <strong>Executive Overview</strong> for the live KPI dashboard,
          or open <Link className="text-gov-gold font-semibold underline" to="/actions">Action Tracker</Link> for operational follow-up.
        </p>
      </div>
    </Layout>
  );
}
