import { expect, test } from "@playwright/test";

test("shows an accessible public shell and keyboard skip link", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu música, lista para mezclar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Organiza tu propia biblioteca" }),
  ).toBeVisible();
  await expect(page.getByText("Biblioteca demo")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", {
      name:
        testInfo.project.name === "mobile"
          ? "Navegación móvil"
          : "Navegación principal",
    }),
  ).toBeVisible();

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("redirects protected routes to a usable login form", async ({ page }) => {
  await page.goto("/library", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Accede a tu biblioteca" }),
  ).toBeVisible();
  await expect(page.getByLabel("Correo")).toHaveAttribute(
    "autocomplete",
    "email",
  );
  await expect(page.getByLabel("Contraseña")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
});

test("switches the navigation language from the locale cookie", async ({
  context,
  page,
}, testInfo) => {
  await context.addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("navigation", {
      name:
        testInfo.project.name === "mobile"
          ? "Mobile navigation"
          : "Main navigation",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Library" })).toBeVisible();
});
