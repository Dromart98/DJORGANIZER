import type { DashboardCountOperation } from "./summary";

type DashboardE2EInjection =
  | { kind: "failure"; mode: "network" | "query"; operation: DashboardCountOperation }
  | { kind: "slow"; operation: DashboardCountOperation };

const OPERATIONS = new Set<DashboardCountOperation>([
  "tracks",
  "crates",
  "tags",
]);

export function getDashboardE2EInjection(
  value: string | string[] | undefined,
): DashboardE2EInjection | null {
  if (process.env.E2E_AUTHENTICATED !== "1" || typeof value !== "string") {
    return null;
  }

  const [operation, mode, extra] = value.split("-");
  if (
    extra !== undefined ||
    !OPERATIONS.has(operation as DashboardCountOperation)
  ) {
    return null;
  }

  if (mode === "query" || mode === "network") {
    return {
      kind: "failure",
      mode,
      operation: operation as DashboardCountOperation,
    };
  }
  if (mode === "slow") {
    return { kind: "slow", operation: operation as DashboardCountOperation };
  }
  return null;
}

export async function applyDashboardE2EInjection(
  injection: DashboardE2EInjection | null,
  operation: DashboardCountOperation,
) {
  if (
    process.env.E2E_AUTHENTICATED !== "1" ||
    !injection ||
    injection.operation !== operation
  ) {
    return null;
  }

  if (injection.kind === "slow") {
    await new Promise((resolve) => setTimeout(resolve, 750));
    return null;
  }
  if (injection.mode === "network") {
    throw new TypeError("Controlled dashboard transport failure.");
  }
  return { count: null, error: { code: "controlled" }, status: 400 };
}
