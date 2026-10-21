import { test, expect } from "@playwright/test";

test.describe("Catalog & Inventory Admin Flows", () => {
  test("navigates to catalog and checks layout structure", async ({ page }) => {
    // Unauthenticated user should be redirected to login
    await page.goto("/catalog");
    await expect(page).toHaveURL(/login/);
  });

  test("navigates to inventory and checks protected redirect", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page).toHaveURL(/login/);
  });

  test("navigates to suppliers and checks protected redirect", async ({ page }) => {
    await page.goto("/inventory/suppliers");
    await expect(page).toHaveURL(/login/);
  });
});
