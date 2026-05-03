import React from "react";
import Layout from "@/components/Layout";
import { Link } from "react-router-dom";

export default function FinanceControl() {
  return (
    <Layout title="Finance control" subtitle="Payments & commitments" page="finance_control" showExport={false}>
      <div className="bg-white border border-gov-border rounded-sm shadow-card p-6 max-w-3xl">
        <p className="text-[13px] text-gov-navy-mid leading-relaxed">
          For payment KPIs and outstanding analysis, use{" "}
          <Link className="text-gov-gold font-semibold underline" to="/payment">PO &amp; Payment</Link> and the payment drill-down drawer.
        </p>
      </div>
    </Layout>
  );
}
