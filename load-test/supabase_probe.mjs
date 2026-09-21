/**
 * Phase 10.10 — Standalone Supabase latency probe.
 * Directly queries Supabase via the server client factory,
 * bypassing the HTTP server to isolate pure DB latency.
 *
 * Usage: node load-test/supabase_probe.mjs
 */
import { performance } from 'perf_hooks';
import fs from 'fs';

// We'll use fetch to query Supabase REST API directly.
// Read env vars from the Next.js project.
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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`Anon key present: ${SUPABASE_ANON_KEY ? 'yes' : 'no'}`);
console.log('');

const QUERIES = [
  {
    name: 'SELECT * FROM courts WHERE deleted_at IS NULL',
    path: '/rest/v1/courts?select=*&deleted_at=is.null&order=created_at.asc',
    method: 'GET',
  },
  {
    name: 'SELECT * FROM courts WHERE id = (single row)',
    path: `/rest/v1/courts?id=eq.a1b2c3d4-0001-4000-8000-000000000001&select=*&deleted_at=is.null&limit=1`,
    method: 'GET',
  },
  {
    name: 'SELECT * FROM bookings WHERE user_id = (empty result)',
    path: `/rest/v1/bookings?select=*&user_id=eq.00000000-0000-0000-0000-000000000000&order=created_at.desc`,
    method: 'GET',
  },
];

const CONCURRENCY_LEVELS = [1, 5, 10, 25, 50, 100, 250, 500];

async function querySupabase(query) {
  const url = `${SUPABASE_URL}${query.path}`;
  const start = performance.now();
  const res = await fetch(url, {
    method: query.method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  const latencyMs = performance.now() - start;
  return { latencyMs, status: res.status, rowCount: Array.isArray(data) ? data.length : 0, error: data.message || null };
}

async function probeQuery(query, concurrency, iterations = 50) {
  const results = [];
  let active = 0;
  let completed = 0;
  const startTime = performance.now();

  return new Promise((resolve) => {
    function scheduleNext() {
      while (active < concurrency && completed < iterations) {
        active++;
        completed++;
        querySupabase(query)
          .then(r => { results.push(r); })
          .catch(() => { results.push({ latencyMs: 99999, status: 0, rowCount: 0, error: 'failed' }); })
          .finally(() => { active--; scheduleNext(); });
      }
      if (active === 0 || completed >= iterations) {
        const elapsedMs = performance.now() - startTime;
        const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
        resolve({
          concurrency,
          iterations: results.length,
          elapsedMs,
          avg: latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1),
          p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
          p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
          p99: latencies[Math.floor(latencies.length * 0.99)] || 0,
          min: latencies[0] || 0,
          max: latencies[latencies.length - 1] || 0,
          errors: results.filter(r => r.status >= 400 || r.error).length,
        });
      }
    }
    scheduleNext();
  });
}

async function main() {
  console.log('=== Phase 10.10 — Direct Supabase Latency Probe ===');
  console.log(`Concurrency levels: ${CONCURRENCY_LEVELS.join(', ')}`);
  console.log(`Queries: ${QUERIES.length}`);
  console.log('');

  const allResults = {};

  for (const query of QUERIES) {
    console.log(`\n--- ${query.name} ---`);
    allResults[query.name] = [];

    for (const c of CONCURRENCY_LEVELS) {
      process.stdout.write(`  ${String(c).padStart(5)}c x50 ... `);
      const r = await probeQuery(query, c, 50);
      allResults[query.name].push(r);
      console.log(
        `avg ${String(Math.round(r.avg)).padStart(5)}ms | p50 ${String(Math.round(r.p50)).padStart(5)}ms | p95 ${String(Math.round(r.p95)).padStart(5)}ms | p99 ${String(Math.round(r.p99)).padStart(5)}ms | err=${r.errors}`
      );
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Connection test: measure time to establish a new TCP connection
  console.log('\n--- TCP Connection Time ---');
  const url = new URL(SUPABASE_URL);
  const connectionTimes = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const res = await fetch(SUPABASE_URL + '/rest/v1/?apikey=' + SUPABASE_ANON_KEY);
    const elapsed = performance.now() - start;
    connectionTimes.push(elapsed);
  }
  const sortedConn = connectionTimes.sort((a, b) => a - b);
  console.log(`avg ${Math.round(sortedConn.reduce((a, b) => a + b, 0) / sortedConn.length)}ms | p50 ${Math.round(sortedConn[4])}ms | p95 ${Math.round(sortedConn[8])}ms | min ${Math.round(sortedConn[0])}ms | max ${Math.round(sortedConn[9])}ms`);

  allResults._connectionTest = {
    host: url.hostname,
    avgMs: sortedConn.reduce((a, b) => a + b, 0) / sortedConn.length,
    p50Ms: sortedConn[4],
    p95Ms: sortedConn[8],
    minMs: sortedConn[0],
    maxMs: sortedConn[9],
  };

  const outPath = new URL('./results/phase10_10_supabase_probe.json', import.meta.url);
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to results/phase10_10_supabase_probe.json`);
}

main().catch(console.error);
