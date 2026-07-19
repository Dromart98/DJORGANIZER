export const ONBOARDING_STEP_IDS = ["import", "review", "crate"] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingCounts = {
  crateCount: number;
  trackCount: number;
};

export function getOnboardingProgress({
  crateCount,
  trackCount,
}: OnboardingCounts) {
  const steps: Array<{ completed: boolean; id: OnboardingStepId }> = [
    { completed: trackCount > 0, id: "import" },
    { completed: trackCount > 0, id: "review" },
    { completed: crateCount > 0, id: "crate" },
  ];

  return {
    completedCount: steps.filter((step) => step.completed).length,
    isComplete: trackCount > 0 && crateCount > 0,
    steps,
  };
}
