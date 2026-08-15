import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated archives, undoes and restores a library track", async ({ page }, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-archive-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const title = `Archive ${runId}`;

  await page.context().addCookies([{
    name: "djorganizer-locale",
    url: "http://127.0.0.1:3100",
    value: "en",
  }]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Archive E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  await page.getByLabel("Title *").fill(title);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });

  await page.goto("/library");
  let row = page.locator("tbody tr").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(0, { timeout: 20_000 });

  let history = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Archive history" }),
  });
  await expect(history.getByText(title, { exact: true })).toBeVisible();
  await expect(history.getByText("Archived", { exact: true })).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(title);
    expect(dialog.message()).toContain("active library");
    await dialog.accept();
  });
  await history.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(/archiveUndone=1/, { timeout: 20_000 });
  await expect(page.getByText("The archive change was undone.")).toBeVisible();
  await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(1);
  await expect(history.getByText("Already undone")).toBeVisible();

  row = page.locator("tbody tr").filter({ hasText: title });
  await row.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(0, { timeout: 20_000 });

  await page.getByLabel("Status").selectOption("archived");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/status=archived/);
  row = page.locator("tbody tr").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/library");
  await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(1);
  history = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Archive history" }),
  });
  await expect(history.getByText("Restored", { exact: true })).toBeVisible();
});
