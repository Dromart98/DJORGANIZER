import { describe, expect, it } from "vitest";
import {
  compactMutationQueue,
  discardFailedMutations,
  findSyncConflict,
  formDataToOfflinePayload,
  offlineEntityForAction,
} from "./mutation-queue";

const base = {
  createdAt: "2026-07-19T00:00:00Z",
  entity: "track" as const,
  entityId: "one",
  id: "mutation",
  payload: {},
  revision: "v1",
};

describe("offline mutation queue", () => {
  it("merges sequential updates to the same entity", () => {
    const result = compactMutationQueue([
      { ...base, operation: "update", payload: { genre: "House" } },
      {
        ...base,
        createdAt: "2026-07-19T00:01:00Z",
        id: "second",
        operation: "update",
        payload: { energy: 80 },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].payload).toEqual({ energy: 80, genre: "House" });
  });

  it("detects optimistic revision conflicts", () => {
    expect(
      findSyncConflict(
        { ...base, operation: "update" },
        { revision: "v2" },
      )?.reason,
    ).toBe("revision-mismatch");
  });

  it("discards failed mutations without removing pending or conflict entries", () => {
    const pending = { ...base, operation: "update" as const, status: "pending" as const };
    const failed = {
      ...base,
      id: "failed",
      operation: "update" as const,
      status: "failed" as const,
    };
    const conflict = {
      ...base,
      id: "conflict",
      operation: "update" as const,
      status: "conflict" as const,
    };

    expect(discardFailedMutations([pending, failed, conflict])).toEqual([
      pending,
      conflict,
    ]);
  });

  it("serializes repeated form fields without files", () => {
    const formData = new FormData();
    formData.append("trackId", "one");
    formData.append("trackId", "two");
    formData.append("genre", "House");
    formData.append("cover", new Blob(["x"]), "cover.png");
    expect(formDataToOfflinePayload(formData)).toEqual({
      genre: "House",
      trackId: ["one", "two"],
    });
  });

  it("preserves the compact MAEST evidence field in an offline track update", () => {
    const formData = new FormData();
    const evidence = JSON.stringify({ genre: { value: "Electronic", rawScore: 0.8 } });
    formData.set("maest_evidence", evidence);
    formData.set("genre", "Electronic");
    expect(formDataToOfflinePayload(formData)).toMatchObject({
      genre: "Electronic",
      maest_evidence: evidence,
    });
  });

  it("creates stable relation identities for queued assignments", () => {
    expect(
      offlineEntityForAction(
        "crate-track-remove",
        { crateId: "crate", trackId: "track" },
        "fallback",
      ),
    ).toEqual({
      entity: "crate_track",
      entityId: "crate:track",
      operation: "delete",
    });
  });
});
