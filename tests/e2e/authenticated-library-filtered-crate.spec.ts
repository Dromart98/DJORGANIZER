import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated creates a crate from all active filter results in visible order", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-filtered-crate-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const alphaTitle = `Match Alpha ${runId}`;
  const zuluTitle = `Match Zulu ${runId}`;
  const otherTitle = `Other ${runId}`;
  const crateName = `Filtered ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);

  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Filtered crate E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  for (const title of [alphaTitle, zuluTitle, otherTitle]) {
    await page.getByLabel("Title *").fill(title);
    await page.getByRole("button", { name: "Add track" }).click();
    await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });
    if (title !== otherTitle) await page.goto("/library/new");
  }

  await page.goto(`/library?q=Match&sort=title&direction=desc`);
  await expect(page.getByText("2 tracks", { exact: true })).toBeVisible();

  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(zuluTitle);
  await expect(rows.nth(1)).toContainText(alphaTitle);
  await expect(page.getByText(otherTitle)).toHaveCount(0);

  await page
    .getByRole("button", { name: "Create crate from filters" })
    .click();
  const filterForm = page.locator(".library-toolbar");
  await filterForm.getByLabel("Crate name").fill(crateName);
  await filterForm
    .getByRole("button", { name: "Create with 2 filtered results" })
    .click();

  const created = filterForm.locator(
    'span.form-message--success[role="status"]',
  );
  await expect(created).toContainText("Crate created.", { timeout: 20_000 });
  await created.getByRole("link", { name: "Open crate" }).click();
  await expect(page.getByRole("heading", { name: crateName })).toBeVisible();

  const crateTrackList = page.locator(".crate-track-list");
  const crateTracks = crateTrackList.locator(":scope > li");
  await expect(crateTracks).toHaveCount(2);
  await expect(crateTracks.nth(0)).toContainText(zuluTitle);
  await expect(crateTracks.nth(1)).toContainText(alphaTitle);
  await expect(crateTrackList).not.toContainText(otherTitle);
});
