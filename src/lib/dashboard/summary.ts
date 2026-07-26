export const DASHBOARD_COUNT_OPERATIONS = ["tracks", "crates", "tags"] as const;

export type DashboardCountOperation =
  (typeof DASHBOARD_COUNT_OPERATIONS)[number];

type CountResult = {
  count: number | null;
  error: unknown | null;
  status?: number;
};

export type DashboardSummary = Record<
  DashboardCountOperation,
  { count: number | null; failure: "network" | "query" | null }
>;

export async function loadDashboardSummary(
  loadCount: (operation: DashboardCountOperation) => Promise<CountResult>,
): Promise<DashboardSummary> {
  const results = await Promise.allSettled(
    DASHBOARD_COUNT_OPERATIONS.map((operation) => loadCount(operation)),
  );

  return Object.fromEntries(
    DASHBOARD_COUNT_OPERATIONS.map((operation, index) => {
      const result = results[index];
      if (result.status === "rejected") {
        return [operation, { count: null, failure: "network" }];
      }
      const failure = result.value.error
        ? result.value.status === 0
          ? "network"
          : "query"
        : null;
      return [
        operation,
        {
          count: failure === null ? (result.value.count ?? 0) : null,
          failure,
        },
      ];
    }),
  ) as DashboardSummary;
}
