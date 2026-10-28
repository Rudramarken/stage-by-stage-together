import { describe, it, expect } from "vitest";
import { blankTripLr, isBlankTripLr, tripLrFreightTotal, tripLrPayload, validateTripLrs } from "./trip-lrs";

const filled = () => { const d = blankTripLr(); d.consignors[0] = { party_id: "A", freight_amount: "1000" }; d.consignees[0] = { party_id: "B", freight_amount: "500.50" }; return d; };

describe("trip LR rows", () => {
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
