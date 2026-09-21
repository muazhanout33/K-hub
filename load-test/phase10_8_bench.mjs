import http from 'http';
import fs from 'fs';
import os from 'os';

const CONCURRENCY_LEVELS = [10, 50, 100, 250, 500, 1000, 2000];
const DURATION_SEC = 12;
const WARMUP_REQUESTS = 30;
const COOLDOWN_MS = 3000;

const TARGETS = [
  { name: 'GET /', path: '/', type: 'static-prerendered' },
  { name: 'GET /bookings', path: '/bookings', type: 'auth-prerendered' },
  { name: 'GET /api/courts', path: '/api/courts', type: 'dynamic-api' },
  { name: 'GET /api/courts/[id]', path: '/api/courts/1', type: 'dynamic-api-param' },
];

function makeRequest(host, port, path) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const req = http.request(
      { hostname: host, port, path, method: 'GET', headers: { 'User-Agent': 'phase108-bench' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const ns = Number(process.hrtime.bigint() - start);
          resolve({ status: res.statusCode, latencyNs: ns, size: Buffer.byteLength(data) });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function collectRuntimeMetrics() {
  const mem = process.memoryUsage();
  return {
    timestamp: Date.now(),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers || 0,
    cpuUser: process.cpuUsage().user,
    cpuSystem: process.cpuUsage().system,
  };
}

function getEventLoopLag() {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lagNs = Number(process.hrtime.bigint() - start);
      resolve(lagNs / 1e6); // ms
    });
  });
}

async function measureEventLoopMetrics(durationMs) {
  const samples = [];
  const interval = 100; // sample every 100ms
  const endTime = Date.now() + durationMs;
  
  while (Date.now() < endTime) {
    const lag = await getEventLoopLag();
    const runtime = collectRuntimeMetrics();
    samples.push({ lagMs: lag, ...runtime });
    await new Promise(r => setTimeout(r, interval));
  }
  
  return samples;
}

async function benchTarget(host, port, target, concurrency, durationSec) {
  // Warmup
  for (let i = 0; i < WARMUP_REQUESTS; i++) {
    await makeRequest(host, port, target.path).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 500));

  const results = [];
  const stopTime = Date.now() + durationSec * 1000;
  let active = 0;
  let totalReqs = 0;
  let errors = 0;
  let timeouts = 0;

  // Start event loop monitoring in parallel
  const loopMetricsPromise = measureEventLoopMetrics(durationSec * 1000);

  return new Promise((resolve) => {
    function scheduleNext() {
      while (active < concurrency && Date.now() < stopTime) {
        active++;
        makeRequest(host, port, target.path)
          .then((r) => {
            results.push(r);
            totalReqs++;
            if (r.status >= 400) errors++;
          })
          .catch((e) => {
            totalReqs++;
            if (e.message === 'timeout') timeouts++;
            else errors++;
          })
          .finally(() => {
            active--;
            scheduleNext();
          });
      }
      if (active === 0 || Date.now() >= stopTime) {
        loopMetricsPromise.then((loopSamples) => {
          const latencies = results.map((r) => r.latencyNs / 1e6).sort((a, b) => a - b);
          const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
          const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
          const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
          const avg = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
          const rps = totalReqs / durationSec;

          // Aggregate loop metrics
          const avgLag = loopSamples.reduce((s, x) => s + x.lagMs, 0) / (loopSamples.length || 1);
          const maxLag = Math.max(...loopSamples.map((x) => x.lagMs));
          const p95Lag = loopSamples.map((x) => x.lagMs).sort((a, b) => a - b)[Math.floor(loopSamples.length * 0.95)] || 0;
          const avgRss = loopSamples.reduce((s, x) => s + x.rss, 0) / (loopSamples.length || 1);
          const avgHeapUsed = loopSamples.reduce((s, x) => s + x.heapUsed, 0) / (loopSamples.length || 1);
          const maxHeapUsed = Math.max(...loopSamples.map((x) => x.heapUsed));
          const cpuUser = loopSamples[loopSamples.length - 1]?.cpuUser || 0;
          const cpuSystem = loopSamples[loopSamples.length - 1]?.cpuSystem || 0;

          resolve({
            concurrency,
            totalReqs,
            errors,
            timeouts,
            rps,
            avg,
            p50,
            p95,
            p99,
            loop: {
              avgLagMs: avgLag,
              maxLagMs: maxLag,
              p95LagMs: p95Lag,
              avgRssBytes: avgRss,
              avgHeapUsedBytes: avgHeapUsed,
              maxHeapUsedBytes: maxHeapUsed,
              cpuUserUs: cpuUser,
              cpuSystemUs: cpuSystem,
            },
          });
        });
      }
    }
    scheduleNext();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const host = 'localhost';
  const port = 3000;

  console.log('=== Phase 10.8 — Full Baseline Benchmark ===');
  console.log(`Node: ${process.version} | CPUs: ${os.cpus().length} | Platform: ${process.platform}`);
  console.log(`Duration: ${DURATION_SEC}s per level | Concurrency: ${CONCURRENCY_LEVELS.join(', ')}`);
  console.log('');

  const allResults = {};

  for (const target of TARGETS) {
    console.log(`\n=== ${target.name} (${target.type}) ===`);
    allResults[target.name] = { type: target.type, results: [] };

    for (const c of CONCURRENCY_LEVELS) {
      process.stdout.write(`  ${String(c).padStart(5)}c ... `);
      const r = await benchTarget(host, port, target, c, DURATION_SEC);
      allResults[target.name].results.push(r);

      const errStr = r.errors > 0 || r.timeouts > 0 ? ` | err=${r.errors} to=${r.timeouts}` : '';
      console.log(
        `${String(Math.round(r.rps)).padStart(6)} RPS | avg ${String(Math.round(r.avg)).padStart(5)}ms | p50 ${String(Math.round(r.p50)).padStart(5)}ms | p95 ${String(Math.round(r.p95)).padStart(5)}ms | p99 ${String(Math.round(r.p99)).padStart(5)}ms${errStr}`
      );

      // Cooldown between levels
      if (c < CONCURRENCY_LEVELS[CONCURRENCY_LEVELS.length - 1]) {
        await sleep(COOLDOWN_MS);
      }
    }
  }

  // Save results
  const outPath = new URL('./results/phase10_8_baseline.json', import.meta.url);
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to results/phase10_8_baseline.json`);

  // Summary table
  console.log('\n=== SUMMARY TABLE ===');
  console.log('Endpoint'.padEnd(30) + 'Concurrency'.padEnd(12) + 'RPS'.padEnd(8) + 'Avg'.padEnd(8) + 'P50'.padEnd(8) + 'P95'.padEnd(8) + 'P99'.padEnd(8) + 'Errors'.padEnd(8) + 'EL-MaxLag');
  console.log('-'.repeat(120));
  for (const [name, data] of Object.entries(allResults)) {
    for (const r of data.results) {
      console.log(
        name.padEnd(30) +
        String(r.concurrency).padEnd(12) +
        String(Math.round(r.rps)).padEnd(8) +
        String(Math.round(r.avg) + 'ms').padEnd(8) +
        String(Math.round(r.p50) + 'ms').padEnd(8) +
        String(Math.round(r.p95) + 'ms').padEnd(8) +
        String(Math.round(r.p99) + 'ms').padEnd(8) +
        String(r.errors + r.timeouts).padEnd(8) +
        String(Math.round(r.loop.maxLagMs) + 'ms')
      );
    }
  }
}

main().catch(console.error);
