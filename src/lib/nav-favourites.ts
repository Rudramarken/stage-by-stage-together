import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";

// Table added by drizzle/migrations/0023_user_nav_favourites.sql. It is not in the generated types.ts, so it is addressed untyped here.
const table = () => (supabase as any).from("user_nav_favourites");

/** Pure: keeps only favourites that are still in the user's allowed menu (a favourite can never add a page). */
export function allowedFavourites(favKeys: string[], allowedKeys: string[]): string[] {
  const allowed = new Set(allowedKeys);
  return Array.from(new Set(favKeys)).filter((k) => allowed.has(k));
}

export function useNavFavourites() {
  const { userId } = useBusiness();
  const qc = useQueryClient();
  const key = ["nav-favourites", userId];
  const q = useQuery({
    queryKey: key,
    retry: 1,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await table().select("nav_key").eq("user_id", userId);
      if (error) throw error;
      return ((data ?? []) as { nav_key: string }[]).map((r) => r.nav_key);
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ navKey, on }: { navKey: string; on: boolean }) => {
      if (on) {
        const { error } = await table().upsert({ user_id: userId, nav_key: navKey }, { onConflict: "user_id,nav_key", ignoreDuplicates: true });
        if (error) throw error;
      } else {
        const { error } = await table().delete().eq("user_id", userId).eq("nav_key", navKey);
        if (error) throw error;
      }
    },
    onMutate: async ({ navKey, on }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<string[]>(key) ?? [];
      qc.setQueryData<string[]>(key, on ? Array.from(new Set([...prev, navKey])) : prev.filter((k) => k !== navKey));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.prev);
      toast.error(`Could not update favourites: ${e instanceof Error ? e.message : "unknown error"}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  return {
    /** false until the table exists / the query succeeded: the UI hides the stars instead of pretending to save. */
    available: q.isSuccess,
    favourites: q.data ?? [],
    toggle: (navKey: string, on: boolean) => { if (!toggle.isPending) toggle.mutate({ navKey, on }); },
    pending: toggle.isPending,
  };
}
