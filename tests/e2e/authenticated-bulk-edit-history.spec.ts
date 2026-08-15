import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated records and undoes a bulk track edit", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-bulk-history-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const first = `Bulk History One ${runId}`;
  const second = `Bulk History Two ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Bulk history E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  await page.getByLabel("Title *").fill(first);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });

  await page.goto("/library/new");
  await page.getByLabel("Title *").fill(second);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });

  await page.goto("/library?sort=title&direction=asc");
  await page.getByRole("checkbox", { name: `Select ${first}` }).check();
  await page.getByRole("checkbox", { name: `Select ${second}` }).check();

  const bulkForm = page.locator("form.bulk-edit-form");
  await bulkForm.locator("#bulk-field").selectOption("genre");
  await bulkForm.locator("#bulk-value").fill("Disco");
  page.once("dialog", (dialog) => dialog.accept());
  await bulkForm.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/bulkUpdated=1/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Recent bulk edits" })).toBeVisible();
  await expect(page.getByText("2 tracks", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo batch" })).toBeVisible();

  const firstRow = page.getByRole("row").filter({ hasText: first });
  const secondRow = page.getByRole("row").filter({ hasText: second });
  await expect(firstRow).toContainText("Disco");
  await expect(secondRow).toContainText("Disco");

  await page.getByRole("button", { name: "Undo batch" }).click();

  await expect(page).toHaveURL(/bulkUndone=1/, { timeout: 20_000 });
  await expect(page.getByText("The bulk edit was undone.")).toBeVisible();
  await expect(page.getByText("Already undone").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo batch" })).toHaveCount(0);

  const restoredFirstRow = page.getByRole("row").filter({ hasText: first });
  const restoredSecondRow = page.getByRole("row").filter({ hasText: second });
  await expect(restoredFirstRow).not.toContainText("Disco");
  await expect(restoredSecondRow).not.toContainText("Disco");
});
