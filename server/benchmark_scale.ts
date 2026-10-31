import prisma from './src/lib/prisma';

const BASE_URL = 'http://localhost:4000/api';

async function measureNetworkPing(): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    await fetch('http://localhost:4000/health');
    times.push(performance.now() - t0);
  }
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

async function timeEndpoint(
  name: string,
  endpoint: string,
  token: string,
  method = 'GET',
  body?: any,
) {
  const headers: any = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';

  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const totalMs = Math.round(performance.now() - t0);

  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    name,
    endpoint,
    status: res.status,
    totalMs,
    data,
  };
}

async function runBenchmark() {
  console.log('========================================================================');
  console.log('  SCALE BENCHMARK: 10,000 SUBSCRIPTIONS & 1,000-DUE BILLING RUN         ');
  console.log('========================================================================\n');

  // Verify total count in database
  const subCount = await prisma.subscription.count();
  const activeCount = await prisma.subscription.count({ where: { status: 'ACTIVE', isSynthetic: false } });
  console.log(`Database State: ${subCount} Total Subscriptions (${activeCount} ACTIVE)\n`);

  // 1. Authenticate as Admin
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@brightloop.dev', password: 'Brightloop@123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  // Measure baseline network ping to local server
  const baselinePing = await measureNetworkPing();

  console.log('--- 1. LIST, FILTER & DASHBOARD ENDPOINTS (Target: < 2,000ms) ---');
  const results = [];

  // Dashboard KPI Summary
  results.push(await timeEndpoint('Dashboard Summary', '/reports/summary', token));

  // Overdue List
  results.push(await timeEndpoint('Overdue Invoices List', '/reports/overdue', token));

  // Aging Report
  results.push(await timeEndpoint('Aging Report', '/reports/aging', token));

  // CSV Export
  results.push(await timeEndpoint('CSV Export', '/reports/csv', token));

  // Subscriptions List (Page 1, 50 records)
  results.push(await timeEndpoint('List Subscriptions (Page 1)', '/subscriptions?page=1&limit=50', token));

  // Subscriptions Filter by Status (ACTIVE)
  results.push(await timeEndpoint('Filter Subscriptions (Status=ACTIVE)', '/subscriptions?status=ACTIVE&page=1&limit=50', token));

  // Subscriptions Filter by Customer
  const custRes = await fetch(`${BASE_URL}/auth/customers?page=1&limit=1`, { headers: { Authorization: `Bearer ${token}` } });
  const custData = await custRes.json();
  const sampleCustId = custData.data[0]?.id || 1;
  results.push(await timeEndpoint(`Filter Subscriptions (CustomerId=${sampleCustId})`, `/subscriptions?customerId=${sampleCustId}&page=1&limit=50`, token));

  // Catalog Products
  results.push(await timeEndpoint('List Products', '/catalog/products?page=1&limit=50', token));

  // Catalog Plans
  results.push(await timeEndpoint('List Plans', '/catalog/plans?page=1&limit=50', token));

  // Payments List
  results.push(await timeEndpoint('List Payments', '/payments?page=1&limit=50', token));

  // Audit Logs
  results.push(await timeEndpoint('List Audit Logs', '/reports/audit?page=1&limit=50', token));

  console.log('\n| Endpoint | Status | Total Latency | Estimated DB/Server | Network Loop | Status (<2s) |');
  console.log('|---|---|---|---|---|---|');
  for (const r of results) {
    const estServer = Math.max(1, r.totalMs - baselinePing);
    const pass = r.totalMs < 2000 ? 'PASS (<2s)' : 'SLOW (>2s)';
    console.log(`| ${r.name} | ${r.status} | ${r.totalMs} ms | ${estServer} ms | ${baselinePing} ms | ${pass} |`);
  }

  // -------------------------------------------------------------------------
  // 2. TIMING A 1,000-DUE BILLING RUN
  // -------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('--- 2. TIMING EXACT 1,000-DUE BILLING RUN (Target: < 60s) ---');
  console.log('------------------------------------------------------------------------');

  // Prepare exactly 1,000 subscriptions due for 2027-06-01
  console.log('Setting exactly 1,000 subscriptions due as of 2027-06-01...');
  await prisma.$executeRawUnsafe(`
    UPDATE "Subscription"
    SET "nextBillingDate" = '2027-06-01'::date
    WHERE id IN (
      SELECT id FROM "Subscription"
      WHERE status = 'ACTIVE' AND "isSynthetic" = false
      ORDER BY id ASC
      LIMIT 1000
    );
  `);

  const t0 = performance.now();

  const billRes = await fetch(`${BASE_URL}/billing/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ asOf: '2027-06-01' }),
  });

  const totalBillMs = Math.round(performance.now() - t0);
  const billSummary = await billRes.json();

  console.log(`HTTP Status: ${billRes.status}`);
  console.log(`Billing Run Output: Created=${billSummary.created}, Skipped=${billSummary.skipped}, Failed=${billSummary.failed}`);
  console.log(`Total Billing Run Duration: ${totalBillMs} ms (${(totalBillMs / 1000).toFixed(2)} seconds)`);

  const lastRun = await prisma.billingRun.findFirst({
    orderBy: { id: 'desc' },
  });

  if (lastRun && lastRun.finishedAt) {
    const serverDurationMs = lastRun.finishedAt.getTime() - lastRun.startedAt.getTime();
    const networkOverheadMs = Math.max(0, totalBillMs - serverDurationMs);
    console.log(`Latency Breakdown:`);
    console.log(`  - Neon DB & Server Transaction Processing: ${serverDurationMs} ms (${(serverDurationMs / 1000).toFixed(2)}s)`);
    console.log(`  - HTTP & Network Roundtrip Overhead: ${networkOverheadMs} ms`);
  }

  const pass60s = totalBillMs < 60000 ? 'PASS (< 60s)' : 'SLOW (> 60s)';
  console.log(`Verification Verdict: ${pass60s}`);

  console.log('\n========================================================================');
  console.log('  SCALE BENCHMARK COMPLETE                                              ');
  console.log('========================================================================');
}

runBenchmark()
  .catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
