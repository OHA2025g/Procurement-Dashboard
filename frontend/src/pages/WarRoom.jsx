import React from "react";
import Layout from "@/components/Layout";
import { Link } from "react-router-dom";

export default function WarRoom() {
  return (
    <Layout title="War Room" subtitle="Live session view" page="war_room" showExport={false}>
      <div className="bg-white border border-gov-border rounded-sm shadow-card p-6 max-w-3xl">
        <p className="text-[13px] text-gov-navy-mid leading-relaxed">
          War-room layouts can be layered on top of <Link className="text-gov-gold font-semibold underline" to="/">Executive</Link>,{" "}
          <Link className="text-gov-gold font-semibold underline" to="/risk">Risk</Link>, and{" "}
          <Link className="text-gov-gold font-semibold underline" to="/actions">Actions</Link> once session mode is configured.
        </p>
      </div>
    </Layout>
  );
}
