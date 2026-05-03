import React from "react";
import DrilldownDrawer from "@/components/DrilldownDrawer";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { useDrilldown } from "@/contexts/DrilldownContext";

export default function DrilldownShell() {
  const { recordDetailId, closeRecordDetail, openRecordDetail } = useDrilldown();
  return (
    <>
      <DrilldownDrawer onRowDetail={(id) => openRecordDetail(id)} />
      <ItemDetailDrawer open={!!recordDetailId} recordId={recordDetailId} onClose={closeRecordDetail} />
    </>
  );
}
