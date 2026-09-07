import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
  await expect(page.getByRole("columnheader", { name: "Date", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "01/09/2026", exact: true })).toBeVisible();
  const tableOverflow = await page.locator(".learning-table-scroll").evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(tableOverflow.scrollWidth).toBeLessThanOrEqual(tableOverflow.clientWidth + 1);
  const summary = page.locator(".learning-count-grid");
  await expect(summary.getByText("Total Course Assignments", { exact: true })).toBeVisible();
  await expect(summary.getByText("Number of Courses Assigned to All Employees", { exact: true })).toBeVisible();
  await expect(summary.getByText("Number of Courses Assigned to Each Department", { exact: true })).toBeVisible();
  await expect(summary.getByText("Number of Courses Assigned to Each Project Location", { exact: true })).toBeVisible();
  await expect(summary.locator("article").nth(1).locator("b")).toHaveText("2");
  await expect(summary.locator("article").nth(2).locator("b")).toHaveText("2");
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
  const workbook = await excelDownload;
  await expect(workbook.suggestedFilename()).toMatch(/learning-management-details-.*\.xlsx$/);
  const workbookPath = await workbook.path();
  expect(workbookPath).not.toBeNull();
  expect((await readFile(workbookPath!)).subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");
  const pdfDownload = page.waitForEvent("download");
  await page.getByTitle("Export Assessment performance to PDF").click();
  const assessmentPdf = await pdfDownload;
  await expect(assessmentPdf.suggestedFilename()).toMatch(/assessment-performance-.*\.pdf$/);
  const assessmentPdfPath = await assessmentPdf.path();
  expect(assessmentPdfPath).not.toBeNull();
  expect((await readFile(assessmentPdfPath!, "latin1")).toString()).toContain("501.00 Td (Learning Management reporting export)");
});

test("create course defaults its date to today", async ({ page }) => {
  await mockPortalApi(page);
  await page.goto("/hr/learning-management");
  await page.getByRole("button", { name: /New Course/ }).click();
  const expectedToday = await page.evaluate(() => {
    const date = new Date(), offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  });
  await expect(page.locator('input[name="courseDate"]')).toHaveValue(expectedToday);
});

test("learning chart report renders verified charts and exports each format", async ({ page }) => {
  await mockPortalApi(page);
  await page.goto("/overview");
  await page.getByRole("button", { name: /^Reports/ }).click();
  await page.getByRole("button", { name: /^HR Management/ }).click();
  await page.getByRole("button", { name: "L&D Chart Report", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/landd-chart-report$/);
  await expect(page.getByRole("heading", { name: "L&D Chart Report" })).toBeVisible();
  await expect(page.locator(".chart-report-card")).toHaveCount(7);
  await expect(page.locator(".chart-report-title aside b")).toHaveText("2");
  await expect(page.locator(".chart-report-title aside small")).toHaveText("Course assignments");
  await expect(page.getByRole("heading", { name: "Overall learning progress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assignment status mix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Learning activity trend" })).toBeVisible();
  const excelDownload = page.waitForEvent("download");
  await page.getByTitle("Export Average progress by course to Excel").click();
  await expect((await excelDownload).suggestedFilename()).toMatch(/average-progress-by-course-.*\.xlsx$/);
  const pdfDownload = page.waitForEvent("download");
  await page.getByTitle("Export Assessment score distribution to PDF").click();
  const pdf = await pdfDownload;
  await expect(pdf.suggestedFilename()).toMatch(/assessment-score-distribution-.*\.pdf$/);
  const pdfPath = await pdf.path();
  expect(pdfPath).not.toBeNull();
  const pdfContents = await readFile(pdfPath!);
  expect(pdfContents.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfContents.toString("latin1")).toContain("501.00 Td (Learning Management reporting export)");
});

test("learning chart report keeps verified charts visible when the trend request fails", async ({ page }) => {
  await mockPortalApi(page, { trendStatus: 500 });
  await page.goto("/reports/landd-chart-report");
  await expect(page.locator(".chart-report-card")).toHaveCount(7);
  await expect(page.getByRole("heading", { name: "Overall learning progress" })).toBeVisible();
  await expect(page.getByText("Monthly activity is temporarily unavailable.")).toBeVisible();
  await expect(page.getByTitle("Export Learning activity trend to Excel")).toBeDisabled();
});
