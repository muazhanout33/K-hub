import http from 'http';
import fs from 'fs';
import os from 'os';
import { performance } from 'perf_hooks';

const CONCURRENCY_LEVELS = [10, 50, 100, 250, 500, 1000, 2000];
const DURATION_SEC = 12;
const WARMUP_REQUESTS = 20;
const COOLDOWN_MS = 3000;
const FIRST_COURT_ID = 'a1b2c3d4-0001-4000-8000-000000000001';

const TARGETS = [
  { name: 'GET /api/courts', path: '/api/courts', type: 'dynamic-api' },
  { name: 'GET /api/courts/[id]', path: `/api/courts/${FIRST_COURT_ID}`, type: 'dynamic-api-param' },
  { name: 'GET /api/bookings', path: '/api/bookings', type: 'dynamic-api-auth-required' },
  { name: 'GET / (control)', path: '/', type: 'control-static' },
];

function makeRequest(host, port, path) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request(
      { hostname: host, port, path, method: 'GET', headers: { 'User-Agent': 'phase1010-bench' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const latencyMs = performance.now() - start;
          resolve({ status: res.statusCode, latencyMs, size: Buffer.byteLength(data) });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function getEventLoopLag() {
  return new Promise((resolve) => {
    const start = performance.now();
    setImmediate(() => { resolve(performance.now() - start); });
  });
}

function collectRuntimeMetrics() {
  const mem = process.memoryUsage();
  const agent = http.globalAgent;
  let activeSockets = 0;
  let queuedRequests = 0;
  if (agent?.sockets) {
    for (const key of Object.keys(agent.sockets)) activeSockets += agent.sockets[key]?.length || 0;
  }
  if (agent?.requests) {
    for (const key of Object.keys(agent.requests)) queuedRequests += agent.requests[key]?.length || 0;
  }
  return { timestamp: Date.now(), rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, activeSockets, queuedRequests };
}

function cpuUsageDiff(prev) {
  const curr = process.cpuUsage();
  return { userDelta: curr.user - (prev?.user || 0), systemDelta: curr.system - (prev?.system || 0) };
}

async function benchTarget(host, port, target, concurrency, durationSec) {
  for (let i = 0; i < WARMUP_REQUESTS; i++) {
    await makeRequest(host, port, target.path).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 300));

  const results = [];
  const runtimeSamples = [];
  const stopTime = Date.now() + durationSec * 1000;
  let active = 0;
  let totalReqs = 0;
  let errors = 0;
  let timeouts = 0;
  const cpuStart = process.cpuUsage();
  const startTime = performance.now();

  const runtimeInterval = setInterval(() => runtimeSamples.push(collectRuntimeMetrics()), 200);
  const lagSamples = [];
  const lagInterval = setInterval(async () => lagSamples.push(await getEventLoopLag()), 100);

  return new Promise((resolve) => {
    function scheduleNext() {
      while (active < concurrency && Date.now() < stopTime) {
        active++;
        makeRequest(host, port, target.path)
          .then((r) => { results.push(r); totalReqs++; if (r.status >= 400) errors++; })
          .catch((e) => { totalReqs++; if (e.message === 'timeout') timeouts++; else errors++; })
          .finally(() => { active--; scheduleNext(); });
      }
      if (active === 0 || Date.now() >= stopTime) {
        clearInterval(runtimeInterval);
        clearInterval(lagInterval);
        const elapsedMs = performance.now() - startTime;
        const cpuDelta = cpuUsageDiff(cpuStart);
        runtimeSamples.push(collectRuntimeMetrics());

        const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
        const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
        const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
        const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
        const avg = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);

        const sortedLag = lagSamples.sort((a, b) => a - b);
        const avgLag = sortedLag.reduce((a, b) => a + b, 0) / (sortedLag.length || 1);
        const maxLag = sortedLag[sortedLag.length - 1] || 0;
        const p95Lag = sortedLag[Math.floor(sortedLag.length * 0.95)] || 0;

        const avgRss = runtimeSamples.reduce((s, x) => s + x.rss, 0) / (runtimeSamples.length || 1);
        const avgHeapUsed = runtimeSamples.reduce((s, x) => s + x.heapUsed, 0) / (runtimeSamples.length || 1);
        const maxHeapUsed = Math.max(...runtimeSamples.map(x => x.heapUsed));
        const avgSockets = runtimeSamples.reduce((s, x) => s + x.activeSockets, 0) / (runtimeSamples.length || 1);
        const maxSockets = Math.max(...runtimeSamples.map(x => x.activeSockets));

        const cpuUserPct = (cpuDelta.userDelta / 1000) / (elapsedMs / 1000) * 100 / os.cpus().length;
        const cpuSysPct = (cpuDelta.systemDelta / 1000) / (elapsedMs / 1000) * 100 / os.cpus().length;

        resolve({
          concurrency, totalReqs, errors, timeouts,
          rps: totalReqs / (elapsedMs / 1000),
          avg, p50, p95, p99, min: latencies[0] || 0, max: latencies[latencies.length - 1] || 0,
          loop: { avgLagMs: avgLag, maxLagMs: maxLag, p95LagMs: p95Lag },
          memory: { avgRssBytes: avgRss, avgHeapUsedBytes: avgHeapUsed, maxHeapUsedBytes: maxHeapUsed },
          connections: { avgSockets, maxSockets },
          cpu: { userPct: Math.round(cpuUserPct * 100) / 100, sysPct: Math.round(cpuSysPct * 100) / 100, totalPct: Math.round((cpuUserPct + cpuSysPct) * 100) / 100 },
        });
      }
    }
    scheduleNext();
  });
}

async function main() {
  const host = 'localhost';
  const port = 3000;
  const runLabel = process.argv[2] || 'investigation';

  console.log('=== Phase 10.10 — Supabase Concurrency Investigation ===');
  console.log(`Node: ${process.version} | CPUs: ${os.cpus().length} | Platform: ${process.platform}`);
  console.log(`Duration: ${DURATION_SEC}s per level | Concurrency: ${CONCURRENCY_LEVELS.join(', ')}`);
  console.log(`Court ID for single-court test: ${FIRST_COURT_ID}`);
  console.log('');

  const allResults = {
    metadata: {
      node: process.version, platform: process.platform, cpus: os.cpus().length,
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024), durationSec: DURATION_SEC,
      concurrencyLevels: CONCURRENCY_LEVELS, date: new Date().toISOString().split('T')[0],
      label: runLabel, firstCourtId: FIRST_COURT_ID,
    },
  };

  for (const target of TARGETS) {
    console.log(`\n=== ${target.name} ===`);
    allResults[target.name] = { type: target.type, results: [] };

    for (const c of CONCURRENCY_LEVELS) {
      process.stdout.write(`  ${String(c).padStart(5)}c ... `);
      const r = await benchTarget(host, port, target, c, DURATION_SEC);
      allResults[target.name].results.push(r);

      const errStr = r.errors > 0 || r.timeouts > 0 ? ` | err=${r.errors} to=${r.timeouts}` : '';
      console.log(
        `${String(Math.round(r.rps)).padStart(6)} RPS | avg ${String(Math.round(r.avg)).padStart(5)}ms | p50 ${String(Math.round(r.p50)).padStart(5)}ms | p95 ${String(Math.round(r.p95)).padStart(5)}ms | p99 ${String(Math.round(r.p99)).padStart(5)}ms | cpu ${r.cpu.totalPct.toFixed(1)}% | sock ${Math.round(r.connections.avgSockets)}/${r.connections.maxSockets}${errStr}`
      );

      if (c < CONCURRENCY_LEVELS[CONCURRENCY_LEVELS.length - 1]) await sleep(COOLDOWN_MS);
    }
  }

  const outPath = new URL(`./results/phase10_10_${runLabel}.json`, import.meta.url);
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to results/phase10_10_${runLabel}.json`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
