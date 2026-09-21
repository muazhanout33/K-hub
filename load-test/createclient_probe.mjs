/**
 * Phase 10.10 — createClient() latency probe.
 * Measures how long it takes to create a Supabase server client
 * under varying concurrency. This isolates the client creation overhead
 * (which includes cookies() call and crypto operations).
 *
 * Usage: node load-test/createclient_probe.mjs
 */
import { performance } from 'perf_hooks';
import fs from 'fs';

const CONCURRENCY_LEVELS = [1, 5, 10, 25, 50, 100, 250, 500];

function loadEnv() {
  const envPath = new URL('../.env.local', import.meta.url);
  const content = fs.readFileSync(envPath, 'utf8');
  const vars = {};
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

// Simulate what createClient does: make a request with cookies.
// We measure the full round-trip to Supabase as a proxy for client creation time.
async function measureCreateClientProxy() {
  const start = performance.now();
  // Create a simple Supabase client-like request (this is what createClient effectively does)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_ANON_KEY}`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  await res.text();
  return performance.now() - start;
}

// Measure auth.getUser() latency (a required step in server client creation)
async function measureAuthLatency() {
  const start = performance.now();
  // We can't call Supabase auth without a real session, but we can measure
  // the overhead of a Supabase RPC call that mimics the auth pattern
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  await res.text();
  return performance.now() - start;
}

// Measure a minimal Supabase query latency
async function measureQueryLatency() {
  const start = performance.now();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/courts?select=id&deleted_at=is.null&limit=1`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  await res.text();
  return performance.now() - start;
}

async function probeLabel(label, fn, concurrency, iterations = 30) {
  const results = [];
  let completed = 0;
  const startTime = performance.now();

  return new Promise((resolve) => {
    function scheduleNext() {
      while (completed < iterations) {
        completed++;
        fn()
          .then(r => results.push(r))
          .catch(() => results.push(99999))
          .finally(() => scheduleNext());
      }
      if (completed >= iterations && results.length >= iterations) {
        const elapsedMs = performance.now() - startTime;
        const sorted = results.sort((a, b) => a - b);
        resolve({
          label,
          concurrency,
          iterations: results.length,
          elapsedMs,
          avgMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
          p50Ms: sorted[Math.floor(sorted.length * 0.5)],
          p95Ms: sorted[Math.floor(sorted.length * 0.95)],
          p99Ms: sorted[Math.floor(sorted.length * 0.99)],
          minMs: sorted[0],
          maxMs: sorted[sorted.length - 1],
        });
      }
    }
    scheduleNext();
  });
}

async function main() {
  console.log('=== Phase 10.10 — createClient / Auth / Query Probe ===');
  console.log('');

  const probeFns = [
    { label: 'Supabase REST init', fn: measureCreateClientProxy },
    { label: 'auth.getUser() proxy', fn: measureAuthLatency },
    { label: 'Single-row query', fn: measureQueryLatency },
  ];

  const allResults = {};

  for (const probe of probeFns) {
    console.log(`\n--- ${probe.label} ---`);
    allResults[probe.label] = [];

    for (const c of [1, 5, 10, 25, 50]) {
      process.stdout.write(`  ${String(c).padStart(5)}c x30 ... `);
      const r = await probeLabel(probe.label, probe.fn, c, 30);
      allResults[probe.label].push(r);
      console.log(
        `avg ${String(Math.round(r.avgMs)).padStart(5)}ms | p50 ${String(Math.round(r.p50Ms)).padStart(5)}ms | p95 ${String(Math.round(r.p95Ms)).padStart(5)}ms | p99 ${String(Math.round(r.p99Ms)).padStart(5)}ms | total ${Math.round(r.elapsedMs)}ms`
      );
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const outPath = new URL('./results/phase10_10_createclient_probe.json', import.meta.url);
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to results/phase10_10_createclient_probe.json`);
}

main().catch(console.error);
