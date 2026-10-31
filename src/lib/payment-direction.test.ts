import { expect, it } from "vitest";
import { paymentIsIncoming } from "./payment-direction";
it("transporter receipt is incoming, transporter payment is outgoing", () => {
  expect(paymentIsIncoming("transporter_receipt")).toBe(true);
  expect(paymentIsIncoming("transporter_payment")).toBe(false);
});