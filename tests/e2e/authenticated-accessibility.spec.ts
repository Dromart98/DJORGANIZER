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
  const displayName = "DJ Áurea 東京 — Sesión nocturna con un nombre muy largo";
  const isMobile = testInfo.project.name === "mobile";
  const navigationName = isMobile ? "Mobile navigation" : "Main navigation";

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);

  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });
  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
  await expect(
    page
      .getByRole("navigation", { name: navigationName })
      .getByRole("link", { name: "Library", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  for (const route of ["/library", "/import", "/crates", "/settings"]) {
    await page.goto(route);
    await expect(page.locator(".brand:visible")).toHaveCount(1);
    await expect(page.locator(".brand:visible")).toHaveAttribute(
      "href",
      "/library",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
  }

  await page.goto("/import");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  const libraryBrand = page.locator(".brand:visible");
  await expect(libraryBrand).toHaveCount(1);
  await expect(libraryBrand).toHaveAccessibleName("Go to Library");
  await expect(libraryBrand).toHaveAttribute("href", "/library");
  await skipLink.focus();
  await page.keyboard.press("Tab");
  await expect(libraryBrand).toBeFocused();
  await libraryBrand.press("Enter");
  await expect(page).toHaveURL(/\/library$/, { timeout: 20_000 });

  if (!isMobile) {
    const sidebar = page.locator("aside");
    const collapseButton = sidebar.getByRole("button", {
      name: "Collapse sidebar",
    });

    await expect(sidebar.getByTitle(displayName)).toHaveText(displayName);
    await expect(page.getByText(email, { exact: true })).toHaveCount(0);
    await collapseButton.click();
    await expect(sidebar.locator(".sidebar-status")).toHaveCount(0);
    await expect(sidebar.locator(".brand")).toBeVisible();
    await expect(sidebar.locator(".brand")).toHaveAccessibleName("Go to Library");
    await expect(sidebar.locator(".brand")).toHaveAttribute("href", "/library");
    await expect(page.locator(".app-shell")).toHaveClass(/app-shell--collapsed/);
    await expect
      .poll(() =>
        sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileTopbar = page.locator(".mobile-topbar");
    const mobileBrand = mobileTopbar.locator(".brand");
    await expect(mobileBrand).toBeVisible();
    await expect(mobileBrand).toHaveAttribute("href", "/library");
    await expect(page.locator(".mobile-topbar > span")).toHaveText("Library");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        mobileTopbar.evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(
      sidebar.getByRole("button", { name: "Expand sidebar" }),
    ).toBeFocused();
    await sidebar.getByRole("button", { name: "Expand sidebar" }).press("Enter");
    await expect(sidebar.getByTitle(displayName)).toBeVisible();

    await page.evaluate(() => {
      document.body.style.zoom = "200%";
    });
    await expect
      .poll(() =>
        sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await page.evaluate(() => {
      document.body.style.zoom = "";
    });

    const settingsLink = sidebar.getByRole("link", { name: "Settings" });
    await settingsLink.focus();
    await expect(settingsLink).toBeFocused();
    await settingsLink.press("Enter");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.goto("/library/new");
  }

  await page.getByLabel("Title *").fill(title);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, {
    timeout: 20_000,
  });

  await page.goto("/library");
  await expect(
    page
      .getByRole("navigation", { name: navigationName })
      .getByRole("link", { name: "Library", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  const selectionStatus = page.locator(".bulk-toolbar > [role='status']");
  await expect(selectionStatus).toHaveText("0 selected items");

  const trackCheckbox = page.getByRole("checkbox", {
    name: `Select ${title}`,
  });
  await trackCheckbox.check();
  await expect(trackCheckbox).toBeChecked();
  await expect(selectionStatus).toHaveText("1 selected item");

  if (isMobile) {
    await expect(
      page.getByRole("link", { name: `Edit: ${title}` }),
    ).toBeVisible();
    await page.context().addCookies([
      {
        name: "djorganizer-locale",
        url: "http://127.0.0.1:3100",
        value: "es",
      },
    ]);
    await page.reload();
    await expect(page.locator(".brand:visible")).toHaveCount(1);
    await expect(page.locator(".brand:visible")).toHaveAccessibleName(
      "Ir a Biblioteca",
    );
    await expect(page.locator(".brand:visible")).toHaveAttribute("href", "/library");
    return;
  }

  await expect(page.locator("table caption")).toHaveText("Library");
  await expect(
    page.getByRole("columnheader", { name: "Added" }),
  ).toHaveAttribute("aria-sort", "ascending");
  await expect(
    page.getByRole("link", { name: `View and edit: ${title}` }),
  ).toBeVisible();

  await page
    .getByRole("columnheader", { name: "Title" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(
    page.getByRole("columnheader", { name: "Title" }),
  ).toHaveAttribute("aria-sort", "ascending");

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "es",
    },
  ]);
  await page.reload();
  await expect(page.locator(".brand:visible")).toHaveCount(1);
  await expect(page.locator(".brand:visible")).toHaveAccessibleName(
    "Ir a Biblioteca",
  );
  await expect(page.locator(".brand:visible")).toHaveAttribute("href", "/library");
});
