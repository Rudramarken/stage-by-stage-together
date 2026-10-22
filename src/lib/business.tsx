import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { LoadingState, ErrorState } from "@/components/app/states";

export type BusinessCtx = {
  businessId: string;
  businessName: string;
  role: string;
  userId: string;
  email: string | null;
  settings: Tables<"business_settings"> | null;
};

const Ctx = createContext<BusinessCtx | null>(null);

export function useBusiness() {
  const v = useContext(Ctx);
  if (!v) throw new Error("Business not loaded");
  return v;
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const q = useQuery({
    queryKey: ["business-context"],
    queryFn: async (): Promise<BusinessCtx | null> => {
      const { data: u, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!u.user) throw new Error("Not signed in");
      const { data: m, error } = await supabase
        .from("business_members").select("business_id, role, businesses(name)").eq("user_id", u.user.id).maybeSingle();
      if (error) throw error;
      if (!m) return null;
      const { data: s, error: sErr } = await supabase.from("business_settings").select("*").eq("business_id", m.business_id).maybeSingle();
      if (sErr) throw sErr;
      return {
        businessId: m.business_id, role: m.role, userId: u.user.id, email: u.user.email ?? null,
        businessName: (m.businesses as { name: string } | null)?.name ?? "Gokul Cargo Movers", settings: s,
      };
    },
    staleTime: 60_000,
  });
  if (q.isPending) return <LoadingState label="Loading your business…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data)
    return (
      <ErrorState
        error={new Error("This account is not linked to any business. Ask the Owner to add you in Business Settings > Users.")}
        onRetry={() => q.refetch()}
        extra={<button className="text-sm underline" onClick={() => supabase.auth.signOut()}>Sign out</button>}
      />
    );
  return <Ctx.Provider value={q.data}>{children}</Ctx.Provider>;
}
