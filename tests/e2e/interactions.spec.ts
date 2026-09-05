import { expect, test } from "@playwright/test";
import { mockPortalApi } from "./portal-fixture";

test("mobile navigation opens, navigates and closes without blocking the page", async ({ page }) => {
  await mockPortalApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overview");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar.mobile-open")).toBeVisible();
  await page.getByRole("button", { name: /^Reports/ }).click();
  await page.getByRole("button", { name: /^HR Management/ }).click();
  await page.getByRole("button", { name: "L&D Detail Report", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/landd-detail-report$/);
  await expect(page.locator(".sidebar.mobile-open")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "L&D Detail Report" })).toBeVisible();
});

test("learning report filters update data and clear correctly", async ({ page }) => {
  await mockPortalApi(page);
  await page.goto("/reports/landd-detail-report");
  await expect(page.getByText("2 records")).toBeVisible();
  await page.getByLabel("Department").selectOption({ label: "Information Technology" });
  await expect(page.getByText("1 records")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Responsive Tester" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Visual Tester" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("2 records")).toBeVisible();
});
