import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setupFirstBusiness } from "@/lib/api/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui";
import { LoadingState, ErrorState, errorMessage } from "@/components/app/states";
import { AuthCard } from "./auth";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "First-time setup — Gokul Cargo Movers" },
      { name: "description", content: "Create the Gokul Cargo Movers business and first Owner account." },
      { property: "og:title", content: "First-time setup — Gokul Cargo Movers" },
      { property: "og:description", content: "Create the Gokul Cargo Movers business and first Owner account." },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const nav = useNavigate();
  const [f, setF] = useState({ displayName: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["setup-available"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("setup_available");
      if (error) throw error;
      return data as boolean;
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (f.password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    setBusy(true); setErr(null);
    try {
      await setupFirstBusiness({ data: f });
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
      if (error) throw error;
      nav({ to: "/dashboard" });
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  }

  if (q.isPending) return <AuthCard title="First-time setup"><LoadingState /></AuthCard>;
  if (q.isError) return <AuthCard title="First-time setup"><ErrorState error={q.error} onRetry={() => q.refetch()} /></AuthCard>;
  if (!q.data) return (
    <AuthCard title="Setup already completed">
      <p className="mb-4 text-sm">The business is already set up. Please sign in.</p>
      <Button asChild><Link to="/auth">Go to sign in</Link></Button>
    </AuthCard>
  );
  return (
    <AuthCard title="Create the business and the first Owner account">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="rounded-md bg-muted p-2 text-sm">Business name: <b>Gokul Cargo Movers</b></p>
        <Field label="Your name" required><Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required /></Field>
        <Field label="Email" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Password" required hint="At least 8 characters"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        {err && <p className="rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create business & Owner"}</Button>
      </form>
    </AuthCard>
  );
}
