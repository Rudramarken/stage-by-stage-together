import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Archive, ArchiveRestore, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusBadge, Field, ConfirmDialog } from "./ui";
import { LoadingState, ErrorState, EmptyState, errorMessage } from "./states";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "date" | "number" | "multi" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  full?: boolean;
  showIf?: (v: Record<string, unknown>) => boolean;
};

export type ColumnDef = { label: string; render: (row: Record<string, any>) => ReactNode };

type Props = {
  table: "parties" | "drivers" | "vehicles" | "routes" | "transporters" | "payment_accounts";
  title: string;
  description?: string;
  singular: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  searchKeys: string[];
  orderBy: string;
  filters?: ReactNode;
  filterFn?: (row: Record<string, any>) => boolean;
  validate?: (v: Record<string, any>) => string | null;
  defaults?: Record<string, unknown>;
  canArchive?: (row: Record<string, any>) => boolean;
  rowLink?: (row: Record<string, any>) => ReactNode;
  hideHeader?: boolean;
  transform?: (v: Record<string, any>) => Record<string, any>;
};

const PAGE = 25;

export function MasterCrud(p: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Record<string, any> | null>(null);

  const q = useQuery({
    queryKey: [p.table],
    queryFn: async () => {
      const { data, error } = await supabase.from(p.table).select("*").order(p.orderBy, { ascending: true });
      if (error) throw error;
      return data as Record<string, any>[];
    },
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((r) => {
      if (status === "active" && !r.is_active) return false;
      if (status === "archived" && r.is_active) return false;
      if (p.filterFn && !p.filterFn(r)) return false;
      if (!s) return true;
      return p.searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(s));
    });
  }, [q.data, search, status, p]);

  const save = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const payload = p.transform ? p.transform(values) : values;
      delete payload.id; delete payload.business_id; delete payload.created_at; delete payload.updated_at; delete payload.created_by;
      for (const k of Object.keys(payload)) if (k.endsWith("_normalized")) delete payload[k];
      if (editing?.id) {
        const { data, error } = await supabase.from(p.table).update(payload as never).eq("id", editing.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from(p.table).insert(payload as never).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`${p.singular} saved`);
      setEditing(null);
      qc.invalidateQueries({ queryKey: [p.table] });
    },
    onError: (e) => setFormErr(friendly(errorMessage(e), p.singular)),
  });

  const archive = useMutation({
    mutationFn: async (row: Record<string, any>) => {
      const { error } = await supabase.from(p.table).update({ is_active: !row.is_active } as never).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: [p.table] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function openForm(row?: Record<string, any>) {
    setFormErr(null);
    setEditing(row ?? {});
    setForm(row ? { ...row } : { ...(p.defaults ?? {}) });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    for (const f of p.fields) {
      if (f.required && (f.showIf ? f.showIf(form) : true) && (form[f.name] == null || String(form[f.name]).trim() === "" || (Array.isArray(form[f.name]) && form[f.name].length === 0))) {
        setFormErr(`${f.label} is required`); return;
      }
      if (f.type === "number" && form[f.name] !== "" && form[f.name] != null && Number(form[f.name]) < 0) {
        setFormErr(`${f.label} cannot be negative`); return;
      }
    }
    const v = p.validate?.(form);
    if (v) { setFormErr(v); return; }
    const clean: Record<string, any> = {};
    for (const f of p.fields) {
      let val = form[f.name];
      if (f.type === "number") val = val === "" || val == null ? null : Number(val);
      if ((f.type === "date" || f.type === "text" || f.type === "textarea") && val === "") val = null;
      clean[f.name] = val;
    }
    save.mutate(clean);
  }

  const paged = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  return (
    <div>
      {!p.hideHeader && (
        <PageHeader title={p.title} description={p.description}
          actions={<Button onClick={() => openForm()}><Plus className="mr-1 h-4 w-4" />Add {p.singular}</Button>} />
      )}
      {p.hideHeader && <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => openForm()}><Plus className="mr-1 h-4 w-4" />Add {p.singular}</Button></div>}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        {p.filters}
        <select className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value as never); setPage(0); }}>
          <option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option>
        </select>
      </div>

      {q.isPending ? <LoadingState onRetry={() => q.refetch()} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        rows.length === 0 ? (
          <EmptyState title={(q.data?.length ?? 0) === 0 ? `No ${p.title.toLowerCase()} yet` : "No matches"}
            hint={(q.data?.length ?? 0) === 0 ? `Add your first ${p.singular.toLowerCase()} to get started.` : "Try a different search or filter."}
            action={(q.data?.length ?? 0) === 0 ? <Button onClick={() => openForm()}><Plus className="mr-1 h-4 w-4" />Add {p.singular}</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow>
                {p.columns.map((c) => <TableHead key={c.label}>{c.label}</TableHead>)}
                <TableHead>Status</TableHead><TableHead className="text-right no-print">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow key={r.id}>
                    {p.columns.map((c) => <TableCell key={c.label}>{c.render(r)}</TableCell>)}
                    <TableCell>{r.is_active ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge>Archived</StatusBadge>}</TableCell>
                    <TableCell className="whitespace-nowrap text-right no-print">
                      {p.rowLink?.(r)}
                      <Button variant="ghost" size="sm" onClick={() => openForm(r)}><Pencil className="h-4 w-4" /></Button>
                      {(p.canArchive?.(r) ?? true) && (
                        <Button variant="ghost" size="sm" title={r.is_active ? "Archive" : "Restore"} onClick={() => setConfirm(r)}>
                          {r.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
              <span>{rows.length} record(s)</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <span>Page {page + 1} of {pages}</span>
                <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </div>
        )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && !save.isPending && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? `Edit ${p.singular}` : `Add ${p.singular}`}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {p.fields.filter((f) => !f.showIf || f.showIf(form)).map((f) => (
              <div key={f.name} className={f.full || f.type === "textarea" || f.type === "multi" ? "sm:col-span-2" : ""}>
                <Field label={f.label} required={f.required} hint={f.hint}>
                  {renderInput(f, form, setForm)}
                </Field>
              </div>
            ))}
            {formErr && <p className="sm:col-span-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{formErr}</p>}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.is_active ? `Archive this ${p.singular.toLowerCase()}?` : `Restore this ${p.singular.toLowerCase()}?`}
        description={confirm?.is_active ? "It will be hidden from pickers but all history is kept. Nothing is deleted." : "It will appear in pickers again."}
        confirmLabel={confirm?.is_active ? "Archive" : "Restore"}
        onConfirm={() => { if (confirm) archive.mutate(confirm); setConfirm(null); }} />
    </div>
  );
}

function friendly(msg: string, singular: string) {
  if (/duplicate key|unique/i.test(msg)) return `A ${singular.toLowerCase()} with this name/number already exists. Please use the existing one.`;
  return msg;
}

function renderInput(f: FieldDef, form: Record<string, any>, setForm: (v: Record<string, any>) => void) {
  const v = form[f.name];
  const set = (val: unknown) => setForm({ ...form, [f.name]: val });
  switch (f.type) {
    case "textarea": return <Textarea value={v ?? ""} onChange={(e) => set(e.target.value)} />;
    case "date": return <Input type="date" value={v ?? ""} onChange={(e) => set(e.target.value)} />;
    case "number": return <Input type="number" step="0.01" min="0" value={v ?? ""} onChange={(e) => set(e.target.value)} />;
    case "select": return (
      <select className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={v ?? ""} onChange={(e) => set(e.target.value)}>
        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>);
    case "multi": {
      const arr: string[] = Array.isArray(v) ? v : [];
      return (
        <div className="flex flex-wrap gap-3">
          {f.options?.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={arr.includes(o.value)} onCheckedChange={(c) => set(c ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
              {o.label}
            </label>
          ))}
        </div>);
    }
    default: return <Input value={v ?? ""} onChange={(e) => set(e.target.value)} />;
  }
}
