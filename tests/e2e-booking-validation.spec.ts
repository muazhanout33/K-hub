import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const FUTURE_DATE = '2099-12-15';

const AUTH_USER_VAL = {
  id: 'user-e2e-val',
  email: 'val@test.com',
  user_metadata: {
    full_name: 'Validation Tester',
    phone_number: '+201234567890',
  },
  created_at: '2024-01-01T00:00:00Z',
};

const AUTH_PROFILE_VAL = {
  id: 'user-e2e-val',
  full_name: 'Validation Tester',
  phone_number: '+201234567890',
  email: 'val@test.com',
  role: 'Member',
  avatar_url: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

async function mockSupabaseAuth(page: Page) {
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AUTH_USER_VAL),
    });
  });

  await page.route('**/rest/v1/profiles**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AUTH_PROFILE_VAL),
    });
  });
}

async function seedAuth(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem(
      'khub-auth-storage',
      JSON.stringify({
        state: {
          user: {
            id: 'user-e2e-val',
            name: 'Validation Tester',
            email: 'val@test.com',
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
}

async function seedEmptyBooking(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem(
      'khub-booking-storage',
      JSON.stringify({
        state: {
          selectedCourt: null,
          selectedDate: FUTURE_DATE,
          selectedSlots: [],
          bookings: [],
          bookingStep: 1,
        },
        version: 5,
      })
    );
  });
}

test.describe('Booking Validation — E2E', () => {
  test('/book with empty booking state shows "No court selected"', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedEmptyBooking(context);

    await page.goto(`${BASE}/book`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const noCourt = page.locator('text=No court selected');
    await expect(noCourt).toBeVisible({ timeout: 10000 });

    const browseBtn = page.locator('a:has-text("Browse Courts"), button:has-text("Browse Courts")');
    await expect(browseBtn.first()).toBeVisible();
  });

  test('/book/details with null court shows empty state', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedEmptyBooking(context);

    await page.goto(`${BASE}/book/details`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const emptyState = page.locator('text=No booking in progress');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });

  test('/book/payment with null court shows empty state', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await seedEmptyBooking(context);

    await page.goto(`${BASE}/book/payment`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const emptyState = page.locator('text=No booking in progress');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });

  test('/book with no slots selected shows 0 selected in header', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await context.addInitScript(() => {
      localStorage.setItem(
        'khub-booking-storage',
        JSON.stringify({
          state: {
            selectedCourt: {
              id: 'court-e2e-val',
              name: 'Val Court',
              sportType: 'Padel',
              isIndoor: true,
              capacity: 4,
              pricePerHour: 500,
              image: '/images/courts/padel-indoor-1.webp',
              gallery: [],
              rating: 4.8,
              reviewCount: 42,
              features: [],
              rules: [],
              description: '',
            },
            selectedDate: FUTURE_DATE,
            selectedSlots: [],
            bookings: [],
            bookingStep: 1,
          },
          version: 5,
        })
      );
    });

    await page.goto(`${BASE}/book`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const bookingWidget = page.locator('h2:has-text("Book Your Court")');
    await expect(bookingWidget).toBeVisible({ timeout: 10000 });
  });
});
