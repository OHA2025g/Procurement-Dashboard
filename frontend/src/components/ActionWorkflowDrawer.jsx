import React, { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, fmtCr } from "@/lib/api";
import { toast } from "sonner";

export default function ActionWorkflowDrawer({ open, onClose, onSaved, recordId, action }) {
  const [hist, setHist] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [assignTo, setAssignTo] = useState("");

  const loadHistory = useCallback(async () => {
    if (!recordId) return;
    try {
      const r = await api.get(`/actions/history/${recordId}`);
      setHist(r.data.data || []);
    } catch {
      setHist([]);
    }
  }, [recordId]);

  useEffect(() => {
    if (open && recordId) loadHistory();
  }, [open, recordId, loadHistory]);

  useEffect(() => {
    if (action?.assigned_to != null) setAssignTo(action.assigned_to || "");
  }, [action?.assigned_to, action?.action_id]);

  if (!action?.action_id) return null;

  const aid = action.action_id;

  async function post(path, body) {
    try {
      await api.post(path, body);
      toast.success("Updated");
      setRemarks("");
      await loadHistory();
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Request failed");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose?.();
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">Action workflow</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4 text-[12px]">
          <div className="border border-gov-border rounded-sm p-3 bg-gov-slate/40">
            <div className="text-[10px] uppercase text-gov-muted font-data">Action ID</div>
            <div className="font-mono text-[11px]">{aid}</div>
            <div className="text-[10px] uppercase text-gov-muted font-data mt-2">Status</div>
            <div className="font-semibold">{action.action_status}</div>
            <div className="text-[10px] uppercase text-gov-muted font-data mt-2">Record value</div>
            <div>₹ {fmtCr(action.procurement_value)} Cr</div>
          </div>

          <div>
            <label className="text-[10px] uppercase font-data text-gov-muted">Assign to</label>
            <input
              className="mt-1 w-full border border-gov-border rounded-sm px-2 py-1.5 text-[12px]"
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              placeholder="Owner / desk"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-data text-gov-muted">Remarks</label>
            <textarea
              className="mt-1 w-full border border-gov-border rounded-sm px-2 py-1.5 text-[12px] min-h-[56px]"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => post(`/actions/${aid}/assign`, { assigned_to: assignTo || action.assigned_to, remarks })}>
              Assign
            </Button>
            <Button size="sm" variant="outline" onClick={() => post(`/actions/${aid}/status`, { action_status: "In Progress", remarks })}>
              In progress
            </Button>
            <Button size="sm" variant="outline" onClick={() => post(`/actions/${aid}/status`, { action_status: "Waiting for Department", remarks })}>
              Wait Dept
            </Button>
            <Button size="sm" variant="outline" onClick={() => post(`/actions/${aid}/status`, { action_status: "Waiting for Finance", remarks })}>
              Wait Finance
            </Button>
            <Button size="sm" variant="secondary" onClick={() => post(`/actions/${aid}/escalate`, { escalation_level: "Senior Official / Secretary Review", remarks })}>
              Escalate
            </Button>
            <Button size="sm" onClick={() => post(`/actions/${aid}/close`, { remarks })}>Close</Button>
            <Button size="sm" variant="destructive" onClick={() => post(`/actions/${aid}/reopen`, { remarks })}>Reopen</Button>
          </div>

          <div>
            <div className="text-[10px] uppercase font-data text-gov-muted mb-2">History</div>
            <div className="max-h-48 overflow-y-auto space-y-2 border border-gov-border rounded-sm p-2">
              {hist.length === 0 && <div className="text-gov-muted">No history.</div>}
              {hist.map((h) => (
                <div key={h.history_id} className="border-b border-gov-border pb-2">
                  <div className="font-data text-[10px] text-gov-muted">{h.changed_at} · {h.event_type} · {h.changed_by}</div>
                  <div className="text-[11px]">{h.remarks || "—"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
