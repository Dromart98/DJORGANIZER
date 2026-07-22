import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated keeps a long Crates page reachable with document scrolling", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const isMobile = testInfo.project.name === "mobile";

  await page.context().addCookies([
    { name: "djorganizer-locale", url: "http://127.0.0.1:3100", value: "en" },
  ]);
  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("Scroll test DJ");
  await page.getByLabel("Email").fill(`scroll-${runId}@djorganizer.test`);
  await page.getByLabel("Password").fill(`DjOrganizer-${runId}!`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/);

  await page.getByLabel("Title *").fill(`Scroll track ${runId}`);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/);

  for (let index = 0; index < 14; index += 1) {
    await page.goto("/crates");
    const form = page.locator("form.organization-form");
    await form.getByLabel("Name").fill(
      `Scroll crate ${String(index + 1).padStart(2, "0")} ${"long ".repeat(12)}`,
    );
    await form.getByLabel("Description").fill("Long crate description ".repeat(20));
    await form.getByRole("button", { name: "Create crate" }).click();
    await expect(page).toHaveURL(/\/crates\/[0-9a-f-]+\?created=1$/);
  }

  for (let index = 0; index < 18; index += 1) {
    await page.goto("/crates");
    const form = page.locator("form.tag-create-form");
    await form.getByLabel("Name").fill(`Scroll tag ${String(index + 1).padStart(2, "0")}`);
    await form.getByRole("button", { name: "Add" }).click();
    await expect(page).toHaveURL(/\/crates\?tagCreated=1$/);
  }

  await page.goto("/crates");
  await expect(page.locator(".crate-grid > a")).toHaveCount(14);
  await expect(page.locator(".tag-list > li")).toHaveCount(18);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.scrollingElement!.scrollHeight > document.scrollingElement!.clientHeight,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => {
      const scrollables = [document.scrollingElement, document.querySelector("main"), document.querySelector(".organization-layout")]
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .filter((element) => element.scrollHeight > element.clientHeight)
        .filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY));
      return scrollables.length;
    }),
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const lastTagDelete = page.locator(".tag-list li").last().getByRole("button", { name: "Delete" });
  await lastTagDelete.focus();
  await expect(lastTagDelete).toBeFocused();
  await expect(lastTagDelete).toBeVisible();
  expect(await lastTagDelete.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const mobileNav = document.querySelector(".mobile-nav")?.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= (mobileNav?.top ?? window.innerHeight);
  })).toBe(true);

  if (!isMobile) {
    await page.locator(".app-shell > aside").getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator(".app-shell")).toHaveClass(/app-shell--collapsed/);
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
    await expect(lastTagDelete).toBeVisible();
    await page.evaluate(() => { document.body.style.zoom = "200%"; });
    await lastTagDelete.focus();
    await expect(lastTagDelete).toBeVisible();
    await page.evaluate(() => { document.body.style.zoom = ""; });
  }

  await page.locator("#main-content").focus();
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press("Tab");
    if (await lastTagDelete.evaluate((element) => document.activeElement === element)) break;
  }
  await expect(lastTagDelete).toBeFocused();
});
