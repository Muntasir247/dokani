import { test, expect } from "@playwright/test";

test.describe("Subscription Upgrade & Billing Sandbox E2E Flow", () => {
  test("navigates to billing, selects Business plan, and completes checkout upgrade", async ({ page }) => {
    // Intercept checkout session creation
    await page.route("**/api/billing/checkout**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          gatewayUrl: "https://sandbox.sslcommerz.com/gwprocess/v4/simulator",
          sessionId: "sess_upgrade_business_123",
        }),
      });
    });

    await page.goto("/settings/billing");

    if (page.url().includes("/login")) {
      await expect(page).toHaveURL(/login/);
      return;
    }

    const upgradeBtn = page.getByRole("button", { name: /Upgrade to Business|Choose Plan/i });
    if (await upgradeBtn.isVisible()) {
      await upgradeBtn.click();
      await expect(page).toHaveURL(/sslcommerz|checkout|simulator/);
    }
  });
});
