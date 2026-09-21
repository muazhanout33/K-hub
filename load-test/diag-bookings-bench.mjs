import http from 'http';
import fs from 'fs';

const CONCURRENCY_LEVELS = [10, 50, 100, 250, 500];
const DURATION_SEC = 10;
const WARMUP_REQUESTS = 20;

const TARGETS = [
  { name: 'GET /bookings (auth-required, getUser now SKIPPED by fix)', path: '/bookings' },
  { name: 'GET / (public, getUser now SKIPPED by fix)', path: '/' },
  { name: 'GET /api/courts (public API, dynamic)', path: '/api/courts' },
];

function makeRequest(host, port, path) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const req = http.request({ hostname: host, port, path, method: 'GET', headers: { 'User-Agent': 'diag-bench' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const ns = Number(process.hrtime.bigint() - start);
        resolve({ status: res.statusCode, latencyNs: ns, size: Buffer.byteLength(data) });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function benchTarget(host, port, target, concurrency, durationSec) {
  for (let i = 0; i < WARMUP_REQUESTS; i++) {
    await makeRequest(host, port, target.path).catch(() => {});
  }

  const results = [];
  const stopTime = Date.now() + durationSec * 1000;
  let active = 0;
  let totalReqs = 0;
  let errors = 0;

  return new Promise((resolve) => {
    function scheduleNext() {
      while (active < concurrency && Date.now() < stopTime) {
        active++;
        makeRequest(host, port, target.path).then((r) => {
          results.push(r);
          totalReqs++;
          if (r.status >= 400) errors++;
        }).catch(() => {
          errors++;
          totalReqs++;
        }).finally(() => {
          active--;
          scheduleNext();
        });
      }
      if (active === 0 || Date.now() >= stopTime) {
        const latencies = results.map(r => r.latencyNs / 1e6).sort((a, b) => a - b);
        const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
        const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
        const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
        const avg = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
        const rps = totalReqs / durationSec;
        resolve({ concurrency, totalReqs, errors, rps, avg, p50, p95, p99 });
      }
    }
    scheduleNext();
  });
}

async function main() {
  const host = 'localhost';
  const port = 3000;

  console.log('=== Phase 10.7 AFTER Benchmark — Auth-Required vs Public Routes ===');
  console.log(`Duration: ${DURATION_SEC}s per level\n`);

  const allResults = {};

  for (const target of TARGETS) {
    console.log(`\n--- ${target.name} ---`);
    allResults[target.name] = [];

    for (const c of CONCURRENCY_LEVELS) {
      const r = await benchTarget(host, port, target, c, DURATION_SEC);
      allResults[target.name].push(r);
      console.log(`  ${String(r.concurrency).padStart(4)}c | ${String(Math.round(r.rps)).padStart(6)} RPS | avg ${String(Math.round(r.avg)).padStart(5)}ms | p50 ${String(Math.round(r.p50)).padStart(5)}ms | p95 ${String(Math.round(r.p95)).padStart(5)}ms | p99 ${String(Math.round(r.p99)).padStart(5)}ms | err ${r.errors}`);
    }
  }

  const outPath = new URL('./results/phase10_7_after_bookings.json', import.meta.url);
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to results/phase10_7_after_bookings.json`);
}

main().catch(console.error);
