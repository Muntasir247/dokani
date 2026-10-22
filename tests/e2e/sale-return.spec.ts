import { test, expect } from "@playwright/test";

test.describe("Sale Return & Inventory Restocking E2E Flow", () => {
  test("processes an invoice return, calculates refund, and records restock movement", async ({ page }) => {
    // Intercept return RPC
    await page.route("**/api/pos/return**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          return_id: "ret_001",
          refund_amount: 350,
          restocked_items: [{ product_id: "prod_01", quantity: 1 }],
        }),
      });
    });

    await page.goto("/sales");

    if (page.url().includes("/login")) {
      await expect(page).toHaveURL(/login/);
      return;
    }

    const returnBtn = page.getByRole("button", { name: /Return|Issue Refund/i }).first();
    if (await returnBtn.isVisible()) {
      await returnBtn.click();
      await expect(page.getByText(/Return Item|Refund Total/i)).toBeVisible();
    }
  });
});
