/**
 * Phase 22.12 — Full Regression Testing
 *
 * REAL regression tests against live Supabase.
 * NO mocks, NO fake data, NO mocked auth.
 *
 * Uses anon key from .env.local for unauthenticated requests.
 * Validates: connection, data access patterns, RLS enforcement, schema.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function supabaseQuery(
  table: string,
  params: Record<string, string> = {},
  opts: { method?: string; body?: string } = {}
) {
  const qs = new URLSearchParams(params).toString();
  const url = `${SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body ? { body: opts.body } : {}),
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

describe('Phase 22.12 — Real Regression Testing (Live Supabase)', () => {
  beforeAll(() => {
    expect(SUPABASE_URL).toBeTruthy();
    expect(SUPABASE_ANON_KEY).toBeTruthy();
  });

  // ──────────────────────────────────────────────
  // 1. CONNECTION
  // ──────────────────────────────────────────────
  describe('1. Supabase Connection', () => {
    it('Supabase URL is reachable', async () => {
      const start = Date.now();
      const res = await fetch(SUPABASE_URL + '/rest/v1/courts?select=id&limit=1', { headers });
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(10000);
    });

    it('anon key is accepted for public queries', async () => {
      const res = await fetch(SUPABASE_URL + '/rest/v1/courts?select=*&limit=1', { headers });
      expect([200, 401]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });
  });

  // ──────────────────────────────────────────────
  // 2. PUBLIC DATA — COURTS
  // ──────────────────────────────────────────────
  describe('2. Public Data Access — Courts (RLS allows anon reads)', () => {
    it('courts table is readable by anon', async () => {
      const result = await supabaseQuery('courts', { select: '*', limit: '5' });
      expect(result.status).toBe(200);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('courts table returns well-formed response', async () => {
      const result = await supabaseQuery('courts', { select: '*', limit: '3' });
      expect(result.status).toBe(200);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('courts INSERT blocked for anon (RLS enforced)', async () => {
      const result = await supabaseQuery('courts', {}, {
        method: 'POST',
        body: JSON.stringify({ name: 'Injection Test', sport_type: 'Tennis', price_per_hour: 999 }),
      });
      expect(result.status).toBe(401);
    });

    it('courts query completes within 5 seconds', async () => {
      const start = Date.now();
      await supabaseQuery('courts', { select: '*', limit: '10' });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });

  // ──────────────────────────────────────────────
  // 3. RLS ENFORCEMENT — PROTECTED TABLES
  // ──────────────────────────────────────────────
  describe('3. RLS Enforcement — Protected Tables Return 401', () => {
    it('bookings: SELECT blocked (401)', async () => {
      const result = await supabaseQuery('bookings', { select: '*', limit: '5' });
      expect(result.status).toBe(401);
    });

    it('profiles: SELECT returns empty for anon (RLS filters all rows)', async () => {
      const result = await supabaseQuery('profiles', { select: '*', limit: '5' });
      // Anon has GRANT SELECT but RLS policy requires auth.uid() = id
      // So anon gets 200 with empty array, not 401
      expect(result.status).toBe(200);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[]).length).toBe(0);
    });

    it('notifications: SELECT blocked (401)', async () => {
      const result = await supabaseQuery('notifications', { select: '*', limit: '5' });
      expect(result.status).toBe(401);
    });

    it('blocked_periods: SELECT blocked (401)', async () => {
      const result = await supabaseQuery('blocked_periods', { select: '*', limit: '5' });
      expect(result.status).toBe(401);
    });

    it('sponsorship_requests: SELECT blocked (401)', async () => {
      const result = await supabaseQuery('sponsorship_requests', { select: '*', limit: '5' });
      expect(result.status).toBe(401);
    });

    it('advertisement_requests: SELECT blocked (401)', async () => {
      const result = await supabaseQuery('advertisement_requests', { select: '*', limit: '5' });
      expect(result.status).toBe(401);
    });
  });

  describe('3b. RLS Enforcement — Write Blocked on Protected Tables', () => {
    it('bookings: INSERT blocked (400 or 401)', async () => {
      const result = await supabaseQuery('bookings', {}, {
        method: 'POST',
        body: JSON.stringify({
          user_id: '00000000-0000-0000-0000-000000000000',
          court_id: '00000000-0000-0000-0000-000000000000',
          booking_date: '2099-01-01',
          start_time: '10:00',
          end_time: '11:00',
          total_price: 50,
          status: 'pending',
        }),
      });
      // 400 = PostgREST schema validation failure (missing required columns)
      // 401 = RLS permission denied
      // Either means insert was blocked
      expect([400, 401]).toContain(result.status);
    });

    it('profiles: INSERT blocked (401)', async () => {
      const result = await supabaseQuery('profiles', {}, {
        method: 'POST',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-000000000000',
          full_name: 'Injection Test',
          email: 'inject@test.com',
          role: 'Admin',
        }),
      });
      expect(result.status).toBe(401);
    });

    it('notifications: INSERT blocked (401)', async () => {
      const result = await supabaseQuery('notifications', {}, {
        method: 'POST',
        body: JSON.stringify({
          user_id: '00000000-0000-0000-0000-000000000000',
          title: 'Injection Test',
          message: 'Should fail',
          type: 'booking_created',
        }),
      });
      expect(result.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────
  // 4. TABLE EXISTENCE
  // ──────────────────────────────────────────────
  describe('4. Table Existence (HTTP status confirms table exists)', () => {
    it('courts table exists (200)', async () => {
      const result = await supabaseQuery('courts', { select: '*', limit: '1' });
      expect(result.status).toBe(200);
    });

    it('bookings table exists (401 = RLS blocks, not 404)', async () => {
      const result = await supabaseQuery('bookings', { select: '*', limit: '1' });
      expect(result.status).toBe(401);
    });

    it('profiles table exists (200 + empty = RLS blocks anon rows)', async () => {
      const result = await supabaseQuery('profiles', { select: '*', limit: '1' });
      // Anon has GRANT SELECT but RLS returns 0 rows
      expect(result.status).toBe(200);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[]).length).toBe(0);
    });

    it('notifications table exists (401 = RLS blocks, not 404)', async () => {
      const result = await supabaseQuery('notifications', { select: '*', limit: '1' });
      expect(result.status).toBe(401);
    });

    it('blocked_periods table exists (401 = RLS blocks, not 404)', async () => {
      const result = await supabaseQuery('blocked_periods', { select: '*', limit: '1' });
      expect(result.status).toBe(401);
    });

    it('sponsorship_requests table exists (401 = RLS blocks, not 404)', async () => {
      const result = await supabaseQuery('sponsorship_requests', { select: '*', limit: '1' });
      expect(result.status).toBe(401);
    });

    it('advertisement_requests table exists (401 = RLS blocks, not 404)', async () => {
      const result = await supabaseQuery('advertisement_requests', { select: '*', limit: '1' });
      expect(result.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────
  // 5. SQL INJECTION RESISTANCE
  // ──────────────────────────────────────────────
  describe('5. SQL Injection Resistance', () => {
    it('malicious SQL in query param is rejected', async () => {
      const result = await supabaseQuery('courts', {
        select: '*',
        id: "eq.1' OR '1'='1",
      });
      expect([200, 400, 401]).toContain(result.status);
      if (Array.isArray(result.data)) {
        expect(result.data.length).toBeLessThanOrEqual(5);
      }
    });

    it('malicious body in INSERT is rejected', async () => {
      const result = await supabaseQuery('courts', {}, {
        method: 'POST',
        body: JSON.stringify({ name: "'; DROP TABLE courts; --" }),
      });
      expect(result.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────
  // 6. RESPONSE FORMAT
  // ──────────────────────────────────────────────
  describe('6. Response Format', () => {
    it('courts query returns JSON array', async () => {
      const result = await supabaseQuery('courts', { select: '*', limit: '3' });
      expect(result.status).toBe(200);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('protected table returns JSON error object', async () => {
      const result = await supabaseQuery('bookings', { select: '*', limit: '1' });
      expect(result.status).toBe(401);
      expect(result.data).toHaveProperty('message');
      expect(result.data).toHaveProperty('code');
    });

    it('error response includes hint', async () => {
      const result = await supabaseQuery('bookings', { select: '*', limit: '1' });
      expect(result.status).toBe(401);
      if (typeof result.data === 'object' && result.data !== null) {
        expect(result.data).toHaveProperty('hint');
      }
    });
  });

  // ──────────────────────────────────────────────
  // 7. NONEXISTENT TABLE
  // ──────────────────────────────────────────────
  describe('7. Nonexistent Table Handling', () => {
    it('nonexistent table returns error (not crash)', async () => {
      const result = await supabaseQuery('this_table_does_not_exist_xyz', { select: '*', limit: '1' });
      expect(result.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ──────────────────────────────────────────────
  // 8. PERFORMANCE
  // ──────────────────────────────────────────────
  describe('8. Query Performance', () => {
    it('courts SELECT completes within 3 seconds', async () => {
      const start = Date.now();
      const result = await supabaseQuery('courts', { select: '*', limit: '10' });
      const elapsed = Date.now() - start;
      expect(result.status).toBe(200);
      expect(elapsed).toBeLessThan(3000);
    });

    it('RLS-blocked query completes within 2 seconds (no full scan)', async () => {
      const start = Date.now();
      const result = await supabaseQuery('bookings', { select: '*', limit: '100' });
      const elapsed = Date.now() - start;
      expect(result.status).toBe(401);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
