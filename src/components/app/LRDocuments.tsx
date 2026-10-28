import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Paperclip, Trash2, Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useBusiness } from "@/lib/business";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "./states";

const BUCKET = "lr-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP" };
type Doc = { id: string; file_name: string; storage_path: string; mime_type: string; size_bytes: number; created_at: string };
// lr_documents is created by migration 0017 and is not in the generated Supabase types yet.
const docsTable = () => supabase.from("lr_documents" as never) as any;

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-80) || "document";

/** Optional documents for one LR. Files go to the PRIVATE bucket; they are opened only through short-lived signed links. */
export function LRDocuments({ lrId, readOnly }: { lrId: string; readOnly?: boolean }) {
  const { businessId } = useBusiness();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["lr-documents", lrId],
    queryFn: async () => {
      const { data, error } = await docsTable().select("id, file_name, storage_path, mime_type, size_bytes, created_at").eq("lr_id", lrId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!TYPES[file.type]) throw new Error("Only PDF, JPEG, PNG or WebP files can be added");
      if (file.size <= 0) throw new Error("That file is empty");
      if (file.size > MAX_BYTES) throw new Error("File is larger than 10 MB");
      const path = `${businessId}/${lrId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await docsTable().insert({ lr_id: lrId, file_name: file.name.slice(0, 200), storage_path: path, mime_type: file.type, size_bytes: file.size });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]); // do not leave an orphan file behind
        throw error;
      }
    },
    onSuccess: () => { setErr(null); toast.success("Document added"); qc.invalidateQueries({ queryKey: ["lr-documents", lrId] }); },
    onError: (e) => setErr(errorMessage(e)),
    onSettled: () => { if (input.current) input.current.value = ""; },
  });
  const remove = useMutation({
    mutationFn: async (d: Doc) => {
      const { error } = await docsTable().delete().eq("id", d.id);
      if (error) throw error;
      const r = await supabase.storage.from(BUCKET).remove([d.storage_path]);
      if (r.error) throw r.error;
    },
    onSuccess: () => { toast.success("Document removed"); qc.invalidateQueries({ queryKey: ["lr-documents", lrId] }); },
    onError: (e) => { toast.error(errorMessage(e)); qc.invalidateQueries({ queryKey: ["lr-documents", lrId] }); },
  });
  async function open(d: Doc, download: boolean) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 60, download ? { download: d.file_name } : undefined);
    if (error || !data?.signedUrl) { toast.error(error ? errorMessage(error) : "Could not open the document"); return; }
    if (download) { const a = document.createElement("a"); a.href = data.signedUrl; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="no-print rounded-lg border bg-card p-4 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium"><Paperclip className="mr-1 inline h-4 w-4" />Documents <span className="text-xs font-normal text-muted-foreground">(optional · PDF, JPEG, PNG, WebP · max 10 MB)</span></p>
        {!readOnly && <>
          <input ref={input} type="file" className="sr-only" aria-label="Add LR document" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setErr(null); upload.mutate(f); } }} />
          <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>{upload.isPending ? "Uploading…" : "Add Document"}</Button>
        </>}
      </div>
      {err && <p role="alert" className="mb-2 rounded bg-destructive/10 p-2 text-destructive">{err}{/bucket|not found|relation|lr_documents|policy/i.test(err) ? " — document storage may not be set up yet (run migration 0017)." : ""}</p>}
      {q.isPending ? <p className="text-muted-foreground">Loading documents…</p>
        : q.isError ? <p className="text-muted-foreground">Documents are not available yet ({errorMessage(q.error)}). The rest of the LR works normally; run migration 0017 to enable documents.</p>
        : q.data.length === 0 ? <p className="text-muted-foreground">No documents added.</p>
        : <ul className="divide-y">{q.data.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
            {d.mime_type === "application/pdf" ? <FileText className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1 break-words">{d.file_name}<span className="block text-xs text-muted-foreground">{TYPES[d.mime_type] ?? d.mime_type} · {size(Number(d.size_bytes))} · {formatDateTime(d.created_at)}</span></span>
            <Button type="button" variant="ghost" size="sm" onClick={() => open(d, false)}><ExternalLink className="mr-1 h-4 w-4" />Open</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => open(d, true)}><Download className="mr-1 h-4 w-4" />Download</Button>
            {!readOnly && <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${d.file_name}`} disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove "${d.file_name}"?`)) remove.mutate(d); }}><Trash2 className="h-4 w-4" /></Button>}
          </li>))}</ul>}
    </div>
  );
}
