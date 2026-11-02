import { describe, expect, it } from "vitest";
import { blankJourneyEntry, journeyEntriesPayload, journeyEntriesToForm, journeyTotals, validateJourneyEntries } from "./trip-journeys";
describe("independent trip journeys", () => {
  it("preserves the same payable identity when a saved journey is reopened and edited", () => {
    const entry = { ...blankJourneyEntry("return", "consignor"), party_id: "test-party", expenses: [{ id: "test-payable", category: "Loading", amount: "420", expense_date: "2026-11-02", notes: "TEST" }] };
    const reopened = journeyEntriesToForm([entry]);
    reopened[0].expenses[0].amount = "425";
    const payload = journeyEntriesPayload(reopened);
    expect(payload[0].id).toBe(entry.id);
    expect(payload[0].expenses).toEqual([{ id: "test-payable", category: "Loading", amount: "425", expense_date: "2026-11-02", notes: "TEST" }]);
    expect(journeyTotals(payload).consignorPayable).toBe(425);
  });
  it("accepts transporter-only freight without artificial parties or LR creation", () => {
    const e = { ...blankJourneyEntry("main", "transporter"), transporter_id: "t1", freight_amount: "2000" };
    expect(validateJourneyEntries([e])).toBeNull();
    expect(journeyEntriesPayload([e])).toEqual([expect.objectContaining({ transporter_id: "t1", freight_amount: "2000", journey: "main" })]);
    expect(journeyEntriesPayload([e])[0]).not.toHaveProperty("lr_id");
  });
  it("keeps main 2000 and return 3000 transporter freight independent", () => {
    const a = { ...blankJourneyEntry("main", "transporter"), transporter_id: "t1", freight_amount: "2000" };
    const b = { ...blankJourneyEntry("return", "transporter"), transporter_id: "t2", freight_amount: "3000" };
    const rows = journeyEntriesToForm([a, b]);
    expect(rows.map(r => [r.id, r.transporter_id, r.freight_amount])).toEqual([[a.id, "t1", "2000"], [b.id, "t2", "3000"]]);
    expect(journeyTotals(rows).transporterReceivable).toBe(5000);
  });
  it("keeps a 2000 consignor payable separate from freight and excludes cancellation", () => {
    const e = { ...blankJourneyEntry("main", "consignor"), party_id: "p", freight_amount: "500", expenses: [{ id: "x", category: "Loading", amount: "2000", expense_date: "2026-11-02", notes: "" }] };
    expect(journeyTotals([e])).toEqual({ partyFreight: 500, transporterReceivable: 0, consignorPayable: 2000 });
    expect(journeyTotals([{ ...e, cancel_reason: "Correction" }]).consignorPayable).toBe(0);
  });
  it("does not add shortage and addition to manually entered final freight", () => {
    const e = { ...blankJourneyEntry("main", "transporter"), transporter_id: "t", freight_amount: "33439", shortage: "100", addition: "200" };
    expect(journeyTotals([e]).transporterReceivable).toBe(33439);
  });
  it("rejects freight without the actual transporter and negative values", () => {
    const e = { ...blankJourneyEntry("return", "transporter"), freight_amount: "2000" };
    expect(validateJourneyEntries([e])).toContain("choose transporter");
    expect(validateJourneyEntries([{ ...e, transporter_id: "t", freight_amount: "-1" }])).toContain("non-negative");
  });
});