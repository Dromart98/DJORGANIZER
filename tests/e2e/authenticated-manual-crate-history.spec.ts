import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);
test.setTimeout(120_000);

async function addTrack(
  page: import("@playwright/test").Page,
  title: string,
) {
  await page.getByLabel("Title *").fill(title);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });
}

async function expectCrateOrder(
  page: import("@playwright/test").Page,
  titles: string[],
) {
  const items = page.locator("ol.crate-track-list > li");
  await expect(items).toHaveCount(titles.length);
  for (const [index, title] of titles.entries()) {
    await expect(items.nth(index)).toContainText(title);
  }
}

test("@authenticated records and undoes manual crate membership and order changes", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-crate-history-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const first = `History first ${runId}`;
  const second = `History second ${runId}`;
  const crateName = `History crate ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Crate history E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  await addTrack(page, first);
  await page.goto("/library/new");
  await addTrack(page, second);

  await page.goto("/library?sort=title&direction=asc");
  await page.getByRole("checkbox", { name: `Select ${first}` }).check();
  const bulkActions = page.locator(".bulk-actions");
  await bulkActions.getByRole("button", { name: "Create crate", exact: true }).click();
  await bulkActions.getByLabel("Crate name").fill(crateName);
  await bulkActions.getByRole("button", { name: "Create with 1 selected" }).click();
  await expect(
    bulkActions.locator('span.form-message--success[role="status"]'),
  ).toContainText("Crate created.", { timeout: 20_000 });

  await page.goto("/crates");
  await page.getByRole("link", { name: crateName }).click();
  await expectCrateOrder(page, [first]);

  const availableSecond = page
    .locator(".available-track-list li")
    .filter({ hasText: second });
  await availableSecond.getByRole("button", { name: "Add" }).click();
  await expect(page).toHaveURL(/trackAdded=1/, { timeout: 20_000 });
  await expectCrateOrder(page, [first, second]);

  let history = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Crate history" }),
  });
  await expect(history.getByText("Track added", { exact: true })).toBeVisible();
  await expect(history.getByText("1 → 2 tracks", { exact: true })).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("previous 1-track order");
    await dialog.accept();
  });
  await history.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(/historyUndone=1/, { timeout: 20_000 });
  await expect(page.getByText("The crate change was undone.")).toBeVisible();
  await expectCrateOrder(page, [first]);

  const availableSecondAgain = page
    .locator(".available-track-list li")
    .filter({ hasText: second });
  await availableSecondAgain.getByRole("button", { name: "Add" }).click();
  await expectCrateOrder(page, [first, second]);

  await page.getByRole("button", { name: `Move ${second} up` }).click();
  await expectCrateOrder(page, [second, first]);
  history = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Crate history" }),
  });
  await expect(history.getByText("Order changed", { exact: true })).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("previous 2-track order");
    await dialog.accept();
  });
  await history.getByRole("button", { name: "Undo" }).click();
  await expectCrateOrder(page, [first, second]);
});
