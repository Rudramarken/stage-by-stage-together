import { describe, it, expect } from "vitest";
import { filterHistory, type HistoryRow } from "./PartyHistory";

const row = (o: Partial<HistoryRow>): HistoryRow => ({ key: "k", date: "2026-10-10", type: "lr", kind: "LR", ref: "LR-1", refLrId: "1", tripId: null, tripNo: "TRP-1", vehicle: "HR35F3747", driver: "Ram", route: "Delhi → Pune", amount: 1, amountLabel: "", status: "Active", ...o });

describe("filterHistory", () => {
  const rows = [row({ key: "a" }), row({ key: "b", type: "payment", date: "2026-11-01", ref: "UTR9", vehicle: "" })];
  it("filters by type and date range", () => {
    expect(filterHistory(rows, { search: "", type: "payment", from: "", to: "" }).map((r) => r.key)).toEqual(["b"]);
    expect(filterHistory(rows, { search: "", type: "", from: "2026-10-20", to: "" }).map((r) => r.key)).toEqual(["b"]);
  });
  it("searches vehicle, driver, route, LR and trip", () => {
    expect(filterHistory(rows, { search: "pune", type: "", from: "", to: "" }).length).toBe(2);
    expect(filterHistory(rows, { search: "utr9", type: "", from: "", to: "" }).map((r) => r.key)).toEqual(["b"]);
  });
});
