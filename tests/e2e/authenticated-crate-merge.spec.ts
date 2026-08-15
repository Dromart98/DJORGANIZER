import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

async function createCrate(
  page: import("@playwright/test").Page,
  name: string,
  selectedTitles: string[],
) {
  await page.goto("/library?sort=title&direction=asc");
  for (const title of selectedTitles) {
    await page.getByRole("checkbox", { name: `Select ${title}` }).check();
  }
  const bulkActions = page.locator(".bulk-actions");
  await bulkActions.getByRole("button", { name: "Create crate", exact: true }).click();
  await bulkActions.getByLabel("Crate name").fill(name);
  await bulkActions
    .getByRole("button", { name: `Create with ${selectedTitles.length} selected` })
    .click();
  await expect(
    bulkActions.locator('span.form-message--success[role="status"]'),
  ).toContainText("Crate created.", { timeout: 20_000 });
}

test("@authenticated previews and merges manual crates while preserving the source", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-merge-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const alpha = `Alpha ${runId}`;
  const common = `Common ${runId}`;
  const sourceOnly = `Zulu ${runId}`;
  const sourceCrate = `Source ${runId}`;
  const targetCrate = `Target ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Crate merge E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  for (const [index, title] of [alpha, common, sourceOnly].entries()) {
    await page.getByLabel("Title *").fill(title);
    await page.getByRole("button", { name: "Add track" }).click();
    await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });
    if (index < 2) await page.goto("/library/new");
  }

  await createCrate(page, targetCrate, [alpha, common]);
  await createCrate(page, sourceCrate, [common, sourceOnly]);

  await page.goto("/crates");
  await page.getByRole("link", { name: "Merge crates" }).click();
  await page.getByLabel("Source crate").selectOption({ label: sourceCrate });
  await page.getByLabel("Target crate").selectOption({ label: targetCrate });
  await page.getByRole("button", { name: "Preview merge" }).click();
  await expect(page.getByText(/1 new tracks from/)).toBeVisible();
  await expect(page.getByText(sourceOnly, { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "Apply merge" }).click();
  await expect(
    page.getByText("Crates merged. The source crate was preserved."),
  ).toBeVisible({ timeout: 20_000 });

  await page.goto("/crates");
  await page.getByRole("link", { name: targetCrate }).click();
  const targetItems = page.locator("ol.crate-track-list > li");
  await expect(targetItems).toHaveCount(3);
  await expect(targetItems.nth(0)).toContainText(alpha);
  await expect(targetItems.nth(1)).toContainText(common);
  await expect(targetItems.nth(2)).toContainText(sourceOnly);

  await page.goto("/crates");
  await page.getByRole("link", { name: sourceCrate }).click();
  const sourceItems = page.locator("ol.crate-track-list > li");
  await expect(sourceItems).toHaveCount(2);
  await expect(sourceItems.nth(0)).toContainText(common);
  await expect(sourceItems.nth(1)).toContainText(sourceOnly);
});
