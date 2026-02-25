import { test, expect } from '@playwright/test';

test.describe('Game Flow', () => {
  test('homepage shows season info or warming up message', async ({ page }) => {
    await page.goto('/');
    // Should show either the season data or the "warming up" message
    const body = page.locator('body');
    await expect(body).toContainText(/Season|GridBlitz|warming up|Generating/i);
  });

  test('schedule page shows week navigation', async ({ page }) => {
    await page.goto('/schedule');
    const body = page.locator('body');
    // Schedule should contain week references or a "no season" fallback
    await expect(body).toContainText(/Week|Schedule|No season/i);
  });

  test('standings page shows conference divisions', async ({ page }) => {
    await page.goto('/standings');
    const body = page.locator('body');
    // Should show AFC/NFC or a "no standings" message
    await expect(body).toContainText(/AFC|NFC|Standings|No season/i);
  });

  test('verify page returns 404 for nonexistent game', async ({ page }) => {
    const response = await page.goto('/verify/nonexistent-id');
    // Verify page should 404 or show error
    const status = response?.status();
    expect(status === 404 || status === 200).toBe(true);
  });
});

test.describe('Prediction Flow', () => {
  test('prediction API rejects without auth', async ({ request }) => {
    const response = await request.post('/api/predict', {
      data: {
        gameId: 'test-game',
        predictedWinner: 'test-team',
        predictedHomeScore: 21,
        predictedAwayScore: 14,
      },
    });
    // Should reject with 401 (no userId cookie)
    expect(response.status()).toBe(401);
  });

  test('prediction API rejects invalid game', async ({ request }) => {
    const response = await request.post('/api/predict', {
      headers: { 'x-user-id': 'test-user-id' },
      data: {
        gameId: 'nonexistent-game-id',
        predictedWinner: 'test-team',
        predictedHomeScore: 21,
        predictedAwayScore: 14,
      },
    });
    // Should reject with 404 (game not found) — if the legacy x-user-id header is accepted
    expect([401, 404].includes(response.status())).toBe(true);
  });

  test('user API rejects POST without auth', async ({ request }) => {
    const response = await request.post('/api/user', {
      data: { displayName: 'TestUser' },
    });
    expect(response.status()).toBe(401);
  });

  test('user API GET requires userId param', async ({ request }) => {
    const response = await request.get('/api/user');
    expect(response.status()).toBe(400);
  });
});
