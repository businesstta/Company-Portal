import { expect, test } from "@playwright/test";
import { mockPortalApi } from "./portal-fixture";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "4k", width: 3840, height: 2160 },
];

test.skip(({ browserName }) => browserName !== "chromium", "One stable browser owns pixel baselines; all engines run structural checks.");

for (const viewport of viewports) {
  test(`visual baseline: ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await expect(page.locator(".login-card")).toHaveScreenshot(`login-${viewport.name}.png`, { animations: "disabled", maxDiffPixelRatio: 0.015 });

    await mockPortalApi(page);
    await page.goto("/hr/learning-management");
    await expect(page.getByRole("heading", { name: "Learning Management", exact: true })).toBeVisible();
    await expect(page.locator(".content")).toHaveScreenshot(`learning-management-${viewport.name}.png`, { animations: "disabled", maxDiffPixelRatio: 0.015 });

    await page.goto("/reports/landd-detail-report");
    await expect(page.getByRole("heading", { name: "L&D Detail Report" })).toBeVisible();
    await expect(page.locator(".content")).toHaveScreenshot(`learning-report-${viewport.name}.png`, { animations: "disabled", maxDiffPixelRatio: 0.015 });
  });
}
