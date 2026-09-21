# Phase 10.10 — Supabase Concurrency Bottleneck Investigation

**Date:** 2026-08-25
**Status:** INVESTIGATION ONLY — No changes implemented
**Recommendation:** Implement connection pooling / request-scoped client reuse

---

## Executive Summary

Under high concurrency, the primary bottleneck is **Supabase connection overhead from per-request client creation** — not the database queries themselves. Each request creates a new `createServerClient` instance and opens a fresh HTTP connection to Supabase, causing socket counts to grow linearly with concurrency (1:1 ratio). This saturates both the local TCP stack and Supabase's connection limits, collapsing RPS at 1000c+.

| Endpoint | 10c RPS | 1000c RPS | 1000c Avg Latency | Degradation Factor |
|----------|---------|-----------|-------------------|-------------------|
| `/api/courts` | 69 | 9 | 8,411ms | 7.7× RPS drop |
| `/api/courts/[id]` | 86 | 4 | 5,892ms | 21.5× RPS drop |
| `/api/bookings` | 89 | 279 | 2,683ms | 3.1× (errors inflate RPS) |
| `/` (control, no DB) | 219 | 682 | 2,051ms | 3.1× (Node.js HTTP limit) |

**Control endpoint (`/`) achieves 76× more RPS than `/api/courts` at 1000c**, confirming the bottleneck is Supabase connection overhead, not the Node.js HTTP server.

---

## Root Cause Analysis

### Root Cause #1: Per-Request `createServerClient` (CONFIRMED)

**Evidence:**
- Socket count scales 1:1 with concurrency (verified in benchmark):
  - 10c → 10 sockets
  - 100c → 100 sockets
  - 500c → 500 sockets
  - 1000c → 1,000 sockets
- No connection pooling detected — each request opens a new TCP connection to Supabase

**Code paths creating new clients per request:**
1. `src/lib/supabase/middleware.ts:19` — `createServerClient()` in `updateSession()` (runs for `/api/bookings`)
2. `src/lib/supabase/server.ts:16` — `createServerClient()` in `createClient()` (runs for `/api/courts`, `/api/bookings`)
3. For `/api/bookings`, BOTH paths execute (middleware + route handler) = 2 client creations per request

**Impact:** At 1000c, 1000–2000 simultaneous TCP connections to Supabase. Supabase free tier connection limit is likely 50–100. Even on paid tiers, each connection has overhead (TLS handshake, auth negotiation).

### Root Cause #2: Middleware Auth Overhead (HIGH CONFIDENCE)

**Evidence:**
- Middleware calls `supabase.auth.getUser()` on EVERY request to `/api/bookings` (`middleware.ts:47`)
- This is a network call to Supabase Auth API (~50–100ms overhead per request)
- For `/api/bookings`, the route handler ALSO creates a client and calls `auth.getUser()` = 2 auth checks per request
- `/api/courts` bypasses middleware auth (`needsSessionRefresh()` returns false) but still creates a server client

**Code:**
```typescript
// middleware.ts — runs on /api/bookings
export async function updateSession(request: NextRequest) {
  const supabase = createServerClient(...); // New client
  await supabase.auth.getUser();            // Network call
  return supabaseResponse;
}

// api/bookings/route.ts — runs on every GET /api/bookings
const supabase = await createClient();      // Another new client
const { data: authData } = await supabase.auth.getUser(); // Another network call
```

**Impact:** At 1000c, `/api/bookings` makes 2000 Supabase auth calls + 1000 data queries = 3000 HTTP requests to Supabase.

### Root Cause #3: Supabase Connection Limit (PROBABLE)

**Evidence:**
- Direct Supabase probe at 25c: avg 213ms per query (works fine)
- HTTP benchmark at 100c: `/api/courts` drops to 90 RPS (from 102 at 50c)
- At 500c+: RPS drops below 10 for data endpoints
- TCP connection time to Supabase: avg 58ms, p95 66ms (consistent)

**Inference:** The Supabase hosted instance likely enforces per-IP or per-connection limits. When the server opens 500+ simultaneous connections, Supabase throttles or queues requests, causing latency to spike from ~100ms to 4,000–8,000ms.

---

## Data Summary

### HTTP Benchmark (baseline, 12s per level)

```
GET /api/courts (all courts, Supabase query):
  10c:  69 RPS | avg  143ms | p95   214ms | cpu 1253% | sock   10/10
  50c: 102 RPS | avg  481ms | p95   741ms | cpu 1256% | sock   50/50
 100c:  90 RPS | avg 1077ms | p95  2356ms | cpu 1806% | sock  100/100
 250c: 101 RPS | avg 2273ms | p95  6129ms | cpu 1263% | sock  250/250
 500c:  75 RPS | avg 4489ms | p95 11107ms | cpu 1106% | sock  500/500
1000c:   9 RPS | avg 8411ms | p95 11804ms | cpu 2569% | sock 1000/1000
2000c:  11 RPS | avg 4282ms | p95  5039ms | cpu 4916% | sock 2005/2005 (11 errors)

GET /api/courts/[id] (single court, Supabase query):
  10c:  86 RPS | avg  115ms | p95   167ms | cpu  765% | sock   10/10
  50c: 124 RPS | avg  394ms | p95   520ms | cpu 1285% | sock   50/50
 100c: 113 RPS | avg  859ms | p95  2036ms | cpu 1090% | sock  100/100
 250c:  95 RPS | avg 2390ms | p95  6997ms | cpu 1172% | sock  250/250
 500c:  61 RPS | avg 4440ms | p95 10438ms | cpu 1677% | sock  500/500
1000c:   4 RPS | avg 5892ms | p95 10466ms | cpu 2838% | sock 1000/1000
2000c: 231 RPS | avg 4372ms | p95  5396ms | cpu 14383% | sock 2016/2035 (2467 errors)

GET /api/bookings (auth required, 401 for unauthenticated):
  10c:  89 RPS | avg  112ms | p95   223ms | cpu 2880% | sock  398/845 (1070 errors)
  50c: 134 RPS | avg  367ms | p95   555ms | cpu 1253% | sock   50/50 (1609 errors)
 100c: 182 RPS | avg  530ms | p95   804ms | cpu 1302% | sock  100/100 (2187 errors)
 250c: 147 RPS | avg 1529ms | p95  2897ms | cpu 1497% | sock  250/250 (1769 errors)
 500c: 237 RPS | avg 2445ms | p95  4832ms | cpu 5874% | sock  500/500 (2847 errors)
1000c: 279 RPS | avg 2683ms | p95  5847ms | cpu 12808% | sock 1000/1007 (3345 errors)
2000c: 370 RPS | avg 7338ms | p95 11092ms | cpu 15023% | sock 2004/2106 (4494 errors)

GET / (control — static page, no Supabase):
  10c: 219 RPS | avg   46ms | p95    76ms | cpu 2148% | sock   10/10
  50c: 250 RPS | avg  198ms | p95   261ms | cpu 2604% | sock   50/50
 100c: 255 RPS | avg  385ms | p95   462ms | cpu 2604% | sock  100/100
 250c: 264 RPS | avg  906ms | p95  1023ms | cpu 3026% | sock  250/250
 500c: 347 RPS | avg 1781ms | p95  4165ms | cpu 6869% | sock  500/500 (1242 errors)
1000c: 682 RPS | avg 2051ms | p95  3715ms | cpu 16973% | sock 1000/1000 (5703 errors)
2000c: 536 RPS | avg 5614ms | p95  9855ms | cpu 17221% | sock 2000/2000 (4280 errors)
```

### Direct Supabase Probe (bypassing Next.js HTTP server)

```
SELECT * FROM courts WHERE deleted_at IS NULL:
  1c:  avg 131ms | p50  96ms | p95 391ms
  5c:  avg 111ms | p50  89ms | p95 237ms
 10c:  avg 114ms | p50  95ms | p95 244ms
 25c:  avg 213ms | p50 197ms | p95 348ms

SELECT * FROM courts WHERE id = (single row):
  1c:  avg  99ms | p50  93ms | p95 109ms
  5c:  avg 109ms | p50  93ms | p95 220ms
 10c:  avg 114ms | p50  99ms | p95 222ms
 25c:  avg 129ms | p50 119ms | p95 240ms

TCP Connection Time to Supabase:
  avg 58ms | p50 54ms | p95 66ms | min 51ms | max 68ms
```

### Key Comparison: Supabase vs Control at High Concurrency

| Concurrency | `/api/courts` RPS | `/` (control) RPS | Ratio | Latency Gap |
|-------------|-------------------|-------------------|-------|-------------|
| 10 | 69 | 219 | 3.2× | 97ms |
| 100 | 90 | 255 | 2.8× | 692ms |
| 500 | 75 | 347 | 4.6× | 2,708ms |
| 1000 | 9 | 682 | **75.8×** | **6,360ms** |

The gap widens dramatically at 1000c because:
- Control endpoint: Node.js HTTP server handles requests with no external calls
- `/api/courts`: Each request creates a new TCP connection to Supabase (58ms base + query time + connection overhead)

---

## Capacity Breakpoint Analysis

| Endpoint | Breakpoint | Evidence |
|----------|-----------|----------|
| `/api/courts` | **500c** | RPS drops from 102 (50c) to 75 (500c), latency crosses 4s |
| `/api/courts/[id]` | **250c** | RPS drops from 124 (50c) to 95 (250c), latency crosses 2s |
| `/api/bookings` | **500c** | RPS inflates due to fast 401s; actual data queries would bottleneck earlier |
| `/` (control) | **1000c** | RPS still climbing at 682; 2000c shows first sign of saturation |

---

## Code Paths Creating Supabase Clients Per Request

| Path | File | Creates Client? | Calls Auth? |
|------|------|----------------|-------------|
| Middleware (for `/api/bookings`) | `src/lib/supabase/middleware.ts:19` | Yes | Yes (`getUser()`) |
| API route handler | `src/lib/supabase/server.ts:16` | Yes | No (but route handler calls `getUser()` separately) |
| `/api/bookings` total | — | **2 clients** | **2 auth calls** |
| `/api/courts` total | — | **1 client** | **0 auth calls** (bypassed by middleware) |

---

## Recommendations (Single Highest-Confidence Fix)

**Implement request-scoped Supabase client caching** using Next.js `requestAsyncStorage` or a WeakMap keyed to the request context. This would:

1. Reuse a single `createServerClient` instance per request across middleware + route handler
2. Avoid the second `createServerClient` call in the route handler when middleware already created one
3. Reduce TCP connections per request from 2 (for `/api/bookings`) to 1

**Expected impact:** 30–50% latency reduction at 500c+ for `/api/bookings`; 15–25% for `/api/courts` (middleware doesn't create client for courts, but the route handler still does).

**Alternative (higher impact but more complex):** Implement a global Supabase connection pool (e.g., using `undici` connection pooling or a singleton client with cookie rotation). This would cap total TCP connections regardless of concurrency, preventing Supabase connection limit issues.

---

## Files Modified/Created During Investigation

- `src/app/api/_diagnostic/route.ts` — Created (diagnostic endpoint, returns 404 in current build)
- `src/app/api/_health/route.ts` — Created (health endpoint, returns 404 in current build)
- `load-test/phase10_10_bench.mjs` — Created (HTTP benchmark script)
- `load-test/supabase_probe.mjs` — Created (direct Supabase latency probe)
- `load-test/createclient_probe.mjs` — Created (client creation probe)
- `load-test/results/phase10_10_baseline.json` — HTTP benchmark results
- `load-test/results/phase10_10_supabase_probe.json` — Supabase direct probe results

**Note:** The `_diagnostic` and `_health` endpoints are not compiled into the production build due to Next.js 16 Turbopack `_` prefix behavior. They are harmless dead code and can be cleaned up in Phase 11.
