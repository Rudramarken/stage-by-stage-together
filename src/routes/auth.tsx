import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui";
import { errorMessage } from "@/components/app/states";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Gokul Cargo Movers" },
      { name: "description", content: "Sign in to Gokul Cargo Movers transport management." },
      { property: "og:title", content: "Sign in — Gokul Cargo Movers" },
      { property: "og:description", content: "Sign in to Gokul Cargo Movers transport management." },
    ],
  }),
  component: AuthPage,
});

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-md rounded-xl bg-card p-8 shadow-xl">
        <p className="font-display text-2xl font-semibold text-primary">Gokul Cargo Movers</p>
        <p className="mb-6 text-sm text-muted-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "err" | "ok"; text: string } | null>(null);
  const setup = useQuery({
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
    setBusy(true); setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        nav({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMsg({ tone: "ok", text: "If this email has an account, a reset link has been sent. Check your inbox." });
      }
    } catch (err) {
      setMsg({ tone: "err", text: errorMessage(err) });
    } finally { setBusy(false); }
  }

  return (
    <AuthCard title={mode === "signin" ? "Sign in to continue" : "Reset your password"}>
      {setup.data === true && (
        <div className="mb-4 rounded-md border border-info/30 bg-accent p-3 text-sm">
          First time here? <Link to="/setup" className="font-medium underline">Set up the business</Link>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" required><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        {mode === "signin" && (
          <Field label="Password" required><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        )}
        {msg && <p className={msg.tone === "err" ? "rounded bg-destructive/10 p-2 text-sm text-destructive" : "rounded bg-success/10 p-2 text-sm text-success"}>{msg.text}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Send reset link"}</Button>
        <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { setMode(mode === "signin" ? "forgot" : "signin"); setMsg(null); }}>
          {mode === "signin" ? "Forgot password?" : "Back to sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
