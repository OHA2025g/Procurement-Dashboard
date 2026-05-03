import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, fmtCr, statementLabel } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, IndianRupee, FileDown, ListChecks } from "lucide-react";
import ActionWorkflowDrawer from "@/components/ActionWorkflowDrawer";

export default function ItemDetailDrawer({ open, onClose, recordId }) {
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionDoc, setActionDoc] = useState(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);

  const canEscalate = user && ["SUPER_ADMIN", "SECRETARY", "AUDIT_TEAM"].includes(user.role);
  const canEdit = user && ["SUPER_ADMIN", "FINANCE_TEAM", "SECRETARY", "DEPT_HEAD"].includes(user.role);

  async function downloadPdf() {
    if (!record?.id) return;
    const res = await api.get("/export/record/pdf", {
      params: { record_id: record.id },
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `record_${record.id}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (open && recordId) {
      setLoading(true);
      setActionDoc(null);
      Promise.all([
        api.get(`/records/${recordId}`).then((r) => r.data.data).catch(() => null),
        api.get(`/actions/for-record/${recordId}`).then((r) => r.data.data).catch(() => null),
      ])
        .then(([rec, act]) => {
          setRecord(rec);
          setActionDoc(act);
        })
        .finally(() => setLoading(false));
    }
  }, [open, recordId]);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <SheetContent side="right" className="w-[560px] sm:max-w-[560px] bg-white p-0 overflow-y-auto" data-testid="item-drawer">
        <SheetHeader className="px-6 py-5 border-b border-gov-border bg-gov-navy text-white">
          <SheetTitle className="text-white font-heading text-base leading-tight flex items-start justify-between">
            <span className="pr-4">Procurement Record</span>
          </SheetTitle>
          {record && (
            <div className="text-[11px] uppercase tracking-[0.14em] font-data text-gov-gold-soft">
              {statementLabel[record.statement]} · {record.category}
            </div>
          )}
        </SheetHeader>

        {loading && <div className="p-6 text-[13px] text-gov-muted">Loading…</div>}
        {!loading && !record && <div className="p-6 text-[13px] text-gov-crit">Record not found.</div>}
        {record && (
          <div className="p-6 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-gov-muted font-data mb-1">
                Item Description
              </div>
              <div className="font-heading text-[17px] text-gov-navy leading-snug" data-testid="drawer-item">
                {record.item_description}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge level={record.risk_level} size="lg" testId="drawer-risk" />
              <span className="text-[11px] font-data uppercase tracking-wider text-gov-navy border border-gov-border px-2 py-1 rounded-sm">
                {record.current_status?.replaceAll("_", " ")}
              </span>
              <span className="text-[11px] font-data uppercase tracking-wider text-gov-navy-mid bg-gov-slate px-2 py-1 rounded-sm">
                FY {record.financial_year}
              </span>
              {record.escalation_level > 0 && (
                <span className="text-[11px] font-data uppercase tracking-wider bg-gov-crit/10 text-gov-crit border border-gov-crit/30 px-2 py-1 rounded-sm">
                  Escalation L{record.escalation_level}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InfoCell label="Procurement Value" value={`₹ ${fmtCr(record.procurement_value)} Cr`} icon={IndianRupee} bold />
              <InfoCell label="PO Value" value={`₹ ${fmtCr(record.po_value)} Cr`} />
              <InfoCell label="Paid" value={`₹ ${fmtCr(record.paid_amount)} Cr`} />
              <InfoCell label="Outstanding" value={`₹ ${fmtCr(record.outstanding_amount)} Cr`} tone={record.outstanding_amount > 5 ? "crit" : "default"} />
              {record.payment_status && (
                <InfoCell label="Payment status" value={record.payment_status} />
              )}
              <InfoCell label="Days Pending" value={`${record.days_pending}`} />
              <InfoCell label="Priority Score" value={record.priority_score?.toFixed(1)} />
              {record.value_band && <InfoCell label="Value band" value={record.value_band} />}
              {record.record_id && <InfoCell label="Record ID" value={record.record_id} />}
              {record.batch_id && <InfoCell label="Upload batch" value={record.batch_id} />}
            </div>

            {record.suggested_owner && (
              <div className="text-[12px] text-gov-navy-mid">
                <span className="text-gov-muted font-data text-[10px] uppercase tracking-wider">Suggested owner · </span>
                {record.suggested_owner}
              </div>
            )}

            <div className="border-t border-gov-border pt-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-gov-muted font-data mb-2">Department & Bureau</div>
              <div className="flex items-start gap-2 text-[13px] text-gov-navy-mid">
                <Building2 size={14} className="mt-0.5 text-gov-gold shrink-0" />
                <div>
                  <div className="font-semibold">{record.department}</div>
                  {record.bureau && <div className="text-[12px] text-gov-muted mt-0.5">{record.bureau}</div>}
                </div>
              </div>
            </div>

            {(record.budget_source || record.po_number || record.tender_number) && (
              <div className="border-t border-gov-border pt-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-gov-muted font-data mb-2">References</div>
                <div className="space-y-1.5 text-[12px] font-data text-gov-navy-mid">
                  {record.budget_source && <div><span className="text-gov-muted">Budget:</span> {record.budget_source}</div>}
                  {record.po_number && <div><span className="text-gov-muted">PO #:</span> {record.po_number}</div>}
                  {record.tender_number && <div><span className="text-gov-muted">Tender #:</span> {record.tender_number}</div>}
                  {record.proposal_date && <div><span className="text-gov-muted">Proposal Date:</span> {record.proposal_date}</div>}
                </div>
              </div>
            )}

            {record.suggested_decision && (
              <div className="border-l-4 border-gov-navy bg-gov-slate/60 p-4 rounded-sm">
                <div className="text-[10px] uppercase tracking-[0.14em] text-gov-navy font-data font-semibold mb-1">
                  Suggested decision
                </div>
                <div className="text-[13px] text-gov-navy font-semibold">{record.suggested_decision}</div>
              </div>
            )}
            {record.action_required && (
              <div className="border-l-4 border-gov-gold bg-gov-gold/5 p-4 rounded-sm">
                <div className="text-[10px] uppercase tracking-[0.14em] text-gov-gold font-data font-semibold mb-1">
                  Next Best Action
                </div>
                <div className="text-[13px] text-gov-navy font-semibold">{record.action_required}</div>
              </div>
            )}

            {record.remarks && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-gov-muted font-data mb-1">Remarks</div>
                <div className="text-[12px] text-gov-navy-mid italic">{record.remarks}</div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-gov-border">
              {actionDoc && (
                <Button type="button" variant="outline" size="sm" className="font-data text-[11px]" onClick={() => setWorkflowOpen(true)}>
                  <ListChecks size={14} className="mr-1.5" /> Action workflow
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" className="font-data text-[11px]" onClick={downloadPdf}>
                <FileDown size={14} className="mr-1.5" /> Export PDF
              </Button>
              {canEscalate && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="font-data text-[11px]"
                  onClick={async () => {
                    await api.post(`/records/${record.id}/escalate`);
                    const r = await api.get(`/records/${record.id}`);
                    setRecord(r.data.data);
                  }}
                >
                  Escalate
                </Button>
              )}
              {!canEdit && !canEscalate && (
                <span className="text-[10px] text-gov-muted font-data self-center">Viewer — read only</span>
              )}
            </div>
          </div>
        )}
      </SheetContent>
      <ActionWorkflowDrawer
        open={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        onSaved={async () => {
          if (!recordId) return;
          try {
            const [rec, act] = await Promise.all([
              api.get(`/records/${recordId}`).then((r) => r.data.data),
              api.get(`/actions/for-record/${recordId}`).then((r) => r.data.data).catch(() => null),
            ]);
            setRecord(rec);
            setActionDoc(act);
          } catch {
            /* ignore */
          }
        }}
        recordId={recordId}
        action={actionDoc}
      />
    </Sheet>
  );
}

function InfoCell({ label, value, tone = "default", bold = false, icon: Icon }) {
  const color = tone === "crit" ? "text-gov-crit" : "text-gov-navy";
  return (
    <div className="border border-gov-border rounded-sm p-3 bg-gov-slate/40">
      <div className="text-[9px] uppercase tracking-[0.14em] text-gov-muted font-data">{label}</div>
      <div className={`font-data ${bold ? "font-bold text-[16px]" : "font-semibold text-[14px]"} ${color} mt-1`}>
        {value || "—"}
      </div>
    </div>
  );
}
