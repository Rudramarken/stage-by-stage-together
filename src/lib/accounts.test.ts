import { describe, expect, it } from "vitest";
import { accountLabel, buildStatement, type Movement } from "./accounts";

const mv = (id: string, date: string, direction: "in" | "out", amount: number): Movement => ({
  account_id: "A", movement_date: date, created_at: `${date}T10:00:00Z`, source_table: "payments", source_id: id, source_type: "customer_receipt",
  direction, amount, reference: null, description: null, party_id: null, transporter_id: null, driver_id: null, other_name: null,
});

describe("buildStatement", () => {
  it("counts the opening balance once and ignores entries before the opening date", () => {
    const s = buildStatement(1000, "2026-04-01", [mv("1", "2026-03-31", "in", 500), mv("2", "2026-04-02", "in", 300), mv("3", "2026-04-03", "out", 100)]);
    expect(s.start).toBe(1000);
    expect(s.closing).toBe(1200);
    expect(s.lines.map((l) => l.balance)).toEqual([1300, 1200]);
  });
  it("rolls earlier movements into the starting balance when a From date is chosen", () => {
    const s = buildStatement(0, null, [mv("1", "2026-04-02", "in", 300), mv("2", "2026-04-10", "out", 50)], "2026-04-05");
    expect(s.start).toBe(300);
    expect(s.lines).toHaveLength(1);
    expect(s.closing).toBe(250);
    expect(s.totWithdrawal).toBe(50);
  });
  it("supports a negative (overdraft) opening balance", () => {
    expect(buildStatement(-200, "2026-04-01", [mv("1", "2026-04-02", "in", 500)]).closing).toBe(300);
  });
});

describe("accountLabel", () => {
  it("keeps the two cash accounts distinct and masks bank numbers", () => {
    expect(accountLabel({ kind: "cash", display_name: "Cash", account_number: null })).toBe("Cash");
    expect(accountLabel({ kind: "cash", display_name: "Cash Received by Narinder", account_number: null })).toBe("Cash Received by Narinder");
    expect(accountLabel({ kind: "bank", display_name: "HDFC", account_number: "123456789012" })).toBe("HDFC XXXX9012");
  });
});
