import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated records guided metadata cleanup in undo history", async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-cleanup-history-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const beforeTitle = `01 - CLEANUP HISTORY ${runId}`;
  const cleanedTitle = `Cleanup History ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Cleanup history E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  await page.getByLabel("Title *").fill(beforeTitle);
  await page.getByLabel("Artist").fill("Cleanup Artist");
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });
  const detailPath = new URL(page.url()).pathname;

  await page.goto("/library/health/cleanup");
  await expect(
    page.getByRole("heading", { name: "Guided metadata cleanup" }),
  ).toBeVisible();
  const proposal = page.locator("li").filter({ hasText: beforeTitle });
  await expect(proposal.getByText(cleanedTitle, { exact: true })).toBeVisible();
  await proposal.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Apply 1 selected" }).click();

  await expect(page).toHaveURL(/\/library\/health\/cleanup\?.*applied=1/, {
    timeout: 20_000,
  });
  await expect(page.getByText(/1 changes applied/)).toBeVisible();

  await page.goto(detailPath);
  await expect(page.getByLabel("Title *")).toHaveValue(cleanedTitle);
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
});
