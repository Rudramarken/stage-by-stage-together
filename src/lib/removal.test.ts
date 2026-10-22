import { describe, expect, it } from "vitest";
import { removalConfirmationValid } from "./removal";
describe("removal confirmations", () => {
  it("permanent deletion requires the exact LR number", () => {
    expect(removalConfirmationValid("delete", "TEST-LR-42", "", "TEST-LR-4")).toBe(false);
    expect(removalConfirmationValid("delete", "TEST-LR-42", "", "TEST-LR-42")).toBe(true);
  });
  it("cancellation requires a nonblank reason", () => {
    expect(removalConfirmationValid("cancel", "TEST-LR-42", "  ", "")).toBe(false);
    expect(removalConfirmationValid("cancel", "TEST-LR-42", "TEST cancellation", "")).toBe(true);
  });
  it("money reversal requires a nonblank reason", () => {
    expect(removalConfirmationValid("reverse", "TEST receipt", "", "")).toBe(false);
    expect(removalConfirmationValid("reverse", "TEST receipt", "TEST correction", "")).toBe(true);
  });
});