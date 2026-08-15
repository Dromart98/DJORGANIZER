import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

async function createCrateFromSelection(
  page: import("@playwright/test").Page,
  crateName: string,
  titles: string[],
) {
  await page.goto("/library?sort=title&direction=asc");
  for (const title of titles) {
    await page.getByRole("checkbox", { name: `Select ${title}` }).check();
  }
  const bulkActions = page.locator(".bulk-actions");
  await bulkActions.getByRole("button", { name: "Create crate", exact: true }).click();
  await bulkActions.getByLabel("Crate name").fill(crateName);
  await bulkActions
    .getByRole("button", { name: `Create with ${titles.length} selected` })
    .click();
  await expect(
    bulkActions.locator('span.form-message--success[role="status"]'),
  ).toContainText("Crate created.", { timeout: 20_000 });
}

test("@authenticated compares and merges crates without deleting the source", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-crate-tools-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const alpha = `Alpha ${runId}`;
  const beta = `Beta ${runId}`;
  const gamma = `Gamma ${runId}`;
  const crateA = `Crate A ${runId}`;
  const crateB = `Crate B ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Crate tools E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  for (const [index, title] of [alpha, beta, gamma].entries()) {
    await page.getByLabel("Title *").fill(title);
    await page.getByRole("button", { name: "Add track" }).click();
    await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });
    if (index < 2) await page.goto("/library/new");
  }

  await createCrateFromSelection(page, crateA, [alpha, beta]);
  await createCrateFromSelection(page, crateB, [beta, gamma]);

  await page.goto("/crates/tools");
  await page.getByLabel("First crate").selectOption({ label: crateA });
  await page.getByLabel("Second crate").selectOption({ label: crateB });
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByRole("heading", { name: /Common · 1/ })).toBeVisible();
  await expect(page.getByText(beta, { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Only first · 1/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Only second · 1/ })).toBeVisible();

  await page.goto("/crates/tools");
  await page.getByLabel("Source").selectOption({ label: crateB });
  await page.getByLabel("Target").selectOption({ label: crateA });
  await page.getByRole("button", { name: "Preview merge" }).click();
  await expect(page.getByText(/1 new tracks will be added/)).toBeVisible();
  await expect(page.getByText(gamma, { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Apply merge" }).click();
  await expect(
    page.getByText("Crates merged. The source crate was kept unchanged."),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("link", { name: "Back to crates" }).click();
  await page.getByRole("link", { name: crateA }).click();
  await expect(page.locator(".crate-track-list > li")).toHaveCount(3);

  await page.goto(`/crates/tools?trackSearch=${encodeURIComponent(beta)}`);
  await page.getByRole("link", { name: "Show crates" }).first().click();
  await expect(page.getByRole("link", { name: crateA })).toBeVisible();
  await expect(page.getByRole("link", { name: crateB })).toBeVisible();
});
