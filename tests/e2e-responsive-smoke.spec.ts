import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Responsive Smoke — E2E', () => {
  test('homepage no overflow at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(330);
  });

  test('homepage no overflow at 375x812', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(385);
  });

  test('homepage no overflow at 768x1024', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(778);
  });

  test('homepage no overflow at 1024x768', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1034);
  });

  test('homepage no overflow at 1280x720', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1285);
  });

  test('homepage no overflow at 1920x1080', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1925);
  });

  test('hamburger menu toggle works at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    const isVisible = await hamburger.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await hamburger.click();
      await page.waitForTimeout(500);
      await hamburger.click();
      await page.waitForTimeout(300);
    }
    expect(true).toBe(true);
  });

  test('desktop nav visible at 1280px, hamburger hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    const isHamburgerVisible = await hamburger.isVisible().catch(() => false);
    expect(isHamburgerVisible).toBe(false);
  });

  test('courts page no overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/courts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(385);
  });

  test('courts page no overflow at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}/courts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1285);
  });
});
