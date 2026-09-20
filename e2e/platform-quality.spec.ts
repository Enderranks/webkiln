import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('WebKiln platform quality', () => {
  test('loads the editor without browser console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('has no serious automated accessibility violations on the local editor shell', async ({
    page,
  }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations
        .filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))
        .map((violation) => violation.id),
    ).toEqual([]);
  });

  test('mobile editor shell remains usable', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile project only');
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    ).toBe(true);
  });

  test('protected cloud routes reject unauthenticated access', async ({ request }) => {
    test.skip(!process.env.WEBKILN_E2E_BASE_URL, 'Requires a deployed Worker base URL');
    const response = await request.get('/api/workspaces/no-workspace/members');
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
  });

  test('API rejects a cross-origin mutation', async ({ request }) => {
    test.skip(!process.env.WEBKILN_E2E_BASE_URL, 'Requires a deployed Worker base URL');
    const response = await request.post('/api/workspaces', {
      headers: { Origin: 'https://attacker.invalid' },
      data: { name: 'Cross origin' },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe('ORIGIN_REJECTED');
  });
});
