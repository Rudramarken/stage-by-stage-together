import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SearchSelect } from "./SearchSelect";
import { useParties, useTransporters, createTransporterInline } from "@/lib/lookups";
import { errorMessage } from "./states";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** One field: pick a saved transporter, pick any Party (linked by its ID), or type a new name. */
export function TransporterSelect({ value, onChange }: { value: string | null | undefined; onChange: (id: string) => void }) {
  const qc = useQueryClient();
  const transporters = useTransporters();
  const parties = useParties();
  const ts = (transporters.data ?? []) as any[];
  const linked = new Set(ts.map((t) => t.party_id).filter(Boolean));
  const names = new Set(ts.map((t) => norm(t.name)));
  const options = [
    ...ts.filter((t) => t.is_active || t.id === value).map((t) => ({ value: t.id, label: t.name, hint: t.party_id ? "party" : "" })),
    ...((parties.data ?? []) as any[]).filter((p) => p.is_active && !linked.has(p.id) && !names.has(norm(p.name)))
      .map((p) => ({ value: "party:" + p.id, label: p.name, hint: "party" })),
  ];
  const refresh = () => qc.invalidateQueries({ queryKey: ["transporters"] });
  return (
    <SearchSelect value={value} options={options} placeholder="Choose party or type new" createLabel="Add transporter"
      onChange={async (x) => {
        if (!x.startsWith("party:")) return onChange(x);
        try {
          const { data, error } = await supabase.rpc("get_or_create_transporter_for_party", { p_party_id: x.slice(6) });
          if (error) throw error;
          await refresh(); onChange(data as string);
        } catch (e) { toast.error(errorMessage(e)); }
      }}
      onCreate={async (t) => { const id = await createTransporterInline(t); await refresh(); return id; }} />
  );
}
