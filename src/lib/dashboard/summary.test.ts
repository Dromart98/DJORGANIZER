import { describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_COUNT_OPERATIONS,
  loadDashboardSummary,
} from "./summary";
import { getDashboardE2EInjection } from "./e2e-injection";

describe("dashboard summary loading", () => {
  it("loads every independent count once", async () => {
    const loadCount = vi.fn(async (_operation: string) => ({
      operation: _operation,
      count: 4,
      error: null,
    }));

    const summary = await loadDashboardSummary(loadCount);

    expect(loadCount).toHaveBeenCalledTimes(3);
    expect(loadCount.mock.calls.map(([operation]) => operation)).toEqual(
      DASHBOARD_COUNT_OPERATIONS,
    );
    expect(summary).toEqual({
      crates: { count: 4, failure: null },
      tags: { count: 4, failure: null },
      tracks: { count: 4, failure: null },
    });
  });

  it("keeps successful counts when one query returns an error", async () => {
    const summary = await loadDashboardSummary(async (operation) =>
      operation === "tags"
        ? { count: null, error: { code: "controlled" } }
        : { count: operation === "tracks" ? 12 : 2, error: null },
    );

    expect(summary).toEqual({
      crates: { count: 2, failure: null },
      tags: { count: null, failure: "query" },
      tracks: { count: 12, failure: null },
    });
  });

  it("classifies a rejected request without rejecting the whole summary", async () => {
    const summary = await loadDashboardSummary(async (operation) => {
      if (operation === "crates") throw new TypeError("controlled network failure");
      return { count: 0, error: null };
    });

    expect(summary.crates).toEqual({ count: null, failure: "network" });
    expect(summary.tracks).toEqual({ count: 0, failure: null });
    expect(summary.tags).toEqual({ count: 0, failure: null });
  });

  it("classifies a transport response separately from a database error", async () => {
    const summary = await loadDashboardSummary(async (operation) =>
      operation === "tracks"
        ? { count: null, error: { message: "fetch failed" }, status: 0 }
        : { count: 0, error: null },
    );

    expect(summary.tracks).toEqual({ count: null, failure: "network" });
  });
});

describe("dashboard E2E injection guard", () => {
  it("accepts only known operations and modes in authenticated E2E", () => {
    const previous = process.env.E2E_AUTHENTICATED;
    process.env.E2E_AUTHENTICATED = "1";
    try {
      expect(getDashboardE2EInjection("tags-query")).toEqual({
        kind: "failure",
        mode: "query",
        operation: "tags",
      });
      expect(getDashboardE2EInjection("crates-network")).toEqual({
        kind: "failure",
        mode: "network",
        operation: "crates",
      });
      expect(getDashboardE2EInjection("tracks-slow")).toEqual({
        kind: "slow",
        operation: "tracks",
      });
      expect(getDashboardE2EInjection("users-query")).toBeNull();
      expect(getDashboardE2EInjection("tracks-sql-select-all")).toBeNull();
      expect(getDashboardE2EInjection(["tags-query"])).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.E2E_AUTHENTICATED;
      else process.env.E2E_AUTHENTICATED = previous;
    }
  });

  it("stays disabled outside authenticated E2E", () => {
    const previous = process.env.E2E_AUTHENTICATED;
    delete process.env.E2E_AUTHENTICATED;
    try {
      expect(getDashboardE2EInjection("tags-query")).toBeNull();
    } finally {
      if (previous !== undefined) process.env.E2E_AUTHENTICATED = previous;
    }
  });
});
