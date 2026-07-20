import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated exposes screen-reader navigation and library state", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `a11y-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const title = `Accessible track ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);

  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("DJ Accessibility");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });
  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Library", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.getByLabel("Title *").fill(title);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, {
    timeout: 20_000,
  });

  await page.goto("/library");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Library", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await expect(page.locator("table caption")).toHaveText("Library");
  await expect(
    page.getByRole("columnheader", { name: "Added" }),
  ).toHaveAttribute("aria-sort", "ascending");

  const selectionStatus = page.locator(".bulk-toolbar [role='status']");
  await expect(selectionStatus).toHaveText("0 selected items");

  const trackCheckbox = page.getByRole("checkbox", {
    name: `Select ${title}`,
  });
  await trackCheckbox.check();
  await expect(trackCheckbox).toBeChecked();
  await expect(selectionStatus).toHaveText("1 selected item");

  await expect(
    page.getByRole("link", { name: `View and edit: ${title}` }),
  ).toBeVisible();

  await page.getByRole("columnheader", { name: "Title" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(
    page.getByRole("columnheader", { name: "Title" }),
  ).toHaveAttribute("aria-sort", "ascending");
});
