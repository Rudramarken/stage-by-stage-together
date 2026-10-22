import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SearchSelect } from "./SearchSelect";
import { useParties, useTransporters, createTransporterInline } from "@/lib/lookups";
import { buildTransporterOptions, findPartyByName, type PartyRow, type TransporterRow } from "@/lib/transporter-options";
import { errorMessage } from "./states";

/** One field: pick any Party (saved with its real party ID), pick a saved transporter, or type a new name. */
export function TransporterSelect({ value, onChange }: { value: string | null | undefined; onChange: (id: string) => void }) {
  const qc = useQueryClient();
  const transporters = useTransporters();
  const parties = useParties();
  const partyRows = (parties.data ?? []) as PartyRow[];
  const { options, needsLink } = useMemo(
    () => buildTransporterOptions(partyRows, (transporters.data ?? []) as TransporterRow[], value),
    [parties.data, transporters.data, value], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["transporters"] });
  const linkParty = async (partyId: string) => {
    const { data, error } = await supabase.rpc("get_or_create_transporter_for_party", { p_party_id: partyId });
    if (error) throw error;
    await refresh();
    return data as string;
  };
  const loadError = parties.isError ? parties.error : transporters.isError ? transporters.error : null;
  return (
    <div className="space-y-1">
      <SearchSelect value={value} options={options} placeholder={parties.isPending || transporters.isPending ? "Loading…" : "Choose party or type new"} createLabel="Add transporter"
        onChange={async (x) => {
          try {
            if (x.startsWith("party:")) return onChange(await linkParty(x.slice(6)));
            const partyId = needsLink.get(x);
            if (partyId) return onChange(await linkParty(partyId));
            onChange(x);
          } catch (e) { toast.error(errorMessage(e)); }
        }}
        onCreate={async (t) => {
          const party = findPartyByName(partyRows, t);
          if (party) return linkParty(party.id);
          const id = await createTransporterInline(t); await refresh(); return id;
        }} />
      {loadError && <p role="alert" className="text-xs text-destructive">Could not load {parties.isError ? "parties" : "transporters"}: {errorMessage(loadError)}</p>}
    </div>
  );
}
