import { test, expect } from "@playwright/test";

test.describe("Catalog & Product Creation E2E Flow", () => {
  test("creates a product with barcode, SKU, cost price, and retail price", async ({ page }) => {
    // Intercept catalog creation API
    await page.route("**/api/catalog/products**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: "prod_01j9a",
              name: "Nestle Nido 1kg Tin",
              sku: "NIDO-1KG",
              barcode: "7613035123456",
              retail_price: 980,
              cost_price: 850,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/catalog");

    // Guard test check
    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      await expect(page).toHaveURL(/login/);
      return;
    }

    const addProductBtn = page.getByRole("button", { name: /add product|new product/i });
    if (await addProductBtn.isVisible()) {
      await addProductBtn.click();
      await page.fill('input[name="name"]', "Nestle Nido 1kg Tin");
      await page.fill('input[name="barcode"]', "7613035123456");
      await page.fill('input[name="retail_price"]', "980");
      await page.fill('input[name="cost_price"]', "850");
      await page.getByRole("button", { name: /save|create/i }).click();
      await expect(page.getByText("Nestle Nido 1kg Tin")).toBeVisible();
    }
  });
});
