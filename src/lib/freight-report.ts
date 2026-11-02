export function partyFreightReport(lrs: any[], journeys: any[], partyName: (id: string) => string) {
  const groups = new Map<string, { documents: Set<string>; amount: number }>();
  const add = (name: string, document: string, amount: number) => {
    const g = groups.get(name) ?? { documents: new Set<string>(), amount: 0 };
    g.documents.add(document); g.amount += amount; groups.set(name, g);
  };
  for (const l of lrs.filter(l => l.status === "active")) {
    const rows = l.lr_parties ?? [];
    if (rows.some((p: any) => p.freight_amount != null)) {
      for (const p of rows) if (p.freight_amount != null && Number(p.freight_amount) > 0) add(p.parties?.name || partyName(p.party_id), l.id, Number(p.freight_amount));
    } else {
      const role = l.freight_type === "to_pay" ? "consignee" : "consignor";
      const p = rows.find((p: any) => p.role === role);
      add(l.freight_type === "tbb" && l.billing_party_id ? partyName(l.billing_party_id) : p?.parties?.name || partyName(p?.party_id), l.id, Number(l.final_freight || 0));
    }
  }
  for (const e of journeys.filter(e => !e.is_cancelled && e.role !== "transporter" && Number(e.freight_amount) > 0)) add(partyName(e.party_id), `trip:${e.trip_id}`, Number(e.freight_amount));
  return [...groups].map(([name, g]) => [name, g.documents.size, Math.round(g.amount * 100) / 100]);
}