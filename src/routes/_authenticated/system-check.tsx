import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { SCHEMA_COLUMNS } from "@/lib/schema-smoke";
import { PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/components/app/states";

export const Route = createFileRoute("/_authenticated/system-check")({
  head: () => pageHead("System Check — Gokul Cargo Movers", "System Check records for Gokul Cargo Movers transport management."),
  component: SystemCheck,
});

type Result = { name: string; ok: boolean; detail: string };

function SystemCheck() {
  const { businessId, businessName, role } = useBusiness();
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const out: Result[] = [];
    const push = (r: Result) => { out.push(r); setResults([...out]); };
    try {
      const { error } = await supabase.from("businesses").select("id").limit(1);
      push({ name: "Database connected", ok: !error, detail: error ? errorMessage(error) : "OK" });
      push({ name: "Business loaded", ok: !!businessId, detail: `${businessName}` });
      const { data: rls, error: rErr } = await supabase.rpc("system_rls_status");
      if (rErr) push({ name: "Row security on every table", ok: false, detail: errorMessage(rErr) });
      else {
        const off = (rls ?? []).filter((t) => !t.rls_enabled).map((t) => t.table_name);
        push({ name: "Row security on every table", ok: off.length === 0 && (rls ?? []).length > 0, detail: off.length ? `OFF on: ${off.join(", ")}` : `ON for all ${(rls ?? []).length} tables` });
      }
      const a = await supabase.rpc("next_doc_number", { p_business_id: businessId, p_doc_type: "system_check" });
      const b = await supabase.rpc("next_doc_number", { p_business_id: businessId, p_doc_type: "system_check" });
      const numOk = !a.error && !b.error && a.data !== b.data;
      push({ name: "Numbering gives unique numbers", ok: numOk, detail: a.error || b.error ? errorMessage(a.error ?? b.error) : `Call 1: ${a.data}, Call 2: ${b.data}` });
      const failures: string[] = [];
      for (const [table, cols] of Object.entries(SCHEMA_COLUMNS)) {
        const { error: e } = await supabase.from(table as never).select(cols.join(",")).limit(1);
        if (e) failures.push(`${table}: ${e.message}`);
      }
      push({ name: "Schema smoke test", ok: failures.length === 0, detail: failures.length ? failures.join(" | ") : `All ${Object.keys(SCHEMA_COLUMNS).length} tables and their columns found` });
    } catch (e) {
      push({ name: "Unexpected error", ok: false, detail: errorMessage(e) });
    } finally { setRunning(false); }
  }

  if (role !== "owner") return <p>Only an Owner can open this page.</p>;
  return (
    <div>
      <PageHeader title="System Check" description="Quick health check of the database and security." actions={<Button onClick={run} disabled={running}>{running ? "Checking…" : "Run checks"}</Button>} />
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.name} className="flex items-start gap-3 rounded-lg border bg-card p-3">
            {r.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : <XCircle className="mt-0.5 h-5 w-5 text-destructive" />}
            <div><p className="font-medium">{r.name}</p><p className="text-sm text-muted-foreground">{r.detail}</p></div>
          </li>
        ))}
        {running && <li className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Running…</li>}
        {!running && results.length === 0 && <p className="text-sm text-muted-foreground">Press "Run checks" to start.</p>}
      </ul>
    </div>
  );
}
