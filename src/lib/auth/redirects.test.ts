import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirects";

describe("safeRedirectPath", () => {
  it("keeps a local application path", () => {
    expect(safeRedirectPath("/crates?sort=name")).toBe("/crates?sort=name");
  });

  it.each([
    "https://example.com",
    "//example.com/path",
    "/\\example.com",
    "library",
    "",
  ])("rejects an unsafe redirect: %s", (value) => {
    expect(safeRedirectPath(value)).toBe("/library");
  });

  it("uses the library for absent values", () => {
    expect(safeRedirectPath(null)).toBe("/library");
  });
});

