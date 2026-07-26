import { expect, test, type Page } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

function statistic(page: Page, label: string) {
  return page.locator(".stats section").filter({ hasText: label });
}

async function expectHealthyEmptySummary(page: Page) {
  for (const label of ["Tracks", "Crates", "Tags"]) {
    await expect(statistic(page, label).locator("strong")).toHaveText("0");
  }
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(0);
}

async function expectPartialFailure(
  page: Page,
  failedLabel: "Tracks" | "Crates" | "Tags",
  expectOnboarding: boolean,
) {
  await expect(
    page.getByRole("heading", { name: "Your music, ready to mix" }),
  ).toBeVisible();
  await expect(statistic(page, failedLabel).locator("strong")).toHaveText(
    "Unavailable",
  );
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(1);
  for (const label of ["Tracks", "Crates", "Tags"]) {
    if (label !== failedLabel) {
      await expect(statistic(page, label).locator("strong")).toHaveText("0");
    }
  }
  const gettingStarted = page.locator(".getting-started");
  if (expectOnboarding) {
    await expect(
      gettingStarted.getByRole("heading", { name: "Prepare your first set" }),
    ).toBeVisible();
    await expect(
      gettingStarted.getByText("0 of 3 steps completed"),
    ).toBeVisible();
  } else {
    await expect(gettingStarted).toHaveCount(0);
  }
  await expect(
    page.getByText(
      "Part of the summary could not be loaded. Your session and the available sections remain active.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry summary" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The screen could not be loaded" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
}

test("@authenticated isolates dashboard failures and preserves recovery and session", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const runId = `${Date.now()}-${testInfo.workerIndex}`;

  await context.addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/");
  await page.getByLabel("Name").fill("Dashboard E2E");
  await page.getByLabel("Email").fill(`dashboard-${runId}@djorganizer.test`);
  await page.getByLabel("Password").fill(`DjOrganizer-${runId}!`);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expectHealthyEmptySummary(page);

  await page.reload();
  await expectHealthyEmptySummary(page);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expectHealthyEmptySummary(page);
  await page.goto("/library");
  await page.goto("/");
  await page.goto("/library");
  await page.goto("/");
  await expectHealthyEmptySummary(page);

  const restoredPage = await context.newPage();
  await restoredPage.goto("/");
  await expectHealthyEmptySummary(restoredPage);
  await expect(
    restoredPage.getByRole("link", { name: "Library", exact: true }),
  ).toBeVisible();
  await restoredPage.close();

  for (const [injection, failedLabel, expectOnboarding] of [
    ["tags-query", "Tags", true],
    ["crates-network", "Crates", false],
    ["tracks-query", "Tracks", false],
  ] as const) {
    await page.goto(`/?__e2eSummary=${injection}`);
    await expectPartialFailure(page, failedLabel, expectOnboarding);
  }

  await page.goto("/?__e2eSummary=tags-query");
  await expectPartialFailure(page, "Tags", true);
  const retry = page.getByRole("button", { name: "Retry summary" });
  await retry.focus();
  await expect(retry).toBeFocused();

  let recoveryRequests = 0;
  let releaseRecovery!: () => void;
  let markRecoveryRequest!: () => void;
  const recoveryRelease = new Promise<void>((resolve) => {
    releaseRecovery = resolve;
  });
  const recoveryRequestSeen = new Promise<void>((resolve) => {
    markRecoveryRequest = resolve;
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === "http://127.0.0.1:3100" &&
      url.pathname === "/" &&
      !url.searchParams.has("__e2eSummary")
    ) {
      recoveryRequests += 1;
      markRecoveryRequest();
      await recoveryRelease;
    }
    await route.continue();
  });

  await retry.press("Enter");
  await recoveryRequestSeen;
  const pendingRetry = page.getByRole("button", { name: "Retrying…" });
  await expect(pendingRetry).toBeDisabled();
  await pendingRetry.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  expect(recoveryRequests).toBe(1);
  releaseRecovery();
  await expectHealthyEmptySummary(page);
  await expect.poll(() => recoveryRequests).toBe(1);
  await page.unroute("**/*");

  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expectHealthyEmptySummary(page);

  let slowRequests = 0;
  const countSlow = (request: { url(): string }) => {
    if (request.url().includes("__e2eSummary=tracks-slow")) slowRequests += 1;
  };
  page.on("request", countSlow);
  const startedAt = Date.now();
  await page.goto("/?__e2eSummary=tracks-slow");
  await expectHealthyEmptySummary(page);
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(650);
  await page.waitForTimeout(1_000);
  expect(slowRequests).toBe(1);
  page.off("request", countSlow);
  await expect(page.getByRole("button", { name: "Retry summary" })).toHaveCount(0);

  await context.addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "es",
    },
  ]);
  await page.goto("/?__e2eSummary=tags-query");
  await expect(page.getByText("No disponible", { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Reintentar resumen" }),
  ).toBeVisible();
  await page.goto("/library");
  await expect(page).toHaveURL(/\/library$/);
});
