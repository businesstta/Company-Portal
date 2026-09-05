import { expect, test, type Page, type Route } from "@playwright/test";

const allWidths = [320, 360, 390, 412, 768, 1024, 1280, 1366, 1440, 1920, 2560, 3840];
const heights = new Map([[320, 568], [360, 640], [390, 844], [412, 915], [768, 1024], [1024, 768]]);
const dashboard = {
  stats: { totalEmployees: 1033, presentToday: 900, pendingApprovals: 0, onLeave: 3 },
  attendance: { present: 900, absent: 100, leave: 33 }, departments: [], recentRequests: [],
};

async function mockPortalApi(page: Page) {
  await page.addInitScript(() => localStorage.setItem("portal_token", "e2e-token"));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/me/navigation")) body = { menus: ["*"], role: "admin", isWorkflowApprover: true };
    else if (path.endsWith("/profile")) body = { first_name: "Responsive", last_name: "Tester" };
    else if (path.endsWith("/dashboard")) body = dashboard;
    else if (path.endsWith("/notifications/unread-count")) body = { count: 0 };
    else if (path.endsWith("/branding")) body = { iconText: "CP", title: "Company Portal", subtitle: "People & Operations", iconColor: "#6d5ce7" };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function expectViewportSafe(page: Page, label: string) {
  await expect(page.locator("body"), `${label}: page rendered`).toBeVisible();
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    clippedControls: [...document.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([type=hidden]), select")]
      .filter(element => {
        const style = getComputedStyle(element), box = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || box.width === 0 || box.height === 0) return false;
        const collapsedSidebar = element.closest(".sidebar:not(.mobile-open)");
        if (collapsedSidebar && innerWidth <= 1024) return false;
        return box.right < 0 || box.left > innerWidth || box.bottom < 0;
      }).map(element => element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 50) || element.tagName),
  }));
  expect(layout.documentWidth, `${label}: no page-level horizontal overflow`).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.clippedControls, `${label}: interactive controls remain reachable`).toEqual([]);
}

test("login remains usable from 320px through 4K", async ({ page, browserName }) => {
  const widths = browserName === "chromium" ? allWidths : [390, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: heights.get(width) ?? (width >= 1920 ? 1080 : 900) });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in securely/i })).toBeVisible();
    await expectViewportSafe(page, `${browserName} login at ${width}px`);
  }
});

test("authenticated navigation and core pages stay usable", async ({ page, browserName }) => {
  await mockPortalApi(page);
  const widths = browserName === "chromium" ? allWidths : [390, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: heights.get(width) ?? (width >= 1920 ? 1080 : 900) });
    await page.goto("/overview");
    await expect(page.locator(".app-header")).toBeVisible();
    if (width <= 1024) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: /^Human Resource/ }).click();
    await page.getByRole("button", { name: "Learning Management", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Learning Management", exact: true })).toBeVisible();
    const geometry = await page.locator(".lms-hero").evaluate(element => {
      const title = element.querySelector("h1")!.getBoundingClientRect(), action = element.querySelector("button")?.getBoundingClientRect();
      return { titleWidth: title.width, overlaps: action ? !(title.right <= action.left || title.bottom <= action.top || title.top >= action.bottom) : false };
    });
    expect(geometry.titleWidth, `${browserName} LMS title width at ${width}px`).toBeGreaterThan(100);
    expect(geometry.overlaps, `${browserName} LMS hero overlap at ${width}px`).toBe(false);
    await expectViewportSafe(page, `${browserName} LMS at ${width}px`);
    await page.goto("/reports/landd-detail-report");
    await expect(page.getByRole("heading", { name: "L&D Detail Report" })).toBeVisible();
    await expectViewportSafe(page, `${browserName} L&D report at ${width}px`);
  }
});
