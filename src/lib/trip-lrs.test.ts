import { describe, it, expect } from "vitest";
import { blankTripLr, isBlankTripLr, tripLrFreightTotal, tripLrPayload, validateTripLrs } from "./trip-lrs";

const filled = () => { const d = blankTripLr(); d.consignors[0] = { party_id: "A", freight_amount: "1000" }; d.consignees[0] = { party_id: "B", freight_amount: "500.50" }; return d; };

describe("trip LR rows", () => {
  it("preserves six independent fields for all three parties without inventing a calculation", () => {
    const d = filled();
    Object.assign(d.consignors[0], { weight: "100", rate: "2", shortage: "3", addition: "4", freight_date: "2026-10-21" });
    Object.assign(d.consignees[0], { weight: "200", rate: "5", shortage: "6", addition: "7", freight_date: "2026-10-22" });
    Object.assign(d, { transporter_weight: "300", transporter_rate: "8", freight_payable: "900", transporter_shortage: "9", transporter_additions: "10", transporter_freight_date: "2026-10-23" });
    const p = tripLrPayload(d, { id: "T1", trip_date: "2026-10-01", transporter_id: "TR" });
    expect(p.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ weight: "100", rate: "2", freight_amount: "1000", shortage: "3", addition: "4", freight_date: "2026-10-21" }),
      expect.objectContaining({ weight: "200", rate: "5", freight_amount: "500.50", shortage: "6", addition: "7", freight_date: "2026-10-22" }),
    ]));
    expect(p).toMatchObject({ transporter_weight: "300", transporter_rate: "8", freight_payable: "900", transporter_shortage: "9", transporter_additions: "10", transporter_freight_date: "2026-10-23", rate: "1500.5" });
  });
  it("recognizes party details as entered data and retains saved party identity", () => {
    const d = blankTripLr(); d.consignors[0].weight = "100";
    expect(isBlankTripLr(d)).toBe(false);
    const f = filled(); f.consignors[0].id = "existing-party-row";
    expect((tripLrPayload(f, { id: "T1", trip_date: "2026-10-01" }).parties as { id?: string }[])[0].id).toBe("existing-party-row");
  });
  it("an untouched row is ignored, a saved row is not blank", () => {
    expect(isBlankTripLr(blankTripLr())).toBe(true);
    expect(isBlankTripLr({ ...blankTripLr(), savedId: "x" })).toBe(false);
    expect(validateTripLrs([blankTripLr()])).toBe(null);
  });
  it("accepts a complete row and totals the party freights once", () => {
    expect(validateTripLrs([filled()])).toBe(null);
    expect(tripLrFreightTotal(filled())).toBe(1500.5);
  });
  it("rejects missing consignee, missing freight, bad amounts and duplicate LR numbers", () => {
    const a = filled(); a.consignees = [{ party_id: "", freight_amount: "" }];
    expect(validateTripLrs([a])).toContain("consignee");
    const b = filled(); b.consignors[0].freight_amount = ""; b.consignees[0].freight_amount = "";
    expect(validateTripLrs([b])).toContain("freight");
    const c = filled(); c.consignors[0].freight_amount = "10.123";
    expect(validateTripLrs([c])).toContain("2 decimal");
    const d1 = filled(), d2 = filled(); d1.lr_number = "lr-1"; d2.lr_number = "LR-1";
    expect(validateTripLrs([d1, d2])).toContain("twice");
    const e = filled(); e.freight_payable = "-5";
    expect(validateTripLrs([e])).toContain("transporter");
  });
  it("payload sets trip, transporter, fixed rate = party total, and reuses the saved id on retry", () => {
    const d = filled(); d.freight_payable = "900";
    const p: any = tripLrPayload(d, { id: "T1", trip_date: "2026-10-01", transporter_id: "TR" });
    expect(p.trip_id).toBe("T1"); expect(p.transporter_id).toBe("TR"); expect(p.rate_unit).toBe("fixed"); expect(p.rate).toBe("1500.5");
    expect(p.freight_payable).toBe("900"); expect(p.id).toBe(undefined); expect(p.parties.length).toBe(2);
    d.savedId = "LR9";
    expect((tripLrPayload(d, { id: "T1", trip_date: "2026-10-01" }) as any).id).toBe("LR9");
  });
});
