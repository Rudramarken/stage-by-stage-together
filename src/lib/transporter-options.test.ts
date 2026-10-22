import { describe, expect, it } from "vitest";
import { buildTransporterOptions, findPartyByName, normName } from "./transporter-options";

const parties = [
  { id: "p1", name: "Sharma Roadlines", is_active: true },
  { id: "p2", name: "Verma Traders", is_active: true },
  { id: "p3", name: "Old Party", is_active: false },
];

describe("normName", () => {
  it("ignores case, outer spaces and repeated spaces", () => {
    expect(normName("  SHARMA   roadlines ")).toBe("sharma roadlines");
  });
});

describe("buildTransporterOptions", () => {
  it("lists every active party even when there are no transporters", () => {
    const { options } = buildTransporterOptions(parties, []);
    expect(options.map((o) => o.value)).toEqual(["party:p1", "party:p2"]);
  });
  it("still lists a party whose name matches an older unlinked transporter, and flags it for linking", () => {
    const { options, needsLink } = buildTransporterOptions(parties, [{ id: "t1", name: "sharma  ROADLINES", party_id: null, is_active: true }]);
    expect(options.find((o) => o.label === "Sharma Roadlines")?.value).toBe("t1");
    expect(needsLink.get("t1")).toBe("p1");
  });
  it("uses the transporter linked by party_id and does not duplicate it", () => {
    const { options, needsLink } = buildTransporterOptions(parties, [{ id: "t2", name: "Verma", party_id: "p2", is_active: true }]);
    expect(options.filter((o) => o.value === "t2")).toHaveLength(1);
    expect(needsLink.size).toBe(0);
  });
  it("lists standalone transporters and keeps an inactive one only when currently selected", () => {
    const ts = [{ id: "t3", name: "Solo", party_id: null, is_active: true }, { id: "t4", name: "Gone", party_id: null, is_active: false }];
    expect(buildTransporterOptions(parties, ts).options.map((o) => o.value)).toContain("t3");
    expect(buildTransporterOptions(parties, ts).options.map((o) => o.value)).not.toContain("t4");
    expect(buildTransporterOptions(parties, ts, "t4").options.map((o) => o.value)).toContain("t4");
  });
});

describe("findPartyByName", () => {
  it("matches typed text to an active party ignoring case and spaces", () => {
    expect(findPartyByName(parties, "  verma   TRADERS")?.id).toBe("p2");
    expect(findPartyByName(parties, "old party")).toBeUndefined();
  });
});
