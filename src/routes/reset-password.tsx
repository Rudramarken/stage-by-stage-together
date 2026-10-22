import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui";
import { errorMessage } from "@/components/app/states";
import { AuthCard } from "./auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Set new password — Gokul Cargo Movers" },
      { name: "description", content: "Choose a new password for your account." },
      { property: "og:title", content: "Set new password — Gokul Cargo Movers" },
      { property: "og:description", content: "Choose a new password for your account." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw.length < 8) { setErr("Password must be at least 8 characters"); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return; }
    nav({ to: "/dashboard" });
  }
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="New password" required><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {err && <p className="rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
      </form>
    </AuthCard>
  );
}
