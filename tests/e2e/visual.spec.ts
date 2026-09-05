import { expect, test } from "@playwright/test";
import { mockPortalApi } from "./portal-fixture";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "4k", width: 3840, height: 2160 },
];
const textMask = "h1,h2,h3,p,span,small,b,strong,label,button,input,select,td,th";

async function stabilizeRendering(page: import("@playwright/test").Page) {
  await page.addStyleTag({ content: `${textMask}{font-family:Arial,sans-serif!important;line-height:1.25!important}` });
}

function screenshotOptions(page: import("@playwright/test").Page) {
  return { animations: "disabled" as const, maxDiffPixelRatio: 0.015, mask: [page.locator(textMask)], maskColor: "#ff00ff" };
}

test.skip(({ browserName }) => browserName !== "chromium", "One stable browser owns pixel baselines; all engines run structural checks.");

for (const viewport of viewports) {
  test(`visual baseline: ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await stabilizeRendering(page);
    await expect(page.locator(".login-card")).toHaveScreenshot(`login-${viewport.name}.png`, screenshotOptions(page));

    await mockPortalApi(page);
    await page.goto("/hr/learning-management");
    await stabilizeRendering(page);
    await expect(page.getByRole("heading", { name: "Learning Management", exact: true })).toBeVisible();
    await expect(page.locator(".content")).toHaveScreenshot(`learning-management-${viewport.name}.png`, screenshotOptions(page));

    await page.goto("/reports/landd-detail-report");
    await stabilizeRendering(page);
    await expect(page.getByRole("heading", { name: "L&D Detail Report" })).toBeVisible();
    await expect(page.locator(".content")).toHaveScreenshot(`learning-report-${viewport.name}.png`, screenshotOptions(page));
  });
}
