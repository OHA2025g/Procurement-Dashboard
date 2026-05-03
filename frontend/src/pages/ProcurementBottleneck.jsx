import React from "react";
import Layout from "@/components/Layout";
import { Link } from "react-router-dom";

export default function ProcurementBottleneck() {
  return (
    <Layout title="Procurement bottleneck" subtitle="Pipeline friction" page="procurement_bottleneck" showExport={false}>
      <div className="bg-white border border-gov-border rounded-sm shadow-card p-6 max-w-3xl">
        <p className="text-[13px] text-gov-navy-mid leading-relaxed">
          Review <Link className="text-gov-gold font-semibold underline" to="/tender">Tender Pipeline</Link>,{" "}
          <Link className="text-gov-gold font-semibold underline" to="/backlog">Backlog</Link>, and{" "}
          <Link className="text-gov-gold font-semibold underline" to="/risk">Risk</Link> for stage-level bottlenecks with drill-down.
        </p>
      </div>
    </Layout>
  );
}
