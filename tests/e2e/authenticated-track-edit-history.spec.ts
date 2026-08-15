import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated records and undoes an individual track edit", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-history-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const beforeTitle = `History Before ${runId}`;
  const afterTitle = `History After ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Track history E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  await page.getByLabel("Title *").fill(beforeTitle);
  await page.getByLabel("Artist").fill("History Artist");
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });

  await page.getByLabel("Title *").fill(afterTitle);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+\?updated=1$/, {
    timeout: 20_000,
  });
  await expect(page.getByText("Changes saved successfully.")).toBeVisible();

  const historyHeading = page.getByRole("heading", { name: "Edit history" });
  const history = page.locator("section").filter({ has: historyHeading });
  await expect(history.getByText("Title", { exact: true })).toBeVisible();
  await history.getByRole("button", { name: "Undo" }).click();

  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+\?undone=1$/, {
    timeout: 20_000,
  });
  await expect(page.getByText("The edit was undone.")).toBeVisible();
  await expect(page.getByLabel("Title *")).toHaveValue(beforeTitle);
  await expect(page.getByText("Already undone")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
});
