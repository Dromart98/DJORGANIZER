import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

test("@authenticated keeps a long Crates page reachable with document scrolling", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `crates-scroll-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const isMobile = testInfo.project.name === "mobile";

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);

  await page.goto("/signup?next=/library/new");
  await page.getByLabel("Name").fill("DJ Crates Scroll");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library\/new$/, { timeout: 20_000 });

  await page.getByLabel("Title *").fill(`Scroll fixture ${runId}`);
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, { timeout: 20_000 });

  await page.goto("/crates");
  const organizationLayout = page.locator(".organization-layout");
  const organizationSidebar = page.locator(".organization-sidebar");
  await expect(organizationLayout).toBeVisible();
  await expect(organizationSidebar).toBeVisible();

  await expect
    .poll(() => organizationSidebar.evaluate((element) => getComputedStyle(element).position))
    .toBe("static");

  await page.evaluate(() => {
    const grid = document.querySelector(".crate-grid") ?? document.querySelector(".organization-layout > div");
    if (!grid) throw new Error("Crates content container was not found");
    for (let index = 0; index < 18; index += 1) {
      const fixture = document.createElement("div");
      fixture.className = "card crate-card";
      fixture.style.minHeight = "96px";
      fixture.textContent = `Scroll regression fixture ${index + 1}`;
      grid.appendChild(fixture);
    }

    const tagsPanel = document.querySelector(".organization-form--tags");
    if (!tagsPanel) throw new Error("Crates tags panel was not found");
    const tagList = document.createElement("ul");
    tagList.className = "tag-list";
    for (let index = 0; index < 18; index += 1) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `Sidebar control fixture ${index + 1}`;
      item.appendChild(button);
      tagList.appendChild(item);
    }
    tagsPanel.appendChild(tagList);
  });

  const metrics = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement;
    const main = document.querySelector("main");
    const layout = document.querySelector(".organization-layout");
    const sidebar = document.querySelector(".organization-sidebar");
    if (!scrollingElement || !main || !layout || !sidebar) throw new Error("Expected layout elements are missing");
    return {
      documentScrollable: scrollingElement.scrollHeight > scrollingElement.clientHeight,
      horizontalOverflow: scrollingElement.scrollWidth > scrollingElement.clientWidth,
      layoutHasCompetingScroll: layout.scrollHeight > layout.clientHeight && ["auto", "scroll"].includes(getComputedStyle(layout).overflowY),
      mainHasCompetingScroll: main.scrollHeight > main.clientHeight && ["auto", "scroll"].includes(getComputedStyle(main).overflowY),
      sidebarHasCompetingScroll:
        sidebar.scrollHeight > sidebar.clientHeight &&
        ["auto", "scroll"].includes(getComputedStyle(sidebar).overflowY),
      tagListHasCompetingScroll: Array.from(document.querySelectorAll(".organization-form--tags .tag-list")).some(
        (tagList) =>
          tagList.scrollHeight > tagList.clientHeight &&
          ["auto", "scroll"].includes(getComputedStyle(tagList).overflowY),
      ),
      sidebarUsesLayoutHeight:
        Math.abs(sidebar.getBoundingClientRect().height - layout.getBoundingClientRect().height) < 1,
    };
  });

  expect(metrics.documentScrollable).toBe(true);
  expect(metrics.horizontalOverflow).toBe(false);
  expect(metrics.layoutHasCompetingScroll).toBe(false);
  expect(metrics.mainHasCompetingScroll).toBe(false);
  expect(metrics.sidebarHasCompetingScroll).toBe(false);
  expect(metrics.tagListHasCompetingScroll).toBe(false);
  if (!isMobile) expect(metrics.sidebarUsesLayoutHeight).toBe(true);

  const lastControl = organizationSidebar.getByRole("button", {
    name: "Sidebar control fixture 18",
  });
  await lastControl.scrollIntoViewIfNeeded();
  await expect(lastControl).toBeVisible();

  if (!isMobile) {
    const shellSidebar = page.locator(".app-shell > aside");
    await shellSidebar.getByRole("button", { name: "Collapse sidebar" }).click();
    await lastControl.scrollIntoViewIfNeeded();
    await expect(lastControl).toBeVisible();

    await page.evaluate(() => {
      document.body.style.zoom = "200%";
    });
    await lastControl.scrollIntoViewIfNeeded();
    await expect(lastControl).toBeVisible();
    await page.evaluate(() => {
      document.body.style.zoom = "";
    });
  }

  await lastControl.focus();
  await expect(lastControl).toBeFocused();
});
