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
  await page.getByRole("button", { name: "Department", exact: true }).click();
  await page.getByLabel("Search Department").fill("Information");
  await page.getByRole("listbox", { name: "Department options" }).getByText("Information Technology", { exact: true }).click();
  await expect(page.getByText("1 records")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Responsive Tester" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Visual Tester" })).toHaveCount(0);
  await page.getByLabel("Search Department").fill("Human");
  await page.getByRole("listbox", { name: "Department options" }).getByText("Human Resources", { exact: true }).click();
  await expect(page.getByText("2 records")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("2 records")).toBeVisible();
  await expect(page.getByLabel("Rows per page")).toHaveValue("50");
  await page.getByLabel("Rows per page").selectOption("200");
  await expect(page.getByLabel("Rows per page")).toHaveValue("200");
  const excelDownload = page.waitForEvent("download");
  await page.getByTitle("Export Learning Management details to Excel").click();
  await expect((await excelDownload).suggestedFilename()).toMatch(/learning-management-details-.*\.xls$/);
  const pdfDownload = page.waitForEvent("download");
  await page.getByTitle("Export Assessment performance to PDF").click();
  await expect((await pdfDownload).suggestedFilename()).toMatch(/assessment-performance-.*\.pdf$/);
});
