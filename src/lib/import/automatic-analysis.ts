export function isAutomaticAnalysisEligibleStatus(status: string) {
  return status === "ready" || status === "invalid";
}
