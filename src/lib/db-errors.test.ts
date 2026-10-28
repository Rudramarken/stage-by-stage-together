import { describe, it, expect } from "vitest";
import { explainDbError } from "./db-errors";

describe("explainDbError", () => {
  it("keeps the real message and points at migration 0022 for the account_movement(s) schema-cache error", () => {
    const m = explainDbError("Could not find the table 'public.account_movement' in the schema cache");
    expect(m).toContain("Could not find the table 'public.account_movement' in the schema cache");
    expect(m).toContain("0022");
    expect(m).toContain("reload schema");
  });
  it("leaves ordinary database errors untouched", () => {
    expect(explainDbError("Amount must be greater than 0")).toBe("Amount must be greater than 0");
    expect(explainDbError("new row violates row-level security policy")).toBe("new row violates row-level security policy");
  });
  it("maps favourites and party manual entry tables", () => {
    expect(explainDbError('relation "public.user_nav_favourites" does not exist')).toContain("0023");
    expect(explainDbError("Could not find the function public.save_party_manual_entry in the schema cache")).toContain("0024");
  });
});
