import React from "react";
import Layout from "@/components/Layout";
import { Link } from "react-router-dom";

export default function OfficialDecisionQueue() {
  return (
    <Layout title="Official decision queue" subtitle="High-stakes decisions" page="official_decision_queue" showExport={false}>
      <div className="bg-white border border-gov-border rounded-sm shadow-card p-6 max-w-3xl">
        <p className="text-[13px] text-gov-navy-mid leading-relaxed">
          Filter procurement records with official decision flags via drill-down presets (KPI-116). Start from{" "}
          <Link className="text-gov-gold font-semibold underline" to="/risk">Risk &amp; Governance</Link> or{" "}
          <Link className="text-gov-gold font-semibold underline" to="/actions">Actions</Link>.
        </p>
      </div>
    </Layout>
  );
}
