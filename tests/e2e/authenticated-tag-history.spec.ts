import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated records and undoes a tag assignment", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-tag-history-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const trackTitle = `Tag history ${runId}`;
  const tagName = `Peak ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Tag history E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  await page.getByLabel("Title *").fill(trackTitle);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });

  await page.goto("/crates");
  const createTagForm = page.locator("form.tag-create-form");
  await createTagForm.getByLabel("Name").fill(tagName);
  await createTagForm.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page).toHaveURL(/tagCreated=1$/, { timeout: 20_000 });

  await page.goto("/library");
  await page.getByRole("checkbox", { name: `Select ${trackTitle}` }).check();
  await page.getByLabel("Tag for selection").selectOption({ label: tagName });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/tagged=1$/, { timeout: 20_000 });
  await expect(
    page.locator("tbody tr").filter({ hasText: trackTitle }).getByText(tagName),
  ).toBeVisible();

  const history = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Tag history" }),
  });
  await expect(history.getByText(tagName, { exact: true })).toBeVisible();
  await expect(history.getByText("Assigned to 1 track", { exact: true })).toBeVisible();
  await expect(history.getByRole("button", { name: "Undo" })).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(tagName);
    expect(dialog.message()).toContain("1 affected track");
    await dialog.accept();
  });
  await history.getByRole("button", { name: "Undo" }).click();

  await expect(page).toHaveURL(/tagUndone=1/, { timeout: 20_000 });
  await expect(page.getByText("The tag change was undone.")).toBeVisible();
  await expect(
    page.locator("tbody tr").filter({ hasText: trackTitle }).getByText(tagName),
  ).toHaveCount(0);
  await expect(history.getByText("Already undone")).toBeVisible();
});
