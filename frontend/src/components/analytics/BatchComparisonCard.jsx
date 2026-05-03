import React from "react";

export default function BatchComparisonCard() {
  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card p-5 mb-6" data-testid="batch-comparison-placeholder">
      <div className="font-heading text-[15px] text-gov-navy mb-1">Batch comparison</div>
      <p className="text-[12px] text-gov-muted font-data leading-relaxed">
        Upload multiple batches from <span className="text-gov-navy font-semibold">Admin</span> to compare validation scores and record counts side by side. A full batch-diff view can be enabled when
        historical batch metadata is available.
      </p>
    </div>
  );
}
