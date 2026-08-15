import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);
test.setTimeout(120_000);

async function addTrack(
  page: import("@playwright/test").Page,
  values: { genre: string; subgenre: string; title: string },
) {
  await page.getByLabel("Title *").fill(values.title);
  await page.getByLabel("Genre", { exact: true }).fill(values.genre);
  await page.getByLabel("Subgenre", { exact: true }).fill(values.subgenre);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });
}

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

test("@authenticated previews and applies genre and subgenre ordering", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-sort-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const alpha = `Alpha ${runId}`;
  const beta = `Beta ${runId}`;
  const gamma = `Gamma ${runId}`;
  const crateName = `Sort ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Crate sort E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  await addTrack(page, { genre: "Techno", subgenre: "Peak Time", title: alpha });
  await page.goto("/library/new");
  await addTrack(page, { genre: "House", subgenre: "Deep House", title: beta });
  await page.goto("/library/new");
  await addTrack(page, { genre: "House", subgenre: "Afro House", title: gamma });
  await createCrate(page, crateName, [alpha, beta, gamma]);

  await page.goto("/crates");
  await page.getByRole("link", { name: crateName }).click();
  await expectCrateOrder(page, [alpha, beta, gamma]);

  await page.getByRole("link", { name: "Sort" }).click();
  await page.getByLabel("Sort by").selectOption("genre");
  await page.getByLabel("Direction").selectOption("asc");
  await page.getByRole("button", { name: "Preview order" }).click();
  await page.getByRole("button", { name: "Apply order" }).click();
  await expect(page.getByText("The new crate order was saved.")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("link", { name: "Back to crate" }).click();
  await expectCrateOrder(page, [beta, gamma, alpha]);

  await page.getByRole("link", { name: "Sort" }).click();
  await page.getByLabel("Sort by").selectOption("subgenre");
  await page.getByLabel("Direction").selectOption("asc");
  await page.getByRole("button", { name: "Preview order" }).click();
  await page.getByRole("button", { name: "Apply order" }).click();
  await expect(page.getByText("The new crate order was saved.")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("link", { name: "Back to crate" }).click();
  await expectCrateOrder(page, [gamma, beta, alpha]);
});
