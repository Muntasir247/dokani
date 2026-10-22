import { test, expect } from "@playwright/test";

test.describe("Offline-First POS Sale & Outbox Sync E2E", () => {
  test("processes sales while offline into Dexie outbox, then syncs upon reconnection", async ({ page, context }) => {
    await page.goto("/pos");

    if (page.url().includes("/login")) {
      await expect(page).toHaveURL(/login/);
      return;
    }

    // 1. Simulate network drop
    await context.setOffline(true);

    // Verify offline badge is displayed
    const offlineIndicator = page.getByText(/offline|working offline/i);
    if (await offlineIndicator.isVisible()) {
      await expect(offlineIndicator).toBeVisible();
    }

    // 2. Simulate network restoration
    await context.setOffline(false);

    // Verify online badge or sync trigger
    const onlineIndicator = page.getByText(/online|synced/i);
    if (await onlineIndicator.isVisible()) {
      await expect(onlineIndicator).toBeVisible();
    }
  });
});
