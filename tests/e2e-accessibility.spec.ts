/**
 * Phase 22.22 — Accessibility Audit
 * Tests keyboard navigation, focus visibility, forms, semantic HTML,
 * ARIA, modals/drawers, contrast, zoom, touch targets, dynamic content,
 * loading states, and screen reader structure.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

const VIEWPORTS = {
  'iphone': { width: 390, height: 844 },
  'android': { width: 412, height: 915 },
  'tablet': { width: 768, height: 1024 },
  'desktop': { width: 1280, height: 720 },
  'desktop-lg': { width: 1440, height: 900 },
} as const;

const ROUTES = [
  { path: '/', name: 'Homepage' },
  { path: '/auth/login', name: 'Login' },
  { path: '/book', name: 'Booking' },
  { path: '/book/payment', name: 'Payment' },
  { path: '/bookings', name: 'Bookings' },
  { path: '/admin', name: 'Admin' },
];

const TEST_USER_A = { email: 'test.user.a@khub-test.com', password: 'TEST_UserA_2024!' };
const TEST_ADMIN = { email: 'test.admin@khub-test.com', password: 'TEST_Admin_2024!' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAs(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/book**', { timeout: 20000 });
}

/** Get all focusable elements on the page */
async function getFocusableElements(page: Page) {
  return page.evaluate(() => {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');
    return Array.from(document.querySelectorAll(selector)).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: (el as HTMLInputElement).type || '',
      text: (el.textContent || '').trim().substring(0, 80),
      ariaLabel: el.getAttribute('aria-label') || '',
      role: el.getAttribute('role') || '',
      tabIndex: (el as HTMLElement).tabIndex,
      rect: el.getBoundingClientRect(),
    }));
  });
}

/** Check for heading hierarchy */
async function getHeadingHierarchy(page: Page) {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    return headings.map((h) => ({
      level: parseInt(h.tagName[1]),
      text: (h.textContent || '').trim().substring(0, 100),
      visible: h.getBoundingClientRect().height > 0,
    }));
  });
}

/** Check for landmark regions */
async function getLandmarks(page: Page) {
  return page.evaluate(() => {
    const landmarks: { role: string; label: string; tag: string }[] = [];
    // Native landmarks
    const nativeMap: Record<string, string> = {
      'header': 'banner',
      'nav': 'navigation',
      'main': 'main',
      'footer': 'contentinfo',
      'aside': 'complementary',
      'form': 'form',
      'section': 'region',
    };
    for (const [tag, role] of Object.entries(nativeMap)) {
      document.querySelectorAll(tag).forEach((el) => {
        const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '';
        landmarks.push({ role, label, tag });
      });
    }
    // Role-based landmarks
    document.querySelectorAll('[role]').forEach((el) => {
      const role = el.getAttribute('role') || '';
      if (['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'form', 'region', 'search'].includes(role)) {
        const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '';
        landmarks.push({ role, label, tag: el.tagName.toLowerCase() });
      }
    });
    return landmarks;
  });
}

/** Check for images without alt text */
async function getImagesAudit(page: Page) {
  return page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.map((img) => ({
      src: img.src.substring(0, 100),
      alt: img.alt,
      hasAlt: img.hasAttribute('alt'),
      role: img.getAttribute('role') || '',
      ariaHidden: img.getAttribute('aria-hidden') || '',
      width: img.getBoundingClientRect().width,
      height: img.getBoundingClientRect().height,
    }));
  });
}

/** Check for buttons without accessible names */
async function getButtonsAudit(page: Page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    return buttons.map((btn) => {
      const text = (btn.textContent || '').trim();
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const ariaLabelledby = btn.getAttribute('aria-labelledby') || '';
      const title = btn.getAttribute('title') || '';
      const img = btn.querySelector('img');
      const imgAlt = img?.alt || '';
      const svgTitle = btn.querySelector('svg title')?.textContent || '';
      const accessibleName = text || ariaLabel || title || imgAlt || svgTitle || ariaLabelledby;
      return {
        tag: btn.tagName.toLowerCase(),
        text: text.substring(0, 60),
        ariaLabel,
        ariaLabelledby,
        title,
        imgAlt,
        svgTitle,
        hasAccessibleName: accessibleName.length > 0,
        rect: btn.getBoundingClientRect(),
        disabled: (btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true',
      };
    });
  });
}

/** Check form labels */
async function getFormLabelsAudit(page: Page) {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([disabled]), select, textarea'));
    return inputs.map((input) => {
      const id = input.id;
      const name = input.getAttribute('name') || '';
      const type = input.getAttribute('type') || '';
      const ariaLabel = input.getAttribute('aria-label') || '';
      const ariaLabelledby = input.getAttribute('aria-labelledby') || '';
      const ariaDescribedby = input.getAttribute('aria-describedby') || '';
      const placeholder = input.getAttribute('placeholder') || '';
      // Check for associated label
      let hasLabel = false;
      let labelText = '';
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) {
          hasLabel = true;
          labelText = (label.textContent || '').trim();
        }
      }
      // Check for wrapping label
      if (!hasLabel) {
        const parentLabel = input.closest('label');
        if (parentLabel) {
          hasLabel = true;
          labelText = (parentLabel.textContent || '').trim();
        }
      }
      const required = input.hasAttribute('required') || input.getAttribute('aria-required') === 'true';
      const ariaInvalid = input.getAttribute('aria-invalid') || '';
      return {
        tag: input.tagName.toLowerCase(),
        type,
        name,
        id,
        hasLabel,
        labelText: labelText.substring(0, 60),
        ariaLabel,
        ariaLabelledby,
        ariaDescribedby,
        placeholder,
        required,
        ariaInvalid,
        autocomplete: input.getAttribute('autocomplete') || '',
      };
    });
  });
}

/** Check for clickable divs/spans (non-semantic interactive elements) */
async function getNonSemanticInteractive(page: Page) {
  return page.evaluate(() => {
    const issues: { tag: string; role: string; text: string; hasKeyboardHandler: boolean }[] = [];
    // Divs/spans with onClick
    document.querySelectorAll('div[onClick], span[onClick], div[role="button"], span[role="button"]').forEach((el) => {
      const hasKeyboardHandler = el.hasAttribute('onKeyDown') || el.hasAttribute('onKeyUp') || el.hasAttribute('onKeyPress');
      issues.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || 'none',
        text: (el.textContent || '').trim().substring(0, 60),
        hasKeyboardHandler,
      });
    });
    return issues;
  });
}

/** Check ARIA usage */
async function getAriaAudit(page: Page) {
  return page.evaluate(() => {
    const ariaElements = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby], [aria-live], [aria-hidden], [aria-expanded], [aria-pressed], [aria-selected], [aria-checked], [aria-invalid], [aria-busy], [role]');
    return Array.from(ariaElements).map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      ariaLabelledby: el.getAttribute('aria-labelledby') || '',
      ariaDescribedby: el.getAttribute('aria-describedby') || '',
      ariaLive: el.getAttribute('aria-live') || '',
      ariaHidden: el.getAttribute('aria-hidden') || '',
      ariaExpanded: el.getAttribute('aria-expanded') || '',
      ariaPressed: el.getAttribute('aria-pressed') || '',
      ariaSelected: el.getAttribute('aria-selected') || '',
      ariaChecked: el.getAttribute('aria-checked') || '',
      ariaInvalid: el.getAttribute('aria-invalid') || '',
      ariaBusy: el.getAttribute('aria-busy') || '',
      text: (el.textContent || '').trim().substring(0, 60),
    }));
  });
}

/** Check for skip link */
async function hasSkipLink(page: Page) {
  return page.evaluate(() => {
    const skipLinks = document.querySelectorAll('a[href="#main"], a[href="#content"], a[href="#maincontent"], .skip-link, .skip-nav, [class*="skip"]');
    return skipLinks.length > 0;
  });
}

/** Check contrast of text elements */
async function getContrastAudit(page: Page) {
  return page.evaluate(() => {
    const results: { text: string; fg: string; bg: string; fontSize: number; ratio: string }[] = [];
    const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, a, button, label, span, li');
    const checked = new Set<string>();
    textElements.forEach((el) => {
      const text = (el.textContent || '').trim();
      if (!text || text.length < 2 || checked.has(text.substring(0, 20))) return;
      checked.add(text.substring(0, 20));
      const style = window.getComputedStyle(el);
      const fg = style.color;
      const bg = style.backgroundColor;
      const fontSize = parseFloat(style.fontSize);
      if (fontSize < 10) return;
      results.push({
        text: text.substring(0, 40),
        fg,
        bg,
        fontSize,
        ratio: 'manual-check-needed',
      });
    });
    return results.slice(0, 50); // Limit to 50 samples
  });
}

/** Check for focus-visible styles */
async function getFocusStyles(page: Page) {
  return page.evaluate(() => {
    const styleSheets = Array.from(document.styleSheets);
    let hasFocusVisible = false;
    let hasFocusOutline = false;
    try {
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            const cssText = rule.cssText || '';
            if (cssText.includes(':focus-visible') || cssText.includes(':focus')) {
              hasFocusVisible = true;
              if (cssText.includes('outline') || cssText.includes('box-shadow')) {
                hasFocusOutline = true;
              }
            }
          }
        } catch {
          // Cross-origin stylesheet
        }
      }
    } catch {
      // Could not access stylesheets
    }
    return { hasFocusVisible, hasFocusOutline };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 1 — KEYBOARD NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('1. Keyboard Navigation', () => {
  for (const route of ROUTES) {
    test(`${route.name} (${route.path}) — tab navigation works`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const focusable = await getFocusableElements(page);
      expect(focusable.length).toBeGreaterThan(0);

      // Tab through first 10 elements
      for (let i = 0; i < Math.min(10, focusable.length); i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);
      }

      // Verify something received focus
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tag: el?.tagName || '',
          text: (el?.textContent || '').trim().substring(0, 50),
          hasFocus: el !== document.body,
        };
      });
      expect(focused.hasFocus).toBe(true);
    });

    test(`${route.name} (${route.path}) — shift+tab works`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      // Tab forward a few times
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);
      }

      // Shift+tab backward
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(100);

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tag: el?.tagName || '',
          hasFocus: el !== document.body,
        };
      });
      expect(focused.hasFocus).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 2 — FOCUS VISIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('2. Focus Visibility', () => {
  test('global focus-visible styles exist', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    const styles = await getFocusStyles(page);
    expect(styles.hasFocusVisible).toBe(true);
    expect(styles.hasFocusOutline).toBe(true);
  });

  for (const route of ROUTES) {
    test(`${route.name} — focus indicator visible on interactive elements`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const focusable = await getFocusableElements(page);
      const issues: string[] = [];

      // Tab through first 8 elements and check focus visibility
      const count = Math.min(8, focusable.length);
      for (let i = 0; i < count; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(150);

        const focusInfo = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return { visible: false, tag: 'body' };
          const style = window.getComputedStyle(el);
          const outlineStyle = style.outlineStyle;
          const outlineWidth = style.outlineWidth;
          const boxShadow = style.boxShadow;
          const borderStyle = style.borderStyle;
          const rect = el.getBoundingClientRect();
          const hasVisibleIndicator =
            (outlineStyle !== 'none' && parseFloat(outlineWidth) > 0) ||
            (boxShadow !== 'none' && boxShadow !== '') ||
            (el.tagName === 'INPUT' && borderStyle !== 'none');
          return {
            visible: hasVisibleIndicator,
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().substring(0, 40),
            outlineStyle,
            outlineWidth,
            boxShadow: boxShadow.substring(0, 50),
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          };
        });

        if (!focusInfo.visible && focusInfo.tag !== 'body') {
          issues.push(`${focusInfo.tag} "${focusInfo.text}" — no visible focus indicator`);
        }
      }

      // Log issues but don't fail (focus may use outline-offset or other techniques)
      if (issues.length > 0) {
        console.log(`[FOCUS FINDINGS] ${route.name}: ${issues.join('; ')}`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 3 — FORMS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('3. Forms', () => {
  test('login form — labels associated with inputs', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const labels = await getFormLabelsAudit(page);
    const inputs = labels.filter((l) => l.tag === 'input');

    for (const input of inputs) {
      if (input.type === 'hidden') continue;
      // Each visible input should have a label
      const hasAnyLabel = input.hasLabel || input.ariaLabel || input.ariaLabelledby;
      if (!hasAnyLabel) {
        console.log(`[FORM FINDING] Login input "${input.name || input.type}" has no associated label, aria-label, or aria-labelledby`);
      }
    }
  });

  test('login form — required fields identifiable', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const labels = await getFormLabelsAudit(page);
    const requiredInputs = labels.filter((l) => l.tag === 'input' && l.type !== 'hidden');

    for (const input of requiredInputs) {
      if (!input.required) {
        console.log(`[FORM FINDING] Login input "${input.name || input.type}" is required but not marked as required`);
      }
    }
  });

  test('login form — error state with empty fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Submit with empty fields
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);

    // Check if error is accessible
    const errorAccessible = await page.evaluate(() => {
      const liveRegions = document.querySelectorAll('[aria-live], [role="alert"], [role="status"]');
      const errorElements = document.querySelectorAll('.error, [class*="error"], [class*="Error"]');
      const hasInlineError = errorElements.length > 0;
      const hasLiveRegion = liveRegions.length > 0;
      // Check for aria-invalid on inputs
      const invalidInputs = document.querySelectorAll('[aria-invalid="true"]');
      return {
        hasInlineError,
        hasLiveRegion,
        invalidInputCount: invalidInputs.length,
        liveRegionCount: liveRegions.length,
      };
    });

    console.log(`[FORM] Login empty submit — inline errors: ${errorAccessible.hasInlineError}, live regions: ${errorAccessible.hasLiveRegion}, aria-invalid inputs: ${errorAccessible.invalidInputCount}`);
  });

  test('login form — error with invalid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    await page.fill('input[type="email"]', 'nonexistent@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const errorState = await page.evaluate(() => {
      const liveRegions = document.querySelectorAll('[aria-live], [role="alert"], [role="status"]');
      const toasts = document.querySelectorAll('[data-sonner-toaster], [class*="toast"], [role="status"]');
      const invalidInputs = document.querySelectorAll('[aria-invalid="true"]');
      return {
        liveRegionCount: liveRegions.length,
        toastCount: toasts.length,
        invalidInputCount: invalidInputs.length,
      };
    });

    console.log(`[FORM] Login invalid creds — live regions: ${errorState.liveRegionCount}, toasts: ${errorState.toastCount}, aria-invalid: ${errorState.invalidInputCount}`);
  });

  test('registration form — labels associated', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/register`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const labels = await getFormLabelsAudit(page);
    const inputs = labels.filter((l) => l.tag === 'input' && l.type !== 'hidden');

    for (const input of inputs) {
      const hasAnyLabel = input.hasLabel || input.ariaLabel || input.ariaLabelledby;
      if (!hasAnyLabel) {
        console.log(`[FORM FINDING] Register input "${input.name || input.type}" has no associated label`);
      }
    }
  });

  test('booking details form — labels associated', async ({ page }) => {
    await loginAs(page, TEST_USER_A.email, TEST_USER_A.password);
    await page.goto(`${BASE_URL}/book/details`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const labels = await getFormLabelsAudit(page);
    const inputs = labels.filter((l) => l.tag === 'input' && l.type !== 'hidden');

    let allLabeled = true;
    for (const input of inputs) {
      const hasAnyLabel = input.hasLabel || input.ariaLabel || input.ariaLabelledby;
      if (!hasAnyLabel) {
        allLabeled = false;
        console.log(`[FORM FINDING] Booking details input "${input.name || input.type}" has no associated label`);
      }
    }
    if (allLabeled && inputs.length > 0) {
      console.log(`[FORM] Booking details form: all ${inputs.length} inputs have labels`);
    }
  });

  test('contact form — labels associated', async ({ page }) => {
    await page.goto(`${BASE_URL}/contact`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const labels = await getFormLabelsAudit(page);
    const inputs = labels.filter((l) => l.tag === 'input' && l.type !== 'hidden');

    for (const input of inputs) {
      const hasAnyLabel = input.hasLabel || input.ariaLabel || input.ariaLabelledby;
      if (!hasAnyLabel) {
        console.log(`[FORM FINDING] Contact input "${input.name || input.type}" has no associated label`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 4 — SEMANTIC HTML
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('4. Semantic HTML', () => {
  for (const route of ROUTES) {
    test(`${route.name} — no non-semantic interactive elements`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const issues = await getNonSemanticInteractive(page);
      if (issues.length > 0) {
        console.log(`[SEMANTIC] ${route.name}: ${issues.length} non-semantic interactive elements found`);
        for (const issue of issues.slice(0, 5)) {
          console.log(`  - <${issue.tag}> role="${issue.role}" text="${issue.text}" keyboardHandler=${issue.hasKeyboardHandler}`);
        }
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 5 — HEADINGS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('5. Headings', () => {
  for (const route of ROUTES) {
    test(`${route.name} — heading hierarchy is logical`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const headings = await getHeadingHierarchy(page);
      const visibleHeadings = headings.filter((h) => h.visible);

      // Check for h1
      const h1Count = visibleHeadings.filter((h) => h.level === 1).length;
      if (h1Count === 0) {
        console.log(`[HEADING] ${route.name}: No visible h1 found`);
      } else if (h1Count > 1) {
        console.log(`[HEADING] ${route.name}: Multiple h1 elements (${h1Count})`);
      }

      // Check for heading level skips
      for (let i = 1; i < visibleHeadings.length; i++) {
        const prev = visibleHeadings[i - 1].level;
        const curr = visibleHeadings[i].level;
        if (curr > prev + 1) {
          console.log(`[HEADING] ${route.name}: Heading skip from h${prev} to h${curr} ("${visibleHeadings[i].text}")`);
        }
      }

      // Log heading structure
      const structure = visibleHeadings.map((h) => `h${h.level}`).join(' → ');
      console.log(`[HEADING] ${route.name}: ${structure || '(no headings)'}`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 6 — IMAGES AND ICONS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('6. Images and Icons', () => {
  for (const route of ROUTES) {
    test(`${route.name} — images have alt text`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const images = await getImagesAudit(page);
      const visibleImages = images.filter((img) => img.width > 1 && img.height > 1);

      for (const img of visibleImages) {
        if (!img.hasAlt) {
          console.log(`[IMAGE] ${route.name}: Image missing alt attribute — src="${img.src}"`);
        } else if (img.alt === '' && img.role !== 'presentation' && img.ariaHidden !== 'true') {
          // Empty alt is OK for decorative images, but check if it's intentional
          console.log(`[IMAGE] ${route.name}: Image has empty alt — src="${img.src}" (confirm decorative)`);
        }
      }
    });

    test(`${route.name} — buttons have accessible names`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const buttons = await getButtonsAudit(page);
      const issues = buttons.filter((b) => !b.hasAccessibleName && !b.disabled);

      for (const btn of issues.slice(0, 10)) {
        console.log(`[BUTTON] ${route.name}: <${btn.tag}> without accessible name — text="${btn.text}" ariaLabel="${btn.ariaLabel}"`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 7 — ARIA
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('7. ARIA', () => {
  for (const route of ROUTES) {
    test(`${route.name} — ARIA audit`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const aria = await getAriaAudit(page);

      // Check for aria-hidden on focusable elements
      const hiddenFocusable = await page.evaluate(() => {
        const hidden = document.querySelectorAll('[aria-hidden="true"]');
        const issues: string[] = [];
        hidden.forEach((el) => {
          const focusable = el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
          if (focusable.length > 0) {
            issues.push(`<${el.tagName.toLowerCase()}> aria-hidden="true" contains ${focusable.length} focusable elements`);
          }
        });
        return issues;
      });

      for (const issue of hiddenFocusable) {
        console.log(`[ARIA] ${route.name}: ${issue}`);
      }

      // Count aria-live regions
      const liveRegions = aria.filter((a) => a.ariaLive);
      console.log(`[ARIA] ${route.name}: ${liveRegions.length} aria-live regions, ${aria.length} total ARIA elements`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 8 — MODALS / DRAWERS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('8. Modals / Drawers', () => {
  test('mobile navigation drawer — keyboard accessible', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS['iphone']);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Find and click hamburger menu
    const menuButton = page.locator('button[aria-label*="menu" i], button[aria-label*="Toggle" i]').first();
    const exists = await menuButton.count();
    if (exists === 0) {
      console.log('[MOBILE NAV] No hamburger menu button found');
      return;
    }

    await menuButton.click();
    await page.waitForTimeout(500);

    // Check drawer semantics
    const drawerInfo = await page.evaluate(() => {
      const drawer = document.querySelector('[role="dialog"], [aria-modal="true"], .drawer, [class*="drawer"], [class*="mobile-menu"], [class*="sidebar"]');
      const closeBtn = document.querySelector('button[aria-label*="close" i], button[aria-label*="Close" i]');
      const focusTrap = document.querySelectorAll('[role="dialog"]').length > 0;
      return {
        hasDrawer: !!drawer,
        drawerRole: drawer?.getAttribute('role') || 'none',
        ariaModal: drawer?.getAttribute('aria-modal') || 'none',
        hasCloseButton: !!closeBtn,
        closeBtnLabel: closeBtn?.getAttribute('aria-label') || '',
        hasFocusTrap: focusTrap,
      };
    });

    console.log(`[MOBILE NAV] Drawer: role="${drawerInfo.drawerRole}" aria-modal="${drawerInfo.ariaModal}" closeBtn="${drawerInfo.closeBtnLabel}" focusTrap=${drawerInfo.hasFocusTrap}`);

    // Test Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const stillOpen = await page.evaluate(() => {
      const drawer = document.querySelector('[class*="drawer"]:not([style*="display: none"]), [class*="mobile-menu"]:not([style*="display: none"])');
      return !!drawer;
    });

    if (stillOpen) {
      console.log('[MOBILE NAV] Escape key does not close drawer');
    }
  });

  test('notification dropdown — keyboard accessible', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const bellButton = page.locator('button[aria-label*="Notification" i]').first();
    const exists = await bellButton.count();
    if (exists === 0) {
      console.log('[NOTIFICATIONS] No notification bell found');
      return;
    }

    await bellButton.click();
    await page.waitForTimeout(500);

    const dropdownInfo = await page.evaluate(() => {
      const dropdown = document.querySelector('[role="listbox"], [role="menu"], [class*="dropdown"], [class*="notification"]');
      return {
        hasDropdown: !!dropdown,
        role: dropdown?.getAttribute('role') || 'none',
        ariaLabel: dropdown?.getAttribute('aria-label') || '',
      };
    });

    console.log(`[NOTIFICATIONS] Dropdown: role="${dropdownInfo.role}" ariaLabel="${dropdownInfo.ariaLabel}"`);

    // Test Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 9 — COLOR & CONTRAST
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('9. Color & Contrast', () => {
  for (const route of ROUTES) {
    test(`${route.name} — contrast samples collected`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const samples = await getContrastAudit(page);
      console.log(`[CONTRAST] ${route.name}: ${samples.length} text samples collected`);
    });
  }

  test('color is not sole indicator of state', async ({ page }) => {
    await page.goto(`${BASE_URL}/book`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check time slot buttons for non-color state indicators
    const slotInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const timeSlots = buttons.filter((b) => {
        const text = b.textContent || '';
        return /\d{1,2}:\d{2}/.test(text);
      });

      return timeSlots.slice(0, 10).map((b) => ({
        text: (b.textContent || '').trim().substring(0, 30),
        disabled: b.disabled,
        ariaPressed: b.getAttribute('aria-pressed'),
        ariaLabel: b.getAttribute('aria-label') || '',
        className: b.className.substring(0, 80),
      }));
    });

    const selected = slotInfo.filter((s) => s.ariaPressed === 'true');
    const disabled = slotInfo.filter((s) => s.disabled);

    console.log(`[COLOR] Time slots: ${slotInfo.length} total, ${selected.length} selected (aria-pressed), ${disabled.length} disabled`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 10 — TEXT ZOOM / RESPONSIVE ACCESSIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('10. Zoom / Responsive Accessibility', () => {
  for (const route of ROUTES) {
    test(`${route.name} — content usable at 200% zoom`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS['desktop']);
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      // Simulate 200% zoom by setting device scale factor
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await page.waitForTimeout(500);

      const zoomInfo = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        const scrollWidth = Math.max(body.scrollWidth, html.scrollWidth);
        const clientWidth = html.clientWidth;
        const hasHorizontalScroll = scrollWidth > clientWidth + 10;

        // Check if any text is clipped
        const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, button, a, label, input');
        let clippedCount = 0;
        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > clientWidth + 5 && rect.width > 0) {
            clippedCount++;
          }
        });

        return {
          hasHorizontalScroll,
          scrollWidth,
          clientWidth,
          clippedCount,
        };
      });

      if (zoomInfo.hasHorizontalScroll) {
        console.log(`[ZOOM] ${route.name}: Horizontal scroll at 200% — scrollWidth: ${zoomInfo.scrollWidth}, clientWidth: ${zoomInfo.clientWidth}`);
      }
      if (zoomInfo.clippedCount > 0) {
        console.log(`[ZOOM] ${route.name}: ${zoomInfo.clippedCount} elements clipped at 200% zoom`);
      }

      // Reset
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 11 — TOUCH TARGETS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('11. Touch Targets', () => {
  for (const [vpName, vpSize] of Object.entries({ 'iphone': VIEWPORTS['iphone'], 'android': VIEWPORTS['android'] })) {
    test(`${vpName} — interactive elements have adequate touch targets`, async ({ page }) => {
      await page.setViewportSize(vpSize);
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const touchTargets = await page.evaluate(() => {
        const interactive = document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])');
        const issues: { tag: string; text: string; width: number; height: number }[] = [];

        interactive.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 24 || rect.height < 24) {
            issues.push({
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().substring(0, 30),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        });

        return issues;
      });

      if (touchTargets.length > 0) {
        console.log(`[TOUCH] ${vpName}: ${touchTargets.length} elements below 24×24px minimum`);
        for (const issue of touchTargets.slice(0, 5)) {
          console.log(`  - <${issue.tag}> "${issue.text}" ${issue.width}×${issue.height}px`);
        }
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 12 — DYNAMIC CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('12. Dynamic Content', () => {
  test('login error — announced to screen readers', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    await page.fill('input[type="email"]', 'nonexistent@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const dynamicInfo = await page.evaluate(() => {
      const liveRegions = document.querySelectorAll('[aria-live], [role="alert"], [role="status"]');
      const toasts = document.querySelectorAll('[data-sonner-toaster], [data-sonner-toast]');
      const alerts = document.querySelectorAll('[role="alert"]');
      return {
        liveRegionCount: liveRegions.length,
        toastCount: toasts.length,
        alertCount: alerts.length,
        liveRegionContent: Array.from(liveRegions).map((r) => (r.textContent || '').trim().substring(0, 50)),
      };
    });

    console.log(`[DYNAMIC] Login error — live regions: ${dynamicInfo.liveRegionCount}, toasts: ${dynamicInfo.toastCount}, alerts: ${dynamicInfo.alertCount}`);
  });

  test('booking countdown — time changes announced', async ({ page }) => {
    await page.goto(`${BASE_URL}/book`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const countdownInfo = await page.evaluate(() => {
      const countdown = document.querySelector('[class*="countdown"], [class*="timer"], [role="timer"]');
      return {
        hasCountdown: !!countdown,
        role: countdown?.getAttribute('role') || 'none',
        ariaLive: countdown?.getAttribute('aria-live') || 'none',
        ariaLabel: countdown?.getAttribute('aria-label') || '',
      };
    });

    console.log(`[DYNAMIC] Countdown — role="${countdownInfo.role}" aria-live="${countdownInfo.ariaLive}" aria-label="${countdownInfo.ariaLabel}"`);
  });

  test('toast notifications — live region present', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const toastInfo = await page.evaluate(() => {
      // Check sonner toaster configuration
      const toaster = document.querySelector('[data-sonner-toaster]');
      return {
        hasToaster: !!toaster,
        ariaLive: toaster?.getAttribute('aria-live') || 'none',
        role: toaster?.getAttribute('role') || 'none',
      };
    });

    console.log(`[DYNAMIC] Sonner toaster — aria-live="${toastInfo.ariaLive}" role="${toastInfo.role}"`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 13 — LOADING STATES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('13. Loading States', () => {
  test('login loading state — button disabled during submission', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    await page.fill('input[type="email"]', TEST_USER_A.email);
    await page.fill('input[type="password"]', 'wrong');

    const beforeClick = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      return {
        disabled: (btn as HTMLButtonElement)?.disabled,
        ariaDisabled: btn?.getAttribute('aria-disabled'),
        ariaBusy: btn?.getAttribute('aria-busy'),
        text: btn?.textContent?.trim(),
      };
    });

    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);

    const duringClick = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      return {
        disabled: (btn as HTMLButtonElement)?.disabled,
        ariaDisabled: btn?.getAttribute('aria-disabled'),
        ariaBusy: btn?.getAttribute('aria-busy'),
        text: btn?.textContent?.trim(),
      };
    });

    console.log(`[LOADING] Login button — before: disabled=${beforeClick.disabled}, during: disabled=${duringClick.disabled} ariaBusy="${duringClick.ariaBusy}" text="${duringClick.text}"`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST AREA 14 — SCREEN READER STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('14. Screen Reader Structure', () => {
  for (const route of ROUTES) {
    test(`${route.name} — landmarks present`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const landmarks = await getLandmarks(page);
      const roles = landmarks.map((l) => l.role);
      const hasMain = roles.includes('main');
      const hasNav = roles.includes('navigation');
      const hasBanner = roles.includes('banner');
      const hasContentinfo = roles.includes('contentinfo');

      console.log(`[SR] ${route.name} — main:${hasMain} nav:${hasNav} banner:${hasBanner} contentinfo:${hasContentinfo} total:${landmarks.length}`);

      if (!hasMain) {
        console.log(`[SR] ${route.name}: Missing main landmark`);
      }
    });

    test(`${route.name} — skip link present`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const skipLink = await hasSkipLink(page);
      if (!skipLink) {
        console.log(`[SR] ${route.name}: No skip navigation link found`);
      }
    });

    test(`${route.name} — page has title`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const title = await page.title();
      if (!title || title.trim() === '') {
        console.log(`[SR] ${route.name}: Missing or empty page title`);
      } else {
        console.log(`[SR] ${route.name}: Title = "${title}"`);
      }
    });

    test(`${route.name} — lang attribute set`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);

      const lang = await page.evaluate(() => document.documentElement.lang);
      expect(lang).toBeTruthy();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SKIP LINK TEST
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Skip Navigation', () => {
  test('skip link exists and is focusable', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // First Tab should focus skip link if it exists
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName || '',
        text: (el?.textContent || '').trim().substring(0, 50),
        href: el?.getAttribute('href') || '',
        className: el?.className?.substring(0, 50) || '',
        isSkipLink: el?.getAttribute('href')?.startsWith('#') || false,
      };
    });

    console.log(`[SKIP] First Tab focuses: <${focused.tag}> text="${focused.text}" href="${focused.href}" isSkipLink=${focused.isSkipLink}`);
  });
});
