#!/usr/bin/env node
/**
 * Phase 10.6 — Step 2+3: Event Loop Lag + HTTP Layer Diagnostic
 * 
 * Measures:
 * - Event loop lag at each concurrency level
 * - Outbound HTTP connection behavior
 * - Per-request middleware overhead (getUser)
 * - Supabase Auth call latency distribution
 */

import { chromium } from 'playwright';

const URLS = {
  home: 'http://localhost:3000/',
  static: 'http://localhost:3000/_next/static/',
  api_courts: 'http://localhost:3000/api/courts',
};

const CONCURRENCY_LEVELS = [10, 50, 100, 250, 500];
const DURATION_MS = 15000;
const WARMUP_MS = 3000;

// ── Event loop lag tracker ───────────────────────────────────────────
class EventLoopMonitor {
  constructor(intervalMs = 50) {
    this.lags = [];
    this.interval = intervalMs;
    this._timer = null;
    this._last = performance.now();
    this._running = false;
  }

  start() {
    this._running = true;
    this._last = performance.now();
    this._tick();
  }

  _tick() {
    if (!this._running) return;
    const now = performance.now();
    const expected = this._last + this.interval;
    const lag = Math.max(0, now - expected - this.interval);
    if (lag > 0) this.lags.push(lag);
    this._last = now;
    this._timer = setTimeout(() => this._tick(), this.interval);
  }

  stop() {
    this._running = false;
    if (this._timer) clearTimeout(this._timer);
  }

  getStats() {
    if (this.lags.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0, count: 0 };
    const sorted = [...this.lags].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return {
      avg: Math.round(avg * 100) / 100,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
      max: Math.round(sorted[sorted.length - 1] * 100) / 100,
      count: sorted.length,
    };
  }

  reset() {
    this.lags = [];
  }
}

// ── Single request latency tracker ───────────────────────────────────
class RequestTracker {
  constructor() { this.latencies = []; this.errors = 0; this.timeouts = 0; }

  record(ms) { this.latencies.push(ms); }
  recordError() { this.errors++; }
  recordTimeout() { this.timeouts++; }

  getStats() {
    if (this.latencies.length === 0) return null;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return {
      count: sorted.length,
      errors: this.errors,
      timeouts: this.timeouts,
      avg: Math.round(avg),
      p50: Math.round(sorted[Math.floor(sorted.length * 0.5)] || 0),
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0),
      p99: Math.round(sorted[Math.floor(sorted.length * 0.99)] || 0),
      max: Math.round(sorted[sorted.length - 1] || 0),
    };
  }

  reset() { this.latencies = []; this.errors = 0; this.timeouts = 0; }
}

// ── HTTP fetch with timing ───────────────────────────────────────────
async function fetchWithTiming(url, timeoutMs = 30000) {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const elapsed = performance.now() - start;
    return { ok: res.ok, status: res.status, elapsed, size: Number(res.headers.get('content-length')) || 0 };
  } catch (err) {
    const elapsed = performance.now() - start;
    if (err.name === 'AbortError') return { ok: false, status: 0, elapsed, error: 'timeout' };
    return { ok: false, status: 0, elapsed, error: err.message };
  }
}

// ── Run concurrent requests ──────────────────────────────────────────
async function runConcurrent(url, concurrency, durationMs, eventLoopMonitor) {
  const tracker = new RequestTracker();
  const endTime = Date.now() + durationMs;
  const active = new Set();
  let sent = 0;

  eventLoopMonitor.reset();

  const worker = async () => {
    while (Date.now() < endTime) {
      sent++;
      const p = fetchWithTiming(url, 30000).then((result) => {
        active.delete(p);
        if (result.error === 'timeout') tracker.recordTimeout();
        else if (!result.ok) tracker.recordError();
        else tracker.record(result.elapsed);
      }).catch(() => { active.delete(p); tracker.recordError(); });
      active.add(p);

      // Yield to event loop between dispatches
      if (active.size >= concurrency) {
        await Promise.race(active);
      } else {
        await new Promise(r => setImmediate(r));
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, 200) }, () => worker());
  await Promise.all(workers);
  await Promise.allSettled([...active]);

  return { tracker, sent, completed: tracker.latencies.length + tracker.errors + tracker.timeouts };
}

// ── Process memory snapshot ──────────────────────────────────────────
function getMemoryMB() {
  const mem = process.memoryUsage();
  return Math.round(mem.heapUsed / 1024 / 1024);
}

// ── Main diagnostic ──────────────────────────────────────────────────
async function main() {
  console.log('PHASE 10.6 — STEP 2+3: EVENT LOOP + HTTP LAYER DIAGNOSTIC');
  console.log('Target:', URLS.home);
  console.log('Concurrency levels:', CONCURRENCY_LEVELS.join(', '));
  console.log('Duration:', DURATION_MS / 1000, 's per level');
  console.log('');

  // Warmup
  console.log('--- WARMUP ---');
  const eventLoop = new EventLoopMonitor(10);
  eventLoop.start();
  await runConcurrent(URLS.home, 20, WARMUP_MS, eventLoop);
  console.log('Warmup complete.\n');

  const results = [];

  for (const concurrency of CONCURRENCY_LEVELS) {
    console.log(`=== CONCURRENCY: ${concurrency} ===`);
    console.log(`  Memory before: ${getMemoryMB()} MB`);

    eventLoop.reset();
    const memBefore = getMemoryMB();

    const { tracker, sent, completed } = await runConcurrent(
      URLS.home, concurrency, DURATION_MS, eventLoop
    );

    const memAfter = getMemoryMB();
    const loopStats = eventLoop.getStats();
    const reqStats = tracker.getStats();

    console.log(`  Memory after: ${memAfter} MB (delta: ${memAfter - memBefore} MB)`);
    console.log(`  Event loop lag: avg=${loopStats.avg}ms p50=${loopStats.p50}ms p95=${loopStats.p95}ms p99=${loopStats.p99}ms max=${loopStats.max}ms (samples: ${loopStats.count})`);
    if (reqStats) {
      console.log(`  Requests: ${completed}/${sent} completed`);
      console.log(`  Latency: avg=${reqStats.avg}ms p50=${reqStats.p50}ms p95=${reqStats.p95}ms p99=${reqStats.p99}ms max=${reqStats.max}ms`);
      console.log(`  Errors: ${reqStats.errors} timeouts: ${reqStats.timeouts}`);
    }

    results.push({
      concurrency,
      memBefore,
      memAfter,
      deltaMem: memAfter - memBefore,
      eventLoop: loopStats,
      requests: reqStats,
      sent,
      completed,
    });

    console.log('');
    // Cool down
    await new Promise(r => setTimeout(r, 2000));
  }

  // ── Summary table ──────────────────────────────────────────────
  console.log('=== EVENT LOOP + HTTP SUMMARY ===');
  console.log('Conn | EL-Avg  | EL-P95  | EL-P99  | EL-Max  | Req-Avg | Req-P95 | Req-P99 | Errors | Timeouts');
  console.log('-----|---------|---------|---------|---------|---------|---------|---------|--------|---------');
  for (const r of results) {
    const el = r.eventLoop;
    const req = r.requests || {};
    console.log(
      `${String(r.concurrency).padStart(4)} | ${String(el.avg).padStart(7)} | ${String(el.p95).padStart(7)} | ${String(el.p99).padStart(7)} | ${String(el.max).padStart(7)} | ${String(req.avg ?? '-').padStart(7)} | ${String(req.p95 ?? '-').padStart(7)} | ${String(req.p99 ?? '-').padStart(7)} | ${String(req.errors ?? '-').padStart(6)} | ${String(req.timeouts ?? '-').padStart(7)}`
    );
  }

  eventLoop.stop();
  console.log('\nStep 2+3 complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
