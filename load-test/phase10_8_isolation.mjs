import http from 'http';

// Direct measurement of per-component latency for a single request
function timedRequest(host, port, path) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const req = http.request(
      { hostname: host, port, path, method: 'GET', headers: { 'User-Agent': 'phase108-isolation' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const totalNs = Number(process.hrtime.bigint() - start);
          resolve({
            path,
            status: res.statusCode,
            totalMs: totalNs / 1e6,
            sizeBytes: Buffer.byteLength(data),
            headers: Object.fromEntries(Object.entries(res.headers).filter(([k]) => k.startsWith('x-') || k === 'content-type' || k === 'set-cookie')),
          });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function measureEndpoint(host, port, target, runs = 20) {
  // Warmup
  for (let i = 0; i < 10; i++) await timedRequest(host, port, target.path).catch(() => {});
  
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(await timedRequest(host, port, target.path));
  }
  
  const latencies = results.map(r => r.totalMs).sort((a, b) => a - b);
  const sizes = results.map(r => r.sizeBytes);
  const statuses = results.map(r => r.status);
  
  return {
    path: target.path,
    type: target.type,
    runs,
    avgMs: (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1),
    minMs: latencies[0].toFixed(1),
    maxMs: latencies[latencies.length - 1].toFixed(1),
    p50Ms: latencies[Math.floor(latencies.length * 0.5)].toFixed(1),
    p95Ms: latencies[Math.floor(latencies.length * 0.95)].toFixed(1),
    avgSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
    statuses: [...new Set(statuses)].join(','),
    setCookieCount: results.reduce((sum, r) => sum + (r.headers['set-cookie']?.length || 0), 0),
  };
}

async function main() {
  const host = 'localhost';
  const port = 3000;

  const targets = [
    { path: '/', type: 'static-prerendered' },
    { path: '/about', type: 'server-component-static' },
    { path: '/courts', type: 'client-component-prerendered' },
    { path: '/bookings', type: 'auth-prerendered' },
    { path: '/admin', type: 'admin-prerendered' },
    { path: '/api/courts', type: 'dynamic-api-no-auth' },
    { path: '/api/courts/1', type: 'dynamic-api-param' },
    { path: '/api/bookings', type: 'dynamic-api-auth-required' },
  ];

  console.log('=== Phase 10.8 — Request Path Isolation ===');
  console.log('Single-request latency measurement (20 runs each)\n');

  const results = [];
  for (const t of targets) {
    const r = await measureEndpoint(host, port, t, 20);
    results.push(r);
    console.log(`${r.type.padEnd(35)} ${r.path.padEnd(20)} avg=${r.avgMs}ms p50=${r.p50Ms}ms p95=${r.p95Ms}ms size=${r.avgSize}B status=${r.statuses} cookies=${r.setCookieCount}`);
  }

  // Save
  const fs = await import('fs');
  fs.writeFileSync(
    new URL('./results/phase10_8_path_isolation.json', import.meta.url),
    JSON.stringify(results, null, 2)
  );
  console.log('\nSaved to results/phase10_8_path_isolation.json');
}

main().catch(console.error);
