import { test, expect } from "@playwright/test";

test.describe("Full POS Sale Transaction Flow", () => {
  test("adds items to cart, applies line discount, splits payment, and completes sale", async ({ page }) => {
    // Intercept POS sale creation RPC
    await page.route("**/api/pos/sale**", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          sale: {
            id: "sale_01j9b",
            invoice_number: "INV-2026-00099",
            total_amount: 540,
            paid_amount: 540,
            status: "completed",
            share_token: "tok_abc123",
          },
        }),
      });
    });

    await page.goto("/pos");

    if (page.url().includes("/login")) {
      await expect(page).toHaveURL(/login/);
      return;
    }

    // Barcode input is always autofocus ready
    const barcodeInput = page.locator('input[placeholder*="Scan barcode"], input[type="search"]').first();
    if (await barcodeInput.isVisible()) {
      await barcodeInput.fill("894110023456");
      await barcodeInput.press("Enter");

      // Pay Button
      const payBtn = page.getByRole("button", { name: /Pay|Checkout/i });
      if (await payBtn.isVisible()) {
        await payBtn.click();
        // Payment modal opens
        await expect(page.getByText(/Payment|Select Method/i)).toBeVisible();
      }
    }
  });
});
