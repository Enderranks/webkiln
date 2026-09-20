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

  test('website canvas supports vertical scrolling', async ({ page }) => {
    await page.goto('/');
    const canvasFrame = page.locator('iframe.gjs-frame');
    await expect(canvasFrame).toBeVisible();
    const scrollState = await canvasFrame.evaluate((frame) => {
      const documentElement = frame.contentDocument?.documentElement;
      const body = frame.contentDocument?.body;
      return {
        overflow: body ? getComputedStyle(body).overflow : '',
        scrollHeight: Math.max(documentElement?.scrollHeight ?? 0, body?.scrollHeight ?? 0),
        clientHeight: frame.clientHeight,
      };
    });
    expect(scrollState.overflow).toBe('auto');
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  });

  test('laptop breakpoint preview is selectable', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Breakpoint toolbar is desktop-only');
    await page.goto('/');
    await page.locator('.device[data-width="laptop"]').click();
    await expect(page.locator('#canvasSizeStatus')).toHaveText('Canvas 1024 px');
    await expect(page.locator('.device[data-width="laptop"]')).toHaveClass(/active/);
  });

  test('command palette opens and filters editor commands', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.documentElement.dataset.editorEngine === 'webkiln');
    await page.locator('#commandBtn').click();
    await expect(page.locator('#commandPalette')).toBeVisible();
    await page.locator('#commandSearch').fill('publish');
    await expect(page.locator('[data-command="publish"]')).toBeVisible();
    await expect(page.locator('[data-command="add-section"]')).toHaveCount(0);
  });

  test('custom code tabs preserve isolated HTML, CSS, and JavaScript drafts', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Custom code is exposed through the desktop Site panel');
    await page.goto('/');
    await page.waitForFunction(() => document.documentElement.dataset.editorEngine === 'webkiln');
    await page.locator('.rail-tab[data-panel="site"]').click();
    await page.locator('#codeEditorBtn').click();
    const input = page.locator('#codeInput');
    await input.fill('<main>Markup</main>');
    await page.locator('.code-tabs button').nth(1).click();
    await input.fill('body { color: red; }');
    await page.locator('.code-tabs button').nth(2).click();
    await input.fill('console.log("isolated");');
    await page.locator('.code-tabs button').nth(0).click();
    await expect(input).toHaveValue('<main>Markup</main>');
    await page.locator('#saveCode').click();
    await expect(page.locator('#codeModal')).toBeHidden();
  });

  test('protected cloud routes reject unauthenticated access', async ({ request }) => {
    test.skip(!process.env.WEBKILN_E2E_BASE_URL, 'Requires a deployed Worker base URL');
    const response = await request.get('/api/workspaces/no-workspace/members');
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
  });

  test('protected customer route aliases redirect to sign-in', async ({ page }) => {
    test.skip(!process.env.WEBKILN_E2E_BASE_URL, 'Requires a deployed Worker base URL');
    await page.goto('/site/site-that-does-not-exist/cms');
    await expect(page).toHaveURL(/\/login\?returnTo=/);
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
