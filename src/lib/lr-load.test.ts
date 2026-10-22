import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { lrToForm } from "./lr-load";
describe("LR editing identity", () => {
  it("preserves saved party, expense and adjustment IDs with their original amounts", () => {
    const form = lrToForm({ lr: { id: "TEST-LR", rate: 2000, direct_payment_enabled: false, commission_enabled: false,
      lr_parties: [{ id: "TEST-PARTY-ROW", role: "consignor", party_id: "TEST-PARTY", seq: 1 }],
      lr_adjustments: [{ id: "TEST-ADJUSTMENT", kind: "add", amount: 100, reason: "TEST addition" }] },
      expenses: [{ id: "TEST-EXPENSE", lr_party_id: "TEST-PARTY-ROW", amount: 50 }] as never, trip: null });
    expect(form.parties[0].id).toBe("TEST-PARTY-ROW");
    expect(form.parties[0].expenses[0].id).toBe("TEST-EXPENSE");
    expect(form.parties[0].expenses[0].amount).toBe("50");
    expect(form.adjustments[0]).toEqual({ id: "TEST-ADJUSTMENT", kind: "add", amount: "100", reason: "TEST addition" });
    expect(form.rate).toBe("2000");
  });
});