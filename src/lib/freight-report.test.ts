import { expect, it } from "vitest";
import { partyFreightReport } from "./freight-report";
it("reports independent 2000 and 3000 party shares instead of billing all freight to one party", () => {
  expect(partyFreightReport([{ id: "LR", status: "active", final_freight: 5000, lr_parties: [{ party_id: "A", freight_amount: 2000 }, { party_id: "B", freight_amount: 3000 }] }], [], id => id)).toEqual([["A", 1, 2000], ["B", 1, 3000]]);
});
it("counts trip party freight without copying it into LRs or counting transporter as party", () => {
  expect(partyFreightReport([], [{ trip_id: "T", role: "consignor", party_id: "A", freight_amount: 2000 }, { trip_id: "T", role: "transporter", freight_amount: 3000 }], id => id)).toEqual([["A", 1, 2000]]);
});