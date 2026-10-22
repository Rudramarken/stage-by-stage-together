import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "./states";
import { removalConfirmationValid } from "@/lib/removal";

export type RemovalTarget = { table: string; id: string; label: string; action: "cancel" | "delete" | "reverse" | "archive" | "restore" };
export function RemovalDialog({ target, onClose, onDone }: { target: RemovalTarget | null; onClose: () => void; onDone?: () => void }) {
  return target ? <RemovalForm key={`${target.id}-${target.action}`} target={target} onClose={onClose} onDone={onDone} /> : null;
}
function RemovalForm({ target, onClose, onDone }: { target: RemovalTarget; onClose: () => void; onDone?: () => void }) {
  const qc = useQueryClient(); const lock = useRef(false);
  const [reason, setReason] = useState(""); const [typed, setTyped] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const verb = { cancel: "Cancel", delete: "Delete permanently", reverse: "Reverse", archive: "Archive", restore: "Restore" }[target.action];
  async function confirm() {
    if (lock.current || !removalConfirmationValid(target.action, target.label, reason, typed)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const { error: e } = await supabase.rpc("remove_record", { p_table: target.table, p_id: target.id, p_action: target.action, p_reason: reason.trim(), p_confirmation: typed });
      if (e) throw e;
      await qc.invalidateQueries(); toast.success(`${target.label}: ${verb} confirmed`); onClose(); onDone?.();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); lock.current = false; }
  }
  return <Dialog open onOpenChange={(o) => !o && !busy && onClose()}><DialogContent><DialogHeader><DialogTitle>{verb}: {target.label}?</DialogTitle><DialogDescription>{target.action === "delete" ? "This cannot be undone. Only this record and its own automatic postings are removed. Payment or transaction history blocks deletion; cancel or archive instead." : target.action === "archive" ? "Hide from active lists and keep all history." : target.action === "restore" ? "Return this record to active lists." : "Financial history is kept with offsetting reversal entries. Linked active payments must be reversed first."}</DialogDescription></DialogHeader>
    {target.action === "delete" ? <label className="space-y-2 text-sm">Type {target.label} to confirm<Input aria-label="Confirmation number" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} /></label> : !["archive", "restore"].includes(target.action) && <label className="space-y-2 text-sm">Reason (required)<Textarea aria-label="Removal reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} /></label>}
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Go back</Button><Button variant={target.action === "restore" ? "default" : "destructive"} disabled={busy || !removalConfirmationValid(target.action, target.label, reason, typed)} onClick={confirm}>{busy ? "Confirming…" : error ? "Retry" : verb}</Button></DialogFooter>
  </DialogContent></Dialog>;
}