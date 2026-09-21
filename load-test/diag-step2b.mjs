#!/usr/bin/env node
/**
 * Phase 10.6 — Step 2b: Middleware-Only Latency Test
 * 
 * Tests a lightweight endpoint to isolate middleware overhead.
 * Also tests a non-middleware path (static file) for comparison.
 */

import autocannon from 'autocannon';

const TARGETS = [
  { name: 'home (middleware+SSR)', url: 'http://localhost:3000/' },
  { name: 'static CSS (no middleware)', url: 'http://localhost:3000/_next/static/css/app.css' },
  { name: 'favicon (no middleware)', url: 'http://localhost:3000/favicon.ico' },
];

const CONCURRENCY = 100;
const DURATION = 10;

async function runTest(name, url, connections, duration) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url,
      connections,
      duration,
      timeout: 30,
      pipelining: 1,
      headers: { 'Accept': 'text/html' },
    }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function printResult(name, r) {
  const errors = (r.errors || 0) + (r.timeouts || 0) + (r.non2xx || 0) + (r.resets || 0);
  console.log(`${name.padEnd(40)} | RPS: ${String(r.requests.average).padStart(6)} | Avg: ${String(Math.round(r.latency.average)).padStart(6)}ms | P99: ${String(Math.round(r.latency.p99)).padStart(6)}ms | Errors: ${String(errors).padStart(5)}`);
}

async function main() {
  console.log('PHASE 10.6 — STEP 2b: MIDDLEWARE ISOLATION TEST');
  console.log(`Connections: ${CONCURRENCY}, Duration: ${DURATION}s`);
  console.log('');

  // Warmup
  console.log('Warming up...');
  await runTest('warmup', 'http://localhost:3000/', 10, 3);
  console.log('Warmup complete.\n');

  const results = [];

  for (const target of TARGETS) {
    console.log(`Testing: ${target.name}...`);
    try {
      const r = await runTest(target.name, target.url, CONCURRENCY, DURATION);
      printResult(target.name, r);
      results.push({ name: target.name, r });
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Compare
  if (results.length >= 2) {
    console.log('\n--- MIDDLEWARE OVERHEAD ANALYSIS ---');
    const home = results.find(r => r.name.includes('home'));
    const staticR = results.find(r => r.name.includes('static'));
    if (home && staticR) {
      const overhead = Math.round(home.r.latency.average - staticR.r.latency.average);
      console.log(`Home avg latency: ${Math.round(home.r.latency.average)}ms`);
      console.log(`Static avg latency: ${Math.round(staticR.r.latency.average)}ms`);
      console.log(`Middleware overhead: ~${overhead}ms per request`);
      console.log(`At 500 concurrent: ~${Math.round(overhead * 500 / 1000)}s total queued`);
    }
  }

  console.log('\nStep 2b complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
