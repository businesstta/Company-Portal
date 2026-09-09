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
