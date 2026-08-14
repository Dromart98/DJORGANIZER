import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated creates a crate from the current library selection in visible order", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-selection-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const alphaTitle = `Alpha ${runId}`;
  const zuluTitle = `Zulu ${runId}`;
  const crateName = `Selected ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);

  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Selection E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  for (const title of [alphaTitle, zuluTitle]) {
    await page.getByLabel("Title *").fill(title);
    await page.getByRole("button", { name: "Add track" }).click();
    await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });
    if (title !== zuluTitle) await page.goto("/library/new");
  }

  await page.goto("/library?sort=title&direction=desc");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(zuluTitle);
  await expect(rows.nth(1)).toContainText(alphaTitle);

  await page.getByRole("checkbox", { name: `Select ${alphaTitle}` }).check();
  await page.getByRole("checkbox", { name: `Select ${zuluTitle}` }).check();

  const bulkActions = page.locator(".bulk-actions");
  await bulkActions.getByRole("button", { name: "Create crate", exact: true }).click();
  await bulkActions.getByLabel("Crate name").fill(crateName);
  await bulkActions.getByRole("button", { name: "Create with 2 selected" }).click();

  const created = bulkActions.getByRole("status");
  await expect(created).toContainText("Crate created.", { timeout: 20_000 });
  await created.getByRole("link", { name: "Open crate" }).click();
  await expect(page.getByRole("heading", { name: crateName })).toBeVisible();

  const crateTracks = page.locator(".crate-track-list > li");
  await expect(crateTracks).toHaveCount(2);
  await expect(crateTracks.nth(0)).toContainText(zuluTitle);
  await expect(crateTracks.nth(1)).toContainText(alphaTitle);
});
