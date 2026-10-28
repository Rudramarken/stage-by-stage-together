import { supabase } from "@/integrations/supabase/client";
import type { LRValues } from "@/components/app/LRForm";

export async function loadLR(id: string) {
  const { data: lr, error } = await supabase.from("lrs").select("*, lr_parties(*, parties(name, phone, address, city)), lr_adjustments(*)").eq("id", id).single();
  if (error) throw error;
  const { data: exps, error: e2 } = await supabase.from("expenses").select("*").eq("lr_id", id).in("scope", ["consignor", "consignee"]).eq("is_cancelled", false).order("created_at");
  if (e2) throw e2;
  let trip: any = null;
  if (lr.trip_id) {
    const r = await supabase.from("trips").select("id, trip_number, trip_date, market_vehicle_number, vehicles(registration_number), trip_stops(id, location, seq)").eq("id", lr.trip_id).single();
    if (r.error) throw r.error;
    trip = r.data;
  }
  return { lr: lr as any, expenses: exps, trip };
}

const s = (x: unknown) => (x == null ? "" : String(x));

export function lrToForm({ lr, expenses }: Awaited<ReturnType<typeof loadLR>>): LRValues {
  const { lr_parties, lr_adjustments, ...rest } = lr;
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(rest)) out[k] = typeof val === "boolean" ? val : s(val);
  return {
    ...out,
    direct_payment_enabled: lr.direct_payment_enabled, commission_enabled: lr.commission_enabled,
    parties: [...lr_parties].sort((a: any, b: any) => a.seq - b.seq).map((p: any) => ({
      id: p.id, role: p.role, party_id: p.party_id, goods_description: s(p.goods_description), quantity: s(p.quantity), weight: s(p.weight),
      loading_point: s(p.loading_point), delivery_point: s(p.delivery_point), freight_amount: s(p.freight_amount),
      rate: s(p.rate), shortage: s(p.shortage), addition: s(p.addition), freight_date: s(p.freight_date),
      expenses: expenses.filter((e) => e.lr_party_id === p.id).map((e) => ({ ...e, amount: s(e.amount) })),
    })),
    adjustments: lr_adjustments.map((a: any) => ({ id: a.id, kind: a.kind, amount: s(a.amount), reason: a.reason })),
  } as LRValues;
}
