import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated compares shared and exclusive crate tracks", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-compare-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const commonTitle = `Common ${runId}`;
  const leftTitle = `Left only ${runId}`;
  const rightTitle = `Right only ${runId}`;
  const leftCrate = `Left crate ${runId}`;
  const rightCrate = `Right crate ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);

  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Crate comparison E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  const titles = [commonTitle, leftTitle, rightTitle];
  for (const [index, title] of titles.entries()) {
    await page.getByLabel("Title *").fill(title);
    await page.getByRole("button", { name: "Add track" }).click();
    await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });
    if (index < titles.length - 1) await page.goto("/library/new");
  }

  async function createCrate(name: string, selectedTitles: string[]) {
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

  await createCrate(leftCrate, [commonTitle, leftTitle]);
  await createCrate(rightCrate, [commonTitle, rightTitle]);

  await page.goto("/crates");
  await page.getByRole("link", { name: "Compare crates" }).click();
  await page.getByLabel("First crate").selectOption({ label: leftCrate });
  await page.getByLabel("Second crate").selectOption({ label: rightCrate });
  await page.getByRole("button", { name: "Compare", exact: true }).click();

  const common = page.getByRole("heading", { name: "In both crates" }).locator("..");
  const leftOnly = page
    .getByRole("heading", { name: `Only in ${leftCrate}` })
    .locator("..");
  const rightOnly = page
    .getByRole("heading", { name: `Only in ${rightCrate}` })
    .locator("..");

  await expect(common).toContainText(commonTitle);
  await expect(common).not.toContainText(leftTitle);
  await expect(common).not.toContainText(rightTitle);
  await expect(leftOnly).toContainText(leftTitle);
  await expect(leftOnly).not.toContainText(rightTitle);
  await expect(rightOnly).toContainText(rightTitle);
  await expect(rightOnly).not.toContainText(leftTitle);
});
