import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/GridBlitz/);
  });

  test('homepage displays header on desktop', async ({ page }) => {
    // Header is hidden md:block, so only visible on desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  test('schedule page loads', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page).toHaveTitle(/Schedule|GridBlitz/);
  });

  test('standings page loads', async ({ page }) => {
    await page.goto('/standings');
    await expect(page).toHaveTitle(/Standings|GridBlitz/);
  });

  test('teams page loads', async ({ page }) => {
    await page.goto('/teams');
    await expect(page).toHaveTitle(/Teams|GridBlitz/);
  });

  test('leaderboard page loads', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page).toHaveTitle(/Leaderboard|GridBlitz/);
  });

  test('live page loads or redirects', async ({ page }) => {
    const response = await page.goto('/live');
    // Live page redirects to a game or shows a waiting screen
    expect(response?.status()).toBeLessThan(500);
  });

  test('404 page for invalid game', async ({ page }) => {
    const response = await page.goto('/game/nonexistent-id');
    expect(response?.status()).toBe(404);
  });

  test('homepage quick nav links are present', async ({ page }) => {
    await page.goto('/');
    // Check for navigation links
    const scheduleLink = page.locator('a[href="/schedule"]').first();
    await expect(scheduleLink).toBeVisible();
  });

  test('mobile nav is visible on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone
    await page.goto('/');
    // Mobile nav should be visible at the bottom
    const mobileNav = page.locator('nav').last();
    await expect(mobileNav).toBeVisible();
  });
});
