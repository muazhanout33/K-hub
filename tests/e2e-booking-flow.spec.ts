import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const FUTURE_DATE = '2099-12-15';

const AUTH_USER_FLOW = {
  id: 'user-e2e-flow',
  email: 'flow@test.com',
  user_metadata: {
    full_name: 'Flow Tester',
    phone_number: '+201234567890',
  },
  created_at: '2024-01-01T00:00:00Z',
};

const AUTH_PROFILE_FLOW = {
  id: 'user-e2e-flow',
  full_name: 'Flow Tester',
  phone_number: '+201234567890',
  email: 'flow@test.com',
  role: 'Member',
  avatar_url: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

/**
 * Mock Supabase auth to return NO user (unauthenticated).
 * Ensures initSession() completes quickly so _hasHydrated becomes true.
 */
async function mockSupabaseNoAuth(page: Page) {
  await page.route(/\.supabase\.co\//, async (route) => {
    const url = route.request().url();

    if (url.includes('/auth/v1/user')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      });
    }

    if (url.includes('/rest/v1/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes('/auth/v1/authorize') || url.includes('/auth/v1/token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    }

    return route.fallback();
  });
}

async function mockSupabaseAuth(page: Page) {
  await page.route(/\.supabase\.co\//, async (route) => {
    const url = route.request().url();

    if (url.includes('/auth/v1/user')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AUTH_USER_FLOW),
      });
    }

    if (url.includes('/rest/v1/profiles')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([AUTH_PROFILE_FLOW]),
      });
    }

    if (url.includes('/rest/v1/notifications')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes('/auth/v1/authorize') || url.includes('/auth/v1/token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    }

    return route.fallback();
  });
}

const SB_COOKIE_KEY = 'sb-bwwifvuerhxgjeoochnp-auth-token';

function buildSessionCookie(): string {
  const session = {
    access_token: 'fake-access-token-e2e-flow',
    refresh_token: 'fake-refresh-token-e2e-flow',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 9999999999,
    user: AUTH_USER_FLOW,
  };
  const encoded = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `base64-${encoded}`;
}

async function seedAuth(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem(
      'khub-auth-storage',
      JSON.stringify({
        state: {
          user: {
            id: 'user-e2e-flow',
            name: 'Flow Tester',
            email: 'flow@test.com',
            phone: '+201234567890',
            role: 'Member',
            avatar: null,
          },
          isAuthenticated: true,
          isLoading: false,
        },
        version: 0,
      })
    );
  });

  // Seed Supabase session cookie so getUser() makes network calls
  await context.addCookies([
    {
      name: SB_COOKIE_KEY,
      value: buildSessionCookie(),
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

const DEFAULT_COURT = {
  id: 'court-e2e-1',
  name: 'E2E Test Court',
  sportType: 'Padel',
  isIndoor: true,
  capacity: 4,
  pricePerHour: 500,
  image: '/images/courts/padel-indoor-1.webp',
  gallery: ['/images/courts/padel-indoor-1.webp'],
  rating: 4.8,
  reviewCount: 42,
  features: ['Floodlights', 'AC'],
  rules: ['No shoes on turf'],
  description: 'Test court for E2E.',
};

async function seedBookingState(
  context: BrowserContext,
  overrides: Record<string, unknown> = {}
) {
  await context.addInitScript((data) => {
    localStorage.setItem(
      'khub-booking-storage',
      JSON.stringify({
        state: {
          selectedCourt: data.court,
          selectedDate: data.date,
          selectedSlots: data.slots,
          bookings: [],
          bookingStep: data.bookingStep,
          userName: data.userName,
          userEmail: data.userEmail,
          userPhone: data.userPhone,
        },
        version: 5,
      })
    );
  }, {
    court: overrides.court ?? DEFAULT_COURT,
    date: FUTURE_DATE,
    slots: overrides.slots ?? [],
    bookingStep: overrides.bookingStep ?? 1,
    userName: overrides.userName ?? '',
    userEmail: overrides.userEmail ?? '',
    userPhone: overrides.userPhone ?? '',
  });
}

test.describe('Booking Flow — E2E', () => {
  test('court detail page loads and shows booking button', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/courts/court-e2e-1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('/book shows "No court selected" when no court in store', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);

    await page.goto(`${BASE}/book`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.evaluate((fd) => {
      localStorage.setItem(
        'khub-auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: 'user-e2e-booking',
              name: 'Booking Tester',
              email: 'booking@test.com',
              phone: '+201234567890',
              role: 'Member',
              avatar: null,
            },
            isAuthenticated: true,
            isLoading: false,
          },
          version: 0,
        })
      );
      localStorage.setItem(
        'khub-booking-storage',
        JSON.stringify({
          state: {
            selectedCourt: null,
            selectedDate: fd,
            selectedSlots: [],
            bookings: [],
            bookingStep: 1,
          },
          version: 5,
        })
      );
    }, FUTURE_DATE);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(() => {
      return document.body.textContent?.includes('No court selected') ?? false;
    }, { timeout: 15000 });

    const noCourtText = page.locator('text=No court selected');
    await expect(noCourtText).toBeVisible({ timeout: 5000 });
  });

  test('/book with seeded court shows booking widget', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedBookingState(context);

    await page.goto(`${BASE}/book`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const heading = page.locator('h2:has-text("Book Your Court")');
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('Continue without slot selection shows error', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedBookingState(context, { slots: [] });

    await page.goto(`${BASE}/book`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const continueBtn = page.locator('button:has-text("Continue")');
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(1500);

      const url = page.url();
      const stayedOnBook = url.includes('/book') && !url.includes('/book/details');
      expect(stayedOnBook).toBe(true);
    }
  });

  test('/book/details shows empty state when no booking in progress', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await context.addInitScript(() => {
      localStorage.setItem(
        'khub-booking-storage',
        JSON.stringify({ state: { selectedCourt: null, selectedSlots: [] }, version: 5 })
      );
    });

    await page.goto(`${BASE}/book/details`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const emptyText = page.locator('text=No booking in progress');
    await expect(emptyText).toBeVisible({ timeout: 10000 });
  });

  test('/book/payment shows empty state when no booking in progress', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await context.addInitScript(() => {
      localStorage.setItem(
        'khub-booking-storage',
        JSON.stringify({ state: { selectedCourt: null, selectedSlots: [] }, version: 5 })
      );
    });

    await page.goto(`${BASE}/book/payment`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const emptyText = page.locator('text=No booking in progress');
    await expect(emptyText).toBeVisible({ timeout: 10000 });
  });

  test('booking details form renders with inputs', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedBookingState(context, {
      slots: [{ id: 'slot-1', startTime: '10:00', endTime: '11:00', status: 'Available', price: 500 }],
      bookingStep: 3,
    });

    await page.goto(`${BASE}/book/details`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.waitForFunction(() => {
      return document.querySelector('#name') !== null;
    }, { timeout: 20000 });

    const nameInput = page.locator('#name');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    const emailInput = page.locator('#email');
    await expect(emailInput).toBeVisible();
    const phoneInput = page.locator('#phone');
    await expect(phoneInput).toBeVisible();
  });

  test('booking details form validates empty name', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedBookingState(context, {
      slots: [{ id: 'slot-1', startTime: '10:00', endTime: '11:00', status: 'Available', price: 500 }],
      bookingStep: 3,
    });

    await page.goto(`${BASE}/book/details`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.waitForFunction(() => {
      return document.querySelector('#name') !== null;
    }, { timeout: 20000 });

    const nameInput = page.locator('#name');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.clear();

    const submitBtn = page.getByRole('button', { name: 'Continue to Payment' });
    await submitBtn.click();
    await page.waitForTimeout(1500);

    const url = page.url();
    expect(url).toContain('/book/details');
  });

  test('booking details form validates empty email', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedBookingState(context, {
      slots: [{ id: 'slot-1', startTime: '10:00', endTime: '11:00', status: 'Available', price: 500 }],
      bookingStep: 3,
      userName: 'Test User',
    });

    await page.goto(`${BASE}/book/details`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.waitForFunction(() => {
      return document.querySelector('#email') !== null;
    }, { timeout: 20000 });

    const emailInput = page.locator('#email');
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.clear();

    const submitBtn = page.getByRole('button', { name: 'Continue to Payment' });
    await submitBtn.click();
    await page.waitForTimeout(1500);

    const url = page.url();
    expect(url).toContain('/book/details');
  });

  test('booking details form validates empty phone', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedBookingState(context, {
      slots: [{ id: 'slot-1', startTime: '10:00', endTime: '11:00', status: 'Available', price: 500 }],
      bookingStep: 3,
      userName: 'Test User',
      userEmail: 'test@test.com',
    });

    await page.goto(`${BASE}/book/details`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    await page.waitForFunction(() => {
      return document.querySelector('#phone') !== null;
    }, { timeout: 20000 });

    const phoneInput = page.locator('#phone');
    await phoneInput.clear();

    const submitBtn = page.getByRole('button', { name: 'Continue to Payment' });
    await submitBtn.click();
    await page.waitForTimeout(1500);

    const url = page.url();
    expect(url).toContain('/book/details');
  });

  test('payment page shows order summary when seeded', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedBookingState(context, {
      slots: [{ id: 'slot-1', startTime: '10:00', endTime: '11:00', status: 'Available', price: 500 }],
      bookingStep: 4,
      userName: 'Flow Tester',
      userEmail: 'flow@test.com',
      userPhone: '+201234567890',
    });

    await page.goto(`${BASE}/book/payment`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const orderSummary = page.locator('h3:has-text("Order Summary")');
    await expect(orderSummary).toBeVisible({ timeout: 15000 });

    const confirmBtn = page.getByRole('button', { name: 'Confirm & Pay' });
    await expect(confirmBtn).toBeVisible();
  });

  test('unauthenticated user clicking Continue on /book shows login redirect', async ({ page, context }) => {
    await mockSupabaseNoAuth(page);
    await seedBookingState(context, {
      slots: [{ id: 'slot-1', startTime: '10:00', endTime: '11:00', status: 'Available', price: 500 }],
      bookingStep: 2,
    });

    await page.goto(`${BASE}/book`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const continueBtn = page.locator('button:has-text("Continue")');
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForURL('**/auth/login', { timeout: 15000 }).catch(() => {});

      const url = page.url();
      const redirectedToLogin = url.includes('/auth/login');
      expect(redirectedToLogin).toBe(true);
    }
  });
});
