export function isAutomaticAnalysisEligibleStatus(status: string) {
  return status === "ready" || status === "invalid";
}

export function isAutomaticAnalysisActive(
  progress: { completed: number; total: number } | null,
) {
  return progress !== null;
}
