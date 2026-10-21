import { test, expect } from "@playwright/test";

test.describe("POS Terminal & Sale Flows", () => {
  test("unauthenticated user navigating to /pos is redirected to login", async ({ page }) => {
    await page.goto("/pos");
    await expect(page).toHaveURL(/login/);
  });

  test("verifies POS route is guarded and redirects properly", async ({ page }) => {
    const response = await page.goto("/pos");
    // Next.js returns 200 on client redirect or 307 on server redirect
    expect([200, 307, 308]).toContain(response?.status());
    await expect(page).toHaveURL(/login/);
  });
});
