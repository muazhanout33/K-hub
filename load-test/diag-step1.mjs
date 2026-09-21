#!/usr/bin/env node
/**
 * PHASE 10.6 — DIAGNOSTIC LOAD TEST (fixed)
 * Runs autocannon at multiple concurrency levels with detailed metrics.
 * Monitors Node.js process during load (Windows-compatible).
 */
import autocannon from 'autocannon';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:3000';
const RESULTS_DIR = join(__dirname, 'results');
const CONCURRENCY_LEVELS = [50, 100, 250, 500, 1000];
const DURATION = 12;
const WARMUP_DURATION = 3;

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

function runAutocannon(url, opts = {}) {
  return new Promise((resolve, reject) => {
    autocannon({
      url,
      duration: DURATION,
      protocol: 'http',
      timeout: 15,
      pipelining: 1,
      ...opts,
    }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function getNodeProcesses() {
  try {
    const raw = execSync('tasklist /fi "imagename eq node.exe" /fo csv /nh', { encoding: 'utf8', timeout: 5000 });
    const lines = raw.trim().split('\n').filter(l => l.includes('node.exe'));
    let totalMem = 0;
    let count = 0;
    for (const line of lines) {
      const parts = line.split(',').map(s => s.replace(/"/g, '').trim());
      const memStr = parts[4];
      if (memStr) {
        const memKB = parseInt(memStr.replace(/[,K]/g, ''), 10);
        if (!isNaN(memKB)) totalMem += memKB;
        count++;
      }
    }
    return { count, totalMemKB: totalMem, totalMemMB: Math.round(totalMem / 1024) };
  } catch { return { count: 0, totalMemKB: 0, totalMemMB: 0 }; }
}

function fmtResult(r) {
  const lat = r.latency || {};
  return {
    totalRequests: r.requests?.total || 0,
    rps: r.requests?.average || 0,
    rpsMax: r.requests?.max || 0,
    rpsSent: r.requests?.sent || 0,
    latencyAvg: lat.average || 0,
    latencyMin: lat.min || 0,
    latencyP50: lat.p50 || 0,
    latencyP75: lat.p75 || 0,
    latencyP90: lat.p90 || 0,
    latencyP99: lat.p99 || 0,
    latencyMax: lat.max || 0,
    errors: r.errors || 0,
    timeouts: r.timeouts || 0,
    non2xx: r.non2xx || 0,
    totalDuration: r.duration || 0,
    throughputBps: r.throughput?.average || 0,
    resets: r.resets || 0,
  };
}

async function main() {
  const allResults = [];
  const processSnapshots = {};

  console.log('PHASE 10.6 — DIAGNOSTIC LOAD TEST');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Concurrency levels: ${CONCURRENCY_LEVELS.join(', ')}`);
  console.log(`Duration: ${DURATION}s per level + ${WARMUP_DURATION}s warmup\n`);

  // Warmup
  console.log('--- WARMUP ---');
  await runAutocannon(`${BASE_URL}/`, { connections: 10, duration: WARMUP_DURATION });
  console.log('Warmup complete.\n');

  for (const c of CONCURRENCY_LEVELS) {
    console.log(`=== CONCURRENCY: ${c} ===`);

    const before = getNodeProcesses();
    console.log(`  Processes before: ${before.count} node.exe, ${before.totalMemMB}MB total`);

    let result;
    try {
      result = await runAutocannon(`${BASE_URL}/`, { connections: c, duration: DURATION });
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      allResults.push({ concurrency: c, error: e.message });
      continue;
    }

    const after = getNodeProcesses();
    console.log(`  Processes after: ${after.count} node.exe, ${after.totalMemMB}MB total`);

    const fmt = fmtResult(result);

    console.log(`  Requests: ${fmt.totalRequests} (sent: ${fmt.rpsSent})`);
    console.log(`  RPS: ${fmt.rps.toFixed(0)} (max: ${fmt.rpsMax})`);
    console.log(`  Latency: avg=${fmt.latencyAvg}ms p50=${fmt.latencyP50}ms p90=${fmt.latencyP90}ms p99=${fmt.latencyP99}ms max=${fmt.latencyMax}ms`);
    console.log(`  Errors: ${fmt.errors} timeouts: ${fmt.timeouts} non2xx: ${fmt.non2xx} resets: ${fmt.resets}`);
    console.log(`  Throughput: ${(fmt.throughputBps / 1024 / 1024).toFixed(2)} MB/s`);
    console.log('');

    processSnapshots[c] = { before, after };

    allResults.push({
      concurrency: c,
      ...fmt,
      process: processSnapshots[c],
    });
  }

  writeFileSync(join(RESULTS_DIR, 'phase10_6_step1_baseline.json'), JSON.stringify(allResults, null, 2));

  // Summary table
  console.log('\n=== BASELINE SUMMARY ===');
  console.log('Conn | RPS    | Avg    | P50    | P90    | P99    | Max    | Err  | TO   | Non2xx | Resets | MemMB');
  console.log('-----|--------|--------|--------|--------|--------|--------|------|------|--------|--------|------');
  for (const r of allResults) {
    if (r.error) { console.log(`${String(r.concurrency).padStart(4)} | ERROR: ${r.error}`); continue; }
    const p = r.process?.after || {};
    console.log(
      `${String(r.concurrency).padStart(4)} | ${String(r.rps.toFixed(0)).padStart(6)} | ${String(r.latencyAvg.toFixed(0)).padStart(6)} | ${String(r.latencyP50.toFixed(0)).padStart(6)} | ${String(r.latencyP90.toFixed(0)).padStart(6)} | ${String(r.latencyP99.toFixed(0)).padStart(6)} | ${String(r.latencyMax.toFixed(0)).padStart(6)} | ${String(r.errors).padStart(4)} | ${String(r.timeouts).padStart(4)} | ${String(r.non2xx).padStart(6)} | ${String(r.resets).padStart(6)} | ${String(p.totalMemMB ?? '?').padStart(5)}`
    );
  }

  console.log('\nStep 1 complete. Results saved.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
