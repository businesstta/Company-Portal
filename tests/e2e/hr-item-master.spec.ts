import { test, expect } from "@playwright/test";
import { mockPortalApi } from "./portal-fixture";

test("HR masters add, save, edit and reload all four sections", async ({ page }) => {
  await mockPortalApi(page);
  const saved: Record<string, string>[] = [];
  await page.route("**/api/hr-item-master", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: saved });
    const input = route.request().postDataJSON();
    const row = { id: input.id || String(saved.length + 1), item_type: input.itemType, code: input.code, name: input.name };
    const index = saved.findIndex(item => item.id === row.id);
    if (index < 0) saved.push(row); else saved[index] = row;
    await route.fulfill({ json: row });
  });
  await page.goto("/settings/hr-item-master");
  for (const [title, label] of [["Main Category", "Main Category"], ["Employee Level", "Level"], ["Training Type", "Type"], ["Course Category", "Course"]]) {
    const section = page.getByRole("region", { name: title, exact: true });
    await section.getByRole("button", { name: `Add ${title} row` }).click();
    await section.getByLabel(`${title} code 1`, { exact: true }).fill("C01");
    await section.getByLabel(`${label} name 1`, { exact: true }).fill(`${title} sample`);
    await section.getByRole("button", { name: "Save", exact: true }).click();
    await expect(section.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  }
  await page.getByLabel("Main Category name 1", { exact: true }).fill("Updated category");
  await page.getByRole("region", { name: "Main Category", exact: true }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Main Category", exact: true }).getByRole("button", { name: "Saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Main Category name 1", { exact: true })).toHaveValue("Updated category");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("HR master removal confirms saved rows, preserves failures, and removes drafts locally", async ({ page }) => {
  await mockPortalApi(page);
  let saved = ["main_category", "employee_level", "training_type", "course_category"].map((type, index) => ({ id: `10000000-0000-4000-8000-00000000000${index + 1}`, item_type: type, code: "01", name: "Sample" }));
  let failDelete = true;
  let deletes = 0;
  await page.route("**/api/hr-item-master**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: saved });
    deletes++;
    if (failDelete) return route.fulfill({ status: 409, json: { error: "This item is in use and cannot be removed." } });
    const id = new URL(route.request().url()).pathname.split("/").pop();
    saved = saved.filter(row => row.id !== id);
    await route.fulfill({ json: { message: "Item removed" } });
  });
  await page.goto("/settings/hr-item-master");
  const remove = page.getByRole("button", { name: "Remove Main Category row 1", exact: true });
  await remove.click();
  const modal = page.getByRole("dialog", { name: "Remove this item?" });
  await expect(modal).toContainText("01");
  await expect(modal).toContainText("Sample");
  await expect(modal.getByRole("button", { name: "Cancel" })).toBeFocused();
  await modal.getByRole("button", { name: "Cancel" }).click();
  expect(deletes).toBe(0);
  await remove.click();
  await modal.getByRole("button", { name: "Remove item" }).click();
  await expect(page.getByRole("alert")).toContainText("in use");
  await expect(remove).toBeEnabled();
  failDelete = false;
  for (const title of ["Main Category", "Employee Level", "Training Type", "Course Category"]) {
    await page.getByRole("button", { name: `Remove ${title} row 1`, exact: true }).click();
    await modal.getByRole("button", { name: "Remove item" }).click();
    await expect(page.getByRole("region", { name: title, exact: true })).toContainText("No items yet");
  }
  await page.reload();
  await expect(page.getByText("No items yet. Use + Add row to get started.")).toHaveCount(4);
  const beforeDraft = deletes;
  await page.getByRole("button", { name: "Add Main Category row", exact: true }).click();
  await page.getByRole("button", { name: "Remove Main Category row 1", exact: true }).click();
  await expect(page.getByText("No items yet. Use + Add row to get started.")).toHaveCount(4);
  expect(deletes).toBe(beforeDraft);
});
