const BASE_URL = 'http://localhost:4000/api';

async function timeEndpoint(name: string, endpoint: string, token: string, method = 'GET', body?: any) {
  const start = Date.now();
  const headers: any = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const elapsed = Date.now() - start;
  const data = await res.json().catch(() => null);
  console.log(`[${name}] ${method} ${endpoint} -> ${res.status} | Latency: ${elapsed}ms (Target: < 2,000ms)`);
  return { status: res.status, elapsed, data };
}

async function benchmark() {
  console.log('=== BENCHMARKING LIST & DASHBOARD ENDPOINTS ===\n');

  // Login
  const loginStart = Date.now();
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@brightloop.dev', password: 'Brightloop@123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log(`[Login] Latency: ${Date.now() - loginStart}ms`);

  await timeEndpoint('Dashboard KPI Summary', '/reports/summary', token);
  await timeEndpoint('List Products', '/catalog/products?page=1&limit=50', token);
  await timeEndpoint('List Plans', '/catalog/plans?page=1&limit=50', token);
  await timeEndpoint('List Subscriptions', '/subscriptions?page=1&limit=50', token);
  await timeEndpoint('List Customers', '/auth/customers?page=1&limit=50', token);
  await timeEndpoint('List Payments', '/payments?page=1&limit=50', token);
  await timeEndpoint('Audit Log List', '/reports/audit?page=1&limit=50', token);

  console.log('\n=== TIMING BILLING RUN (Target: < 60s) ===');
  const billStart = Date.now();
  const bRes = await fetch(`${BASE_URL}/billing/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ asOf: '2026-11-01' }),
  });
  const billElapsed = Date.now() - billStart;
  const bData = await bRes.json();
  console.log(`[Billing Run] Latency: ${billElapsed}ms (${(billElapsed / 1000).toFixed(2)}s) | Created: ${bData.created}, Skipped: ${bData.skipped}`);
}

benchmark().catch(err => {
  console.error(err);
  process.exit(1);
});

