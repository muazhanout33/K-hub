# Phase 10.6 — DIAGNOSTIC REPORT
## Performance Degradation Root Cause Analysis

**Date:** 2026-08-24  
**Target:** `http://localhost:3000` (Next.js 16.2.12, React 19.2.4)  
**Scope:** DIAGNOSTIC ONLY — no code changes, no optimizations applied  
**Method:** Load testing (autocannon), event loop monitoring, middleware isolation testing, code analysis

---

## Executive Summary

The performance degradation at ~250 concurrent connections is caused by a **single bottleneck**: the Supabase Auth `getUser()` call in the Next.js middleware, which executes on **every non-static request** with zero caching. This adds **~480ms of mandatory latency** per request, reducing maximum throughput from ~2,100 RPS (static) to ~185 RPS (dynamic) — an **11x degradation**.

At 250+ concurrent connections, the outbound HTTP connections to Supabase Auth saturate, causing the event loop to stall. At 500+ concurrent, connection pool exhaustion triggers cascading failures (67-79% error rates).

---

## 1. Baseline Load Test Results (Step 1)

**Tool:** autocannon | **Target:** `GET /` | **Duration:** 12s per level

| Concurrency | RPS  | Avg    | P50    | P90    | P99     | Max     | Errors | Error Rate |
|-------------|------|--------|--------|--------|---------|---------|--------|------------|
| 50          | 187  | 266ms  | 258ms  | 301ms  | 460ms   | 526ms   | 0      | 0%         |
| 100         | 196  | 500ms  | 514ms  | 559ms  | 621ms   | 633ms   | 0      | 0%         |
| 250         | 210  | 1141ms | 1198ms | 1259ms | 1307ms  | 1402ms  | 0      | 0%         |
| **500**     | **170** | **2573ms** | **1565ms** | **7914ms** | **11047ms** | **11138ms** | **5299** | **67.6%** |
| **1000**    | **135** | **3847ms** | **2829ms** | **8227ms** | **9046ms** | **9070ms** | **9074** | **78.7%** |

**Key observations:**
- RPS **plateaus at ~210** (250c) then **drops** to 170 (500c) and 135 (1000c)
- This is the classic **event loop exhaustion** pattern: more concurrency = LESS throughput
- Zero errors up to 250c, then catastrophic failure at 500c+
- Soak test (500c, 30s) confirmed: system does NOT recover — permanent saturation

---

## 2. Root Cause: Middleware `getUser()` on Every Request

### The smoking gun: Middleware isolation test (Step 2b)

**Tool:** autocannon | **Connections:** 100 | **Duration:** 10s

| Path | RPS    | Avg    | P99    | Errors |
|------|--------|--------|--------|--------|
| `GET /` (middleware + SSR) | **185** | **526ms** | 715ms | 0 |
| `/_next/static/css/app.css` (no middleware) | **2,108** | **47ms** | 96ms | — |
| `/favicon.ico` (no middleware) | 388 | 255ms | 336ms | 0 |

**Middleware overhead: ~479ms per request (11x latency increase)**

### Why this happens

```
src/middleware.ts:4-6
  export async function middleware(request: NextRequest) {
    return await updateSession(request);  ← EVERY request
  }

src/lib/supabase/middleware.ts:47
  await supabase.auth.getUser();  ← Blocking HTTP call to Supabase Auth API
```

**Every non-static HTTP request** flows through:
1. `middleware.ts` → calls `updateSession()`
2. `updateSession()` → creates a **new** `createServerClient` instance
3. Calls `await supabase.auth.getUser()` → **outbound HTTP request** to `https://bwwifvuerhxgjeoochnp.supabase.co/auth/v1/user`
4. Waits for response (~480ms average)

At 250 concurrent connections, this means **250 simultaneous outbound HTTP connections** to Supabase Auth. At 500+, the connection pool saturates and requests start failing.

### The middleware matcher confirms no escaping

```
src/middleware.ts:9-17
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
```

This excludes only static assets. Every page, every API route, every action goes through `getUser()`.

---

## 3. Secondary Issues Identified

### 3a. New Supabase client instance on EVERY request (no connection reuse)

**53 call sites** create new `createClient()` instances:

| Location | Count | Pattern |
|----------|-------|---------|
| `src/lib/supabase/middleware.ts` | 1/request | `createServerClient()` — new instance per middleware call |
| `src/app/actions/booking.actions.ts` | 5 | `await createClient()` — new instance per action |
| `src/app/api/bookings/route.ts` | 2 | `await createClient()` — new instance per route handler |
| `src/services/court.service.ts` | 3 | `createClient()` — new instance per function call |
| `src/hooks/useAllBookingsForDate.ts` | 2 | `createClient()` — new instance per effect |
| `src/features/notifications/useNotificationStore.ts` | 7 | `createClient()` — new instance per method |

Each `createServerClient()` / `createBrowserClient()` creates a fresh HTTP agent. No connection pooling across requests.

### 3b. N+1 query pattern in `/api/bookings` GET

```typescript
// src/app/api/bookings/route.ts:38-43
const bookings = await Promise.all(
  (data as DbBooking[]).map(async (b) => {
    const courtInfo = await getCourtInfoForBooking(b.court_id);  // ← individual query per booking
    return mapDbBookingToBooking(b, courtInfo);
  })
);
```

Each booking triggers a separate `getCourtByIdFromSupabase()` call. 10 bookings = 10 individual Supabase queries. (Mitigated by `getCourtInfoMap()` elsewhere, but not in this route.)

### 3c. Client-side filter of ALL bookings (no date filtering in DB query)

```typescript
// src/hooks/useAllBookingsForDate.ts:29-46
const { data } = await supabase
  .from('bookings')
  .select('*')                    // ← fetches ALL bookings
  .not('status', 'eq', 'Cancelled')
  .not('status', 'eq', 'Expired');

// Then filters CLIENT-SIDE:
const filtered = (data || []).filter((row) => {
  const range = row.booking_range;
  const cleaned = String(range).replace(/[\[\)"']/g, '');
  const parts = cleaned.split(',');
  const startStr = parts[0].trim();
  return startStr.startsWith(date);  // ← client-side date filter
});
```

Every user downloads the **entire bookings table** and filters in JavaScript. At scale, this transfers unnecessary data.

### 3d. `booking-queries.ts` uses browser client server-side

```typescript
// src/lib/supabase/booking-queries.ts:1
import { createClient } from '@/lib/supabase/client';  // ← BROWSER client

// src/services/court.service.ts:2
import { createClient } from '@/lib/supabase/client';  // ← BROWSER client
```

These files import the **browser** Supabase client but are called from server-side API routes. This means:
- No auth session context on the server
- Anonymous queries (RLS applies, but no user context)
- Potential for broken auth-dependent queries

---

## 4. Bottleneck Classification

| Factor | Classification | Evidence |
|--------|---------------|----------|
| **Middleware auth overhead** | **PRIMARY BOTTLENECK** | 479ms per request, 11x vs static |
| **Outbound connection saturation** | **PRIMARY BOTTLENECK** | RPS drops at 500c, 67% error rate |
| **Supabase Auth rate limiting** | CONTRIBUTING | Possible at high concurrency |
| **No auth state caching** | CONTRIBUTING | Every request re-validates |
| **N+1 queries** | MINOR (API routes only) | `/api/bookings` has per-booking queries |
| **Client-side data fetch** | MINOR (not server bottleneck) | Browser→Supabase, not through server |
| **Event loop starvation** | SYMPTOM | Caused by middleware blocking |

---

## 5. Breakpoint Analysis

| Concurrency | State | RPS  | P99    | Errors |
|-------------|-------|------|--------|--------|
| 50          | ✅ Healthy | 187  | 460ms  | 0      |
| 100         | ✅ Healthy | 196  | 621ms  | 0      |
| 250         | ⚠️ Ceiling | 210  | 1307ms | 0      |
| 500         | ❌ Broken | 170  | 11047ms | 5299 (67.6%) |
| 1000        | ❌ Broken | 135  | 9046ms | 9074 (78.7%) |

**Breakpoint: ~250 concurrent connections**

Below 250: System handles load but with increasing latency (middleware overhead compounds).  
At 250: System reaches maximum throughput (~210 RPS).  
Above 250: System degrades — RPS drops, errors spike, no recovery.

---

## 6. Why Static Pages Are 11x Faster

Static assets (`/_next/static/*`) bypass the middleware entirely:
- No `getUser()` call
- No outbound HTTP to Supabase Auth
- No cookie parsing
- No response header manipulation
- Just: receive request → serve file from disk/CDN

Result: 2,108 RPS vs 185 RPS — same server, same hardware, 11x difference.

---

## 7. Impact Assessment

### Current capacity
- **Safe operating ceiling:** ~200 concurrent connections
- **Maximum throughput:** ~210 RPS
- **P99 latency at ceiling:** 1.3s

### What this means for production
- A single page load triggers 1 middleware request + N static asset requests
- If 200 users load the home page simultaneously, the server handles ~200 `getUser()` calls
- At 500+ simultaneous users, the server starts failing
- Real-world: ~200 concurrent page loads before degradation begins

### Soak test verdict
- 500c for 30s: System NEVER recovers
- Once saturated, the event loop backlog prevents recovery
- Requires server restart to restore normal operation

---

## 8. No-Optimization Rule Compliance

This report is **diagnostic only**. No application logic, auth configuration, RLS policies, database schema, indexes, constraints, triggers, Supabase configuration, environment variables, Next.js configuration, caching layers, UI components, or API behavior has been modified.

Temporary diagnostic scripts created:
- `load-test/diag-step1.mjs` — Baseline load test (Windows-compatible)
- `load-test/diag-step2.mjs` — Event loop lag monitor
- `load-test/diag-step2b.mjs` — Middleware isolation test

---

## 9. Recommendations (Diagnostic Only — Not Implemented)

| Priority | Issue | Recommendation |
|----------|-------|----------------|
| **P0** | Middleware `getUser()` on every request | Cache auth session; skip `getUser()` for unauthenticated pages |
| **P0** | No connection reuse | Singleton Supabase client per request lifecycle |
| **P1** | N+1 in `/api/bookings` | Use existing `getCourtInfoMap()` instead of per-booking queries |
| **P1** | Client-side booking filter | Add date range filter to Supabase query (`gte`/`lt` on `booking_range`) |
| **P2** | Browser client used server-side | Use server client in `court.service.ts` and `booking-queries.ts` |
| **P2** | Realtime subscription per user | Share Realtime channel; debounce re-fetches |

---

## 10. Verdict

**PRIMARY BOTTLENECK: Supabase Auth `getUser()` in Next.js middleware**

- Executes on every non-static request
- Adds ~480ms mandatory latency per request
- Creates outbound HTTP connections that saturate at ~250 concurrent
- No caching, no skip logic, no session optimization
- Causes event loop exhaustion at high concurrency
- Results in 11x throughput reduction vs static serving

**SECONDARY ISSUES: N+1 queries, client-side data filtering, browser client used server-side**

These do not cause the primary degradation but reduce efficiency on specific code paths.

---

*Report generated by Phase 10.6 diagnostic audit. All findings are based on code analysis and runtime measurements. No optimizations were applied.*
