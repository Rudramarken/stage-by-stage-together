import { describe, expect, it } from "vitest";
import { autoFreight, freightPatch } from "@/components/app/PartyFreightFields";
import { blankTripLr, tripLrPayload, validateTripLrs } from "./trip-lrs";

const withParties = () => { const d = blankTripLr(); d.consignors[0].party_id = "a"; d.consignees[0].party_id = "b"; return d; };

describe("trip freight fixes", () => {
  it("196.70 kg × ₹170 = ₹33,439", () => expect(autoFreight("196.70", "170")).toBe("33439"));
  it("changing rate recalculates freight", () => expect(freightPatch({ weight: "10", rate: "5", freight_amount: "50" }, { rate: "7" }).freight_amount).toBe("70"));
  it("typing freight directly keeps the manual value", () => expect(freightPatch({ weight: "10", rate: "5" }, { freight_amount: "99" })).toEqual({ freight_amount: "99" }));
  it("transporter-only freight is accepted", () => { const d = withParties(); d.freight_payable = "903"; expect(validateTripLrs([d])).toBeNull(); });
  it("no freight anywhere is still rejected", () => expect(validateTripLrs([withParties()])).toMatch(/enter the freight/));
  it("each LR saves its own transporter, else the trip's", () => {
    const trip = { id: "t", trip_date: "2026-10-29", transporter_id: "T1" };
    const a = withParties(); const b = withParties(); b.transporter_id = "T2";
    expect(tripLrPayload(a, trip).transporter_id).toBe("T1");
    expect(tripLrPayload(b, trip).transporter_id).toBe("T2");
  });
});
