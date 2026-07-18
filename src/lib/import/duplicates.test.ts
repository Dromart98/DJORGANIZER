import { describe, expect, it } from "vitest";
import { duplicateClientIds } from "@/lib/import/duplicates";

describe("duplicateClientIds", () => {
  it("keeps the first file and identifies later exact matches", () => {
    expect(
      duplicateClientIds([
        { client_id: "first", file_fingerprint: "same" },
        { client_id: "different", file_fingerprint: "other" },
        { client_id: "second", file_fingerprint: "same" },
        { client_id: "third", file_fingerprint: "same" },
      ]),
    ).toEqual(["second", "third"]);
  });

  it("does not report unique fingerprints", () => {
    expect(
      duplicateClientIds([
        { client_id: "one", file_fingerprint: "a" },
        { client_id: "two", file_fingerprint: "b" },
      ]),
    ).toEqual([]);
  });
});
