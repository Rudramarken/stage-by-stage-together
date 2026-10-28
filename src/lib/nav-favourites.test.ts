import { describe, it, expect } from "vitest";
import { allowedFavourites } from "./nav-favourites";

describe("allowedFavourites", () => {
  it("drops favourites that are not in the allowed menu (a star never grants access)", () => {
    expect(allowedFavourites(["/trips", "/system-check", "/trips"], ["/trips", "/lr"])).toEqual(["/trips"]);
  });
  it("returns nothing when nothing is starred", () => {
    expect(allowedFavourites([], ["/trips"])).toEqual([]);
  });
});
