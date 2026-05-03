import React, { useEffect, useState, useRef } from "react";
import Layout from "@/components/Layout";
import { api, API_BASE } from "@/lib/api";
import { Upload, Database, Users, FileCheck2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

function excelFilesFromList(fileList) {
  return Array.from(fileList || []).filter((f) => /\.(xlsx|xls)$/i.test(f.name));
}

export default function Admin() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [replace, setReplace] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [batches, setBatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef();
  const previewInputRef = useRef();

  useEffect(() => {
    api.get("/admin/uploads").then((r) => setUploads(r.data.data || []));
    api.get("/admin/users").then((r) => setUsers(r.data.data || []));
    api.get("/admin/upload-batches").then((r) => setBatches(r.data.data || [])).catch(() => setBatches([]));
  }, []);

  async function upload() {
    if (!files.length) return toast.error("Please select at least one file");
    setUploading(true);
    try {
      const token = localStorage.getItem("proc_token");
      let totalInserted = 0;
      let aggregateStats = { total: 0, skipped: 0, errors: 0 };
      let lastPayload = null;

      for (let i = 0; i < files.length; i += 1) {
        const useReplace = replace && i === 0;
        const form = new FormData();
        form.append("file", files[i]);
        const res = await fetch(`${API_BASE}/admin/upload?replace=${useReplace}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(
            data?.detail || data?.error?.message || `Upload failed for “${files[i].name}”`
          );
        }
        const d = data.data;
        totalInserted += d.records_inserted || 0;
        aggregateStats.total += d.stats?.total || 0;
        aggregateStats.skipped += d.stats?.skipped || 0;
        aggregateStats.errors += d.stats?.errors || 0;
        lastPayload = d;
      }

      setLastResult({
        ...lastPayload,
        records_inserted: totalInserted,
        stats: aggregateStats,
        _batchCount: files.length,
      });
      toast.success(
        `Ingested ${totalInserted} records from ${files.length} file${files.length === 1 ? "" : "s"}`
      );
      const r = await api.get("/admin/uploads");
      setUploads(r.data.data || []);
      const b = await api.get("/admin/upload-batches");
      setBatches(b.data.data || []);
      setFiles([]);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const picked = excelFilesFromList(e.dataTransfer.files);
    if (picked.length) setFiles(picked);
    else if (e.dataTransfer.files?.length) toast.error("Only .xlsx / .xls files are accepted");
  }

  return (
    <Layout title="Data Management" subtitle="Upload procurement datasets & manage users (Super Admin only)" page="admin" showFilterBar={false} showExport={false}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Upload Card */}
        <div className="lg:col-span-2 bg-white border border-gov-border rounded-sm shadow-card p-6" data-testid="upload-card">
          <div className="flex items-center gap-2 mb-4">
            <Upload size={18} className="text-gov-gold" />
            <h2 className="font-heading text-[18px] text-gov-navy">Upload Procurement Excel</h2>
          </div>
          <p className="text-[12px] text-gov-muted mb-4">
            Supports the standard ABCD-format workbook with 8 sheets:
            <span className="font-data text-gov-navy"> A/B/C/D × Medicine/Equipment.</span>
            ETL pipeline auto-detects headers, parses ₹ values, classifies statements, computes risk & next action.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-colors ${
              dragActive ? "border-gov-gold bg-gov-gold/5" : "border-gov-border hover:border-gov-navy-mid"
            }`}
            data-testid="upload-zone"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={(e) => {
                const picked = excelFilesFromList(e.target.files);
                if (picked.length) setFiles(picked);
                e.target.value = "";
              }}
              className="hidden"
              data-testid="file-input"
            />
            <Upload size={28} className="mx-auto text-gov-muted mb-2" />
            {files.length ? (
              <div className="text-left max-h-40 overflow-y-auto space-y-1">
                <div className="text-[12px] text-gov-navy font-semibold mb-2">
                  {files.length} file{files.length === 1 ? "" : "s"} selected
                </div>
                {files.map((f) => (
                  <div key={`${f.name}-${f.size}`} className="text-[12px] text-gov-navy font-data">
                    {f.name} · {(f.size / 1024).toFixed(1)} KB
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="text-[13px] text-gov-navy">Drop .xlsx/.xls here, or click to browse (multiple files OK)</div>
                <div className="text-[11px] text-gov-muted mt-1 font-data">Max 20 MB each · Headers must include &quot;Sr No&quot;, &quot;Name of Item&quot;, etc.</div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4 text-[12px] font-data">
            <Switch checked={replace} onCheckedChange={setReplace} data-testid="replace-toggle" />
            <span className="text-gov-navy-mid">
              Replace existing records on first file only, then append remaining files
            </span>
          </div>

          <div className="mt-4 flex gap-3">
            <Button onClick={upload} disabled={!files.length || uploading} data-testid="upload-submit" className="bg-gov-navy hover:bg-gov-navy-mid text-white font-data uppercase text-[12px] tracking-wider">
              {uploading ? "Uploading…" : "Upload & Ingest"}
            </Button>
            <Button variant="outline" onClick={() => { setFiles([]); setLastResult(null); }} className="font-data uppercase text-[12px] tracking-wider">
              Reset
            </Button>
          </div>

          {lastResult && (
            <div className="mt-6 border-l-4 border-gov-med bg-gov-med/5 p-4 rounded-sm">
              <div className="flex items-center gap-2 text-[12px] font-data">
                <CheckCircle2 size={14} className="text-gov-med" />
                <span className="font-semibold text-gov-med">Ingestion complete</span>
                {lastResult._batchCount > 1 && (
                  <span className="text-gov-muted font-normal">
                    ({lastResult._batchCount} files)
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-3 text-[11px] font-data">
                <IngestStat label="Total Rows" val={lastResult.stats?.total || 0} />
                <IngestStat label="Inserted" val={lastResult.records_inserted} good />
                <IngestStat label="Skipped" val={lastResult.stats?.skipped || 0} />
                <IngestStat label="Errors" val={lastResult.stats?.errors || 0} bad />
              </div>
            </div>
          )}
        </div>

        {/* System Status */}
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-6" data-testid="system-status">
          <div className="flex items-center gap-2 mb-4">
            <Database size={18} className="text-gov-gold" />
            <h2 className="font-heading text-[18px] text-gov-navy">System Status</h2>
          </div>
          <div className="space-y-3 text-[12px] font-data">
            <StatusRow label="Users Seeded" value={users.length} />
            <StatusRow label="Total Uploads" value={uploads.length} />
            <StatusRow label="Data Source" value="abcd.xlsx" />
            <StatusRow label="ETL Pipeline" value="Active" ok />
            <StatusRow label="KPI Cache" value="Disabled (live)" />
            <StatusRow label="Auth" value="JWT + bcrypt" ok />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gov-border rounded-sm shadow-card p-6 mb-6" data-testid="staged-upload">
        <h2 className="font-heading text-[16px] text-gov-navy mb-2">CSV / Excel — Preview &amp; commit</h2>
        <p className="text-[12px] text-gov-muted mb-3">
          Upload a <span className="font-data">.csv</span> or workbook for validation, data-quality score, then commit or rollback by batch.
        </p>
        <input
          ref={previewInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPreviewLoading(true);
            try {
              const token = localStorage.getItem("proc_token");
              const form = new FormData();
              form.append("file", file);
              const res = await fetch(`${API_BASE}/admin/upload/preview`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: form,
              });
              const json = await res.json();
              if (!res.ok || !json.success) throw new Error(json.detail || "Preview failed");
              setPreview(json.data);
              toast.success(`Preview ready · DQ ${json.data?.data_quality_score ?? "—"}`);
            } catch (err) {
              toast.error(err.message);
              setPreview(null);
            } finally {
              setPreviewLoading(false);
              e.target.value = "";
            }
          }}
        />
        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" variant="outline" className="font-data text-[12px]" onClick={() => previewInputRef.current?.click()} disabled={previewLoading}>
            {previewLoading ? "Parsing…" : "Choose file & preview"}
          </Button>
          {preview?.batch_id && (
            <>
              <Button
                type="button"
                className="bg-gov-med text-white font-data text-[12px]"
                onClick={async () => {
                  try {
                    await api.post("/admin/upload/commit", { batch_id: preview.batch_id, replace });
                    toast.success("Batch committed");
                    setPreview(null);
                    const b = await api.get("/admin/upload-batches");
                    setBatches(b.data.data || []);
                  } catch (err) {
                    toast.error(err?.response?.data?.detail || "Commit failed");
                  }
                }}
              >
                Commit batch
              </Button>
              <span className="text-[11px] font-data text-gov-muted">
                batch <code>{preview.batch_id}</code> · rows {preview.row_count} · DQ {preview.data_quality_score}
              </span>
            </>
          )}
        </div>
        {preview?.preview?.length > 0 && (
          <div className="mt-4 overflow-x-auto max-h-56 border border-gov-border rounded-sm">
            <table className="w-full text-[11px] font-data">
              <thead>
                <tr className="bg-gov-slate text-gov-muted">
                  <th className="text-left px-2 py-1">Item</th>
                  <th className="text-left px-2 py-1">Dept</th>
                  <th className="text-right px-2 py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.slice(0, 20).map((row) => (
                  <tr key={row.id} className="border-t border-gov-border">
                    <td className="px-2 py-1 max-w-xs truncate">{row.item_description}</td>
                    <td className="px-2 py-1">{row.department}</td>
                    <td className="px-2 py-1 text-right">{row.procurement_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {batches.length > 0 && (
        <div className="bg-white border border-gov-border rounded-sm shadow-card mb-6 p-5" data-testid="upload-batches">
          <div className="font-heading text-[15px] text-gov-navy mb-3">Upload batches</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] font-data">
              <thead>
                <tr className="text-gov-muted text-[10px] uppercase">
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-right py-2">Rows</th>
                  <th className="text-right py-2">DQ</th>
                  <th className="text-right py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-t border-gov-border">
                    <td className="py-2 pr-2 font-mono text-[10px]">{b.id?.slice(0, 12)}…</td>
                    <td className="py-2">{b.status}</td>
                    <td className="py-2 text-right">{b.row_count ?? b.records_inserted ?? "—"}</td>
                    <td className="py-2 text-right">{b.data_quality_score ?? "—"}</td>
                    <td className="py-2 text-right">
                      {b.status === "committed" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-gov-crit text-[11px]"
                          onClick={async () => {
                            if (!window.confirm("Rollback this batch? Deletes all records with this batch_id.")) return;
                            await api.delete(`/admin/upload-batches/${b.id}`);
                            toast.success("Rolled back");
                            setBatches((await api.get("/admin/upload-batches")).data.data || []);
                          }}
                        >
                          Rollback
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload History */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card mb-6" data-testid="upload-history">
        <div className="px-5 py-4 border-b border-gov-border flex items-center gap-2">
          <FileCheck2 size={16} className="text-gov-gold" />
          <div className="font-heading text-[15px] text-gov-navy">Ingestion History</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                <th className="text-left px-4 py-2.5">File</th>
                <th className="text-left px-4 py-2.5">Uploaded By</th>
                <th className="text-left px-4 py-2.5">Uploaded At</th>
                <th className="text-right px-4 py-2.5 w-24">Inserted</th>
                <th className="text-right px-4 py-2.5 w-24">Total</th>
                <th className="text-right px-4 py-2.5 w-24">Errors</th>
                <th className="text-left px-4 py-2.5 w-24">Mode</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-b border-gov-border">
                  <td className="px-4 py-2.5 font-data">{u.file_name}</td>
                  <td className="px-4 py-2.5">{u.uploaded_by}</td>
                  <td className="px-4 py-2.5 font-data text-gov-muted">{new Date(u.uploaded_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5 text-right stat-num text-gov-med font-semibold">{u.records_inserted}</td>
                  <td className="px-4 py-2.5 text-right stat-num">{u.stats?.total || 0}</td>
                  <td className="px-4 py-2.5 text-right stat-num" style={{ color: u.stats?.errors ? "#C0392B" : "#5B6780" }}>{u.stats?.errors || 0}</td>
                  <td className="px-4 py-2.5 font-data text-[10px] uppercase">{u.replaced ? "Replace" : "Append"}</td>
                </tr>
              ))}
              {uploads.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-gov-muted">No uploads yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="users-table">
        <div className="px-5 py-4 border-b border-gov-border flex items-center gap-2">
          <Users size={16} className="text-gov-gold" />
          <div className="font-heading text-[15px] text-gov-navy">System Users</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5">Role</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gov-border">
                  <td className="px-4 py-2.5 font-semibold">{u.name}</td>
                  <td className="px-4 py-2.5 font-data">{u.email}</td>
                  <td className="px-4 py-2.5 font-data text-[11px] uppercase text-gov-gold">{u.role.replaceAll("_", " ")}</td>
                  <td className="px-4 py-2.5 font-data text-gov-muted">{u.department || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] uppercase font-data font-semibold px-2 py-0.5 rounded-sm ${u.is_active ? "bg-gov-med/10 text-gov-med" : "bg-gov-crit/10 text-gov-crit"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-data text-[11px] text-gov-muted">
                    {u.last_login ? new Date(u.last_login).toLocaleString("en-IN") : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function IngestStat({ label, val, good, bad }) {
  const color = good ? "#0D8E74" : bad && val ? "#C0392B" : "#0B1F3A";
  return (
    <div className="bg-white border border-gov-border rounded-sm p-2">
      <div className="text-[9px] uppercase tracking-wider text-gov-muted">{label}</div>
      <div className="stat-num text-[15px] font-bold" style={{ color }}>{val}</div>
    </div>
  );
}
function StatusRow({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between border-b border-gov-border pb-2 last:border-0">
      <span className="text-gov-muted">{label}</span>
      <span className={`font-semibold ${ok ? "text-gov-med" : "text-gov-navy"}`}>{value}</span>
    </div>
  );
}
