import { test, expect } from "@playwright/test";

test.describe("Dokani Initial App Launch", () => {
  test("renders the home scaffold and branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Dokani");
    await expect(page.getByText("Multi-tenant, offline-first Point-of-Sale")).toBeVisible();
  });
});
