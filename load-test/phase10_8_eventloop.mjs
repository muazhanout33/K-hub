import http from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import os from 'node:os';

const TARGET = 'http://localhost:3000';
const CONCURRENCY = 500;
const IDLE_BASELINE_DURATION = 30_000;
const LOAD_DURATION = 12_000;
const RECOVERY_DURATION = 10_000;

function getMetrics() {
  const mu = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    rss: mu.rss,
    heapUsed: mu.heapUsed,
    heapTotal: mu.heapTotal,
    cpuUser: cpu.user,
    cpuSystem: cpu.system,
    activeHandles: process._getActiveHandles().length,
    activeRequests: process._getActiveRequests().length,
  };
}

async function getElu() {
  if (typeof process.EventLoopUtilization === 'function') {
    return process.EventLoopUtilization();
  }
  return null;
}

function startHistogramMonitor() {
  const hist = monitorEventLoopDelay({ resolution: 20 });
  hist.enable();
  return hist;
}

async function doRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${TARGET}${path}`, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, bytes: body.length }));
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function loadPhase(path, durationMs, label) {
  const lags = [];
  const samples = [];
  const histogram = startHistogramMonitor();

  const firstMetrics = getMetrics();
  const firstCpu = { u: firstMetrics.cpuUser, s: firstMetrics.cpuSystem };

  let inflight = 0;
  let completed = 0;
  let errors = 0;
  const startTime = Date.now();

  const sampler = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const metrics = getMetrics();
    samples.push({
      elapsed,
      rss: metrics.rss,
      heapUsed: metrics.heapUsed,
      activeHandles: metrics.activeHandles,
      activeRequests: metrics.activeRequests,
      inflight,
    });

    const lagStart = process.hrtime.bigint();
    setImmediate(() => {
      const lagNs = Number(process.hrtime.bigint() - lagStart);
      lags.push(lagNs / 1e6);
    });
  }, 100);

  const loadEnd = Date.now() + durationMs;
  const launcher = async () => {
    while (Date.now() < loadEnd) {
      if (inflight < CONCURRENCY) {
        inflight++;
        doRequest(path).then(() => {
          completed++;
        }).catch(() => {
          errors++;
        }).finally(() => {
          inflight--;
        });
      } else {
        await new Promise((r) => setTimeout(r, 5));
      }
    }
  };
  launcher();

  await new Promise((r) => setTimeout(r, durationMs));

  const drainStart = Date.now();
  while (inflight > 0 && Date.now() - drainStart < 5000) {
    await new Promise((r) => setTimeout(r, 100));
  }

  clearInterval(sampler);
  histogram.disable();

  const lastMetrics = getMetrics();
  const lastCpu = { u: lastMetrics.cpuUser, s: lastMetrics.cpuSystem };

  lags.sort((a, b) => a - b);
  const p95Idx = Math.floor(lags.length * 0.95);
  const p99Idx = Math.floor(lags.length * 0.99);
  const avgLag = lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : 0;
  const maxLag = lags.length ? lags[lags.length - 1] : 0;
  const p50Lag = lags.length ? lags[Math.floor(lags.length * 0.5)] : 0;
  const p95Lag = lags.length ? lags[p95Idx] : 0;
  const p99Lag = lags.length ? lags[p99Idx] : 0;

  const histMin = histogram.min / 1e6;
  const histMax = histogram.max / 1e6;
  const histMean = histogram.mean / 1e6;
  const histP50 = histogram.percentile(50) / 1e6;
  const histP95 = histogram.percentile(95) / 1e6;
  const histP99 = histogram.percentile(99) / 1e6;
  const histExceeds = histogram.exceeds;

  const avgRss = samples.length ? samples.reduce((a, s) => a + s.rss, 0) / samples.length : 0;
  const avgHeap = samples.length ? samples.reduce((a, s) => a + s.heapUsed, 0) / samples.length : 0;
  const avgHandles = samples.length ? samples.reduce((a, s) => a + s.activeHandles, 0) / samples.length : 0;
  const avgActiveReqs = samples.length ? samples.reduce((a, s) => a + s.activeRequests, 0) / samples.length : 0;

  return {
    label, path, durationMs, completed, errors,
    avgLag, maxLag, p50Lag, p95Lag, p99Lag,
    cpuUserDelta: lastCpu.u - firstCpu.u,
    cpuSystemDelta: lastCpu.s - firstCpu.s,
    avgRss, avgHeap, avgHandles, avgActiveReqs,
    histMin, histMax, histMean, histP50, histP95, histP99, histExceeds,
  };
}

async function idlePhase(durationMs, label) {
  const lags = [];
  const samples = [];
  const histogram = startHistogramMonitor();

  const firstMetrics = getMetrics();
  const firstCpu = { u: firstMetrics.cpuUser, s: firstMetrics.cpuSystem };
  const startTime = Date.now();

  const sampler = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const metrics = getMetrics();
    samples.push({
      elapsed, rss: metrics.rss, heapUsed: metrics.heapUsed,
      activeHandles: metrics.activeHandles, activeRequests: metrics.activeRequests,
    });

    const lagStart = process.hrtime.bigint();
    setImmediate(() => {
      const lagNs = Number(process.hrtime.bigint() - lagStart);
      lags.push(lagNs / 1e6);
    });
  }, 100);

  await new Promise((r) => setTimeout(r, durationMs));

  clearInterval(sampler);
  histogram.disable();

  const lastMetrics = getMetrics();
  const lastCpu = { u: lastMetrics.cpuUser, s: lastMetrics.cpuSystem };

  lags.sort((a, b) => a - b);
  const avgLag = lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : 0;
  const maxLag = lags.length ? lags[lags.length - 1] : 0;
  const p95Idx = Math.floor(lags.length * 0.95);
  const p99Idx = Math.floor(lags.length * 0.99);
  const p50Lag = lags.length ? lags[Math.floor(lags.length * 0.5)] : 0;
  const p95Lag = lags.length ? lags[p95Idx] : 0;
  const p99Lag = lags.length ? lags[p99Idx] : 0;

  const avgRss = samples.length ? samples.reduce((a, s) => a + s.rss, 0) / samples.length : 0;
  const avgHeap = samples.length ? samples.reduce((a, s) => a + s.heapUsed, 0) / samples.length : 0;
  const avgHandles = samples.length ? samples.reduce((a, s) => a + s.activeHandles, 0) / samples.length : 0;
  const avgActiveReqs = samples.length ? samples.reduce((a, s) => a + s.activeRequests, 0) / samples.length : 0;

  return {
    label, durationMs, completed: 0, errors: 0,
    avgLag, maxLag, p50Lag, p95Lag, p99Lag,
    cpuUserDelta: lastCpu.u - firstCpu.u,
    cpuSystemDelta: lastCpu.s - firstCpu.s,
    avgRss, avgHeap, avgHandles, avgActiveReqs,
    histMin: histogram.min / 1e6,
    histMax: histogram.max / 1e6,
    histMean: histogram.mean / 1e6,
    histP50: histogram.percentile(50) / 1e6,
    histP95: histogram.percentile(95) / 1e6,
    histP99: histogram.percentile(99) / 1e6,
    histExceeds: histogram.exceeds,
  };
}

function printResult(r) {
  const pad = (s, w = 18) => String(s).padStart(w);
  console.log(`` + '='.repeat(80));
  console.log(`  PHASE: ${r.label}`);
  console.log('='.repeat(80));
  if (r.path) console.log(`  Endpoint:          ${r.path}`);
  console.log(`  Duration:          ${r.durationMs}ms`);
  if (r.completed) console.log(`  Requests completed: ${r.completed}`);
  if (r.errors) console.log(`  Request errors:    ${r.errors}`);
  console.log(``);
  console.log(`  --- Event Loop Lag (setImmediate timing) ---`);
  console.log(`  Average lag:       ${pad(r.avgLag.toFixed(3))} ms`);
  console.log(`  Max lag:           ${pad(r.maxLag.toFixed(3))} ms`);
  console.log(`  P50 lag:           ${pad(r.p50Lag.toFixed(3))} ms`);
  console.log(`  P95 lag:           ${pad(r.p95Lag.toFixed(3))} ms`);
  console.log(`  P99 lag:           ${pad(r.p99Lag.toFixed(3))} ms`);
  console.log(``);
  console.log(`  --- Event Loop Delay Histogram (perf_hooks) ---`);
  console.log(`  Histogram min:     ${pad(r.histMin.toFixed(3))} ms`);
  console.log(`  Histogram mean:    ${pad(r.histMean.toFixed(3))} ms`);
  console.log(`  Histogram max:     ${pad(r.histMax.toFixed(3))} ms`);
  console.log(`  Histogram P50:     ${pad(r.histP50.toFixed(3))} ms`);
  console.log(`  Histogram P95:     ${pad(r.histP95.toFixed(3))} ms`);
  console.log(`  Histogram P99:     ${pad(r.histP99.toFixed(3))} ms`);
  console.log(`  Histogram exceeds: ${pad(r.histExceeds)} (>50ms)`);
  console.log(``);
  console.log(`  --- CPU ---`);
  console.log(`  CPU user delta:    ${pad(r.cpuUserDelta)} µs`);
  console.log(`  CPU system delta:  ${pad(r.cpuSystemDelta)} µs`);
  console.log(``);
  console.log(`  --- Memory ---`);
  console.log(`  RSS average:       ${pad((r.avgRss / 1024 / 1024).toFixed(2))} MB`);
  console.log(`  Heap used average: ${pad((r.avgHeap / 1024 / 1024).toFixed(2))} MB`);
  console.log(``);
  console.log(`  --- Node Handles ---`);
  console.log(`  Active handles avg:${pad(r.avgHandles.toFixed(1))}`);
  console.log(`  Active reqs avg:   ${pad(r.avgActiveReqs.toFixed(1))}`);
  console.log('='.repeat(80));
}

async function main() {
  console.log(`Event Loop Diagnostic - ${new Date().toISOString()}`);
  console.log(`Node.js ${process.version} | PID ${process.pid}`);
  console.log(`Target: ${TARGET} | Concurrency: ${CONCURRENCY}`);

  const r1 = await idlePhase(IDLE_BASELINE_DURATION, 'IDLE BASELINE (30s)');
  printResult(r1);

  const r2 = await loadPhase('/', LOAD_DURATION, 'LOAD: GET / (500 concurrent, 12s)');
  printResult(r2);

  const r3 = await loadPhase('/api/courts', LOAD_DURATION, 'LOAD: GET /api/courts (500 concurrent, 12s)');
  printResult(r3);

  const r4 = await idlePhase(RECOVERY_DURATION, 'RECOVERY IDLE (10s)');
  printResult(r4);

  console.log(`` + '='.repeat(80));
  console.log(`  COMPARISON SUMMARY`);
  console.log('='.repeat(80));
  const row = (label, fn) =>
    [label, fn(r1), fn(r2), fn(r3), fn(r4)].map((s) => String(s).padStart(18)).join(' ');
  console.log(row('Avg lag (ms)', (r) => r.avgLag.toFixed(3)));
  console.log(row('Max lag (ms)', (r) => r.maxLag.toFixed(3)));
  console.log(row('P95 lag (ms)', (r) => r.p95Lag.toFixed(3)));
  console.log(row('P99 lag (ms)', (r) => r.p99Lag.toFixed(3)));
  console.log(row('Hist P95 (ms)', (r) => r.histP95.toFixed(3)));
  console.log(row('Hist P99 (ms)', (r) => r.histP99.toFixed(3)));
  console.log(row('CPU user us', (r) => r.cpuUserDelta));
  console.log(row('CPU sys us', (r) => r.cpuSystemDelta));
  console.log(row('RSS avg (MB)', (r) => (r.avgRss / 1024 / 1024).toFixed(2)));
  console.log(row('Heap avg (MB)', (r) => (r.avgHeap / 1024 / 1024).toFixed(2)));
  console.log(row('Handles avg', (r) => r.avgHandles.toFixed(1)));
  console.log(row('Reqs avg', (r) => r.avgActiveReqs.toFixed(1)));
  console.log('='.repeat(80));
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
