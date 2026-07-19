import { describe, expect, it } from "vitest";
import { getOnboardingProgress } from "./progress";

describe("getOnboardingProgress", () => {
  it("keeps every step pending for an empty account", () => {
    expect(
      getOnboardingProgress({ crateCount: 0, trackCount: 0 }),
    ).toMatchObject({
      completedCount: 0,
      isComplete: false,
      steps: [
        { completed: false, id: "import" },
        { completed: false, id: "review" },
        { completed: false, id: "crate" },
      ],
    });
  });

  it("derives import and review completion from saved tracks", () => {
    expect(
      getOnboardingProgress({ crateCount: 0, trackCount: 1 }),
    ).toMatchObject({
      completedCount: 2,
      isComplete: false,
    });
  });

  it("finishes only when tracks and a crate both exist", () => {
    expect(
      getOnboardingProgress({ crateCount: 1, trackCount: 4 }),
    ).toMatchObject({
      completedCount: 3,
      isComplete: true,
    });
    expect(
      getOnboardingProgress({ crateCount: 1, trackCount: 0 }).isComplete,
    ).toBe(false);
  });
});
