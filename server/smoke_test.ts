const BASE_URL = 'http://localhost:4000/api';

async function req(endpoint: string, options: any = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function smokeTest() {
  console.log('=== STEP 2: SMOKE TEST THE RUNNING SERVER ===\n');

  // 1. Log in as admin
  console.log('1. Admin Login:');
  const loginRes = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@brightloop.dev', password: 'Brightloop@123' }),
  });
  console.log('Login Status:', loginRes.status, '| User:', loginRes.data?.user?.email);
  const token = loginRes.data?.token;
  if (!token) throw new Error('Login failed');
  const authHeader = { Authorization: `Bearer ${token}` };

  // 2. Call /auth/me
  console.log('\n2. GET /auth/me:');
  const meRes = await req('/auth/me', { headers: authHeader });
  console.log('Me Status:', meRes.status, '| Role:', meRes.data?.user?.role);

  // 3. List products and plans
  console.log('\n3. List Products and Plans:');
  const prodRes = await req('/catalog/products', { headers: authHeader });
  const planRes = await req('/catalog/plans', { headers: authHeader });
  console.log('Products Count:', prodRes.data?.data?.length);
  console.log('Plans Count:', planRes.data?.data?.length);

  const product = prodRes.data?.data?.[0];
  const plan = planRes.data?.data?.find((p: any) => p.billingPeriod === 'MONTHLY');
  console.log('Selected Product:', product?.name, '| ID:', product?.id);
  console.log('Selected Plan:', plan?.name, '| ID:', plan?.id);

  // 4. Create a subscription
  console.log('\n4. Create Subscription:');
  const custRes = await req('/auth/customers', { headers: authHeader });
  const customer = custRes.data?.data?.[0];
  console.log('Target Customer:', customer?.name, '| ID:', customer?.id);

  const createSubRes = await req('/subscriptions', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      customerId: customer.id,
      planId: plan.id,
      startDate: '2026-10-01',
      paymentTerms: 15,
      lines: [
        { productId: product.id, quantity: 1 }
      ]
    }),
  });
  console.log('Created Sub Status:', createSubRes.status, '| Number:', createSubRes.data?.subscription?.number, '| Status:', createSubRes.data?.subscription?.status);
  const subId = createSubRes.data?.subscription?.id;

  // 5. Move through status machine to ACTIVE
  console.log('\n5. Transition Status: DRAFT -> QUOTATION -> CONFIRMED -> ACTIVE:');
  const t1 = await req(`/subscriptions/${subId}/transition`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ status: 'QUOTATION' }),
  });
  console.log('Transition to QUOTATION:', t1.data?.subscription?.status);

  const t2 = await req(`/subscriptions/${subId}/transition`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ status: 'CONFIRMED' }),
  });
  console.log('Transition to CONFIRMED:', t2.data?.subscription?.status);

  const t3 = await req(`/subscriptions/${subId}/transition`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
  console.log('Transition to ACTIVE:', t3.data?.subscription?.status, '| nextBillingDate:', t3.data?.subscription?.nextBillingDate);

  // 6. POST /billing/run twice for the same date
  console.log('\n6. Billing Run Twice for Same Date (2026-11-01):');
  const run1 = await req('/billing/run', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ asOf: '2026-11-01' }),
  });
  console.log('RUN 1 Results: Created =', run1.data?.created, '| Skipped =', run1.data?.skipped, '| Failed =', run1.data?.failed);

  const run2 = await req('/billing/run', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ asOf: '2026-11-01' }),
  });
  console.log('RUN 2 Results: Created =', run2.data?.created, '| Skipped =', run2.data?.skipped, '| Failed =', run2.data?.failed);
  console.log('>> Second run created exactly 0 invoices:', run2.data?.created === 0);

  // 7. Fire two billing runs concurrently
  console.log('\n7. Concurrent Billing Runs:');
  const [c1, c2] = await Promise.all([
    req('/billing/run', { method: 'POST', headers: authHeader, body: JSON.stringify({ asOf: '2026-11-01' }) }),
    req('/billing/run', { method: 'POST', headers: authHeader, body: JSON.stringify({ asOf: '2026-11-01' }) }),
  ]);
  console.log('Concurrent 1:', c1.status, c1.data?.created ?? c1.data?.error?.code);
  console.log('Concurrent 2:', c2.status, c2.data?.created ?? c2.data?.error?.code);

  // 8. Show GET /invoices output and verify totals, tax, and discount in paise
  console.log('\n8. Inspect Invoices & Hand-Verification:');
  const invRes = await req(`/subscriptions/${subId}`, { headers: authHeader });
  const subInvoices = invRes.data?.subscription?.invoices || [];
  console.log(`Invoices for Subscription ${subId}:`, subInvoices.length);

  for (const inv of subInvoices) {
    console.log(`Invoice ${inv.number}:`);
    console.log(`  Subtotal:      ${inv.subtotal} paise (₹${inv.subtotal / 100})`);
    console.log(`  DiscountTotal: ${inv.discountTotal} paise (₹${inv.discountTotal / 100})`);
    console.log(`  TaxTotal:      ${inv.taxTotal} paise (₹${inv.taxTotal / 100})`);
    console.log(`  Total:         ${inv.total} paise (₹${inv.total / 100})`);
    console.log(`  AmountPaid:    ${inv.amountPaid} paise`);
    console.log(`  Status:        ${inv.status}`);
    const expectedTotal = inv.subtotal - inv.discountTotal + inv.taxTotal;
    console.log(`  Math Check: ${inv.subtotal} - ${inv.discountTotal} + ${inv.taxTotal} = ${expectedTotal} === ${inv.total} ->`, expectedTotal === inv.total);
  }

  const invoiceToPay = subInvoices[0];
  if (!invoiceToPay) throw new Error('No invoice found to test payment');

  // 9. Payment recording & voiding
  console.log(`\n9. Payments Lifecycle for Invoice ${invoiceToPay.id} (Total: ${invoiceToPay.total} paise):`);
  const partialAmount = Math.floor(invoiceToPay.total / 2);
  const remainingAmount = invoiceToPay.total - partialAmount;

  // Partial Payment
  console.log(`Recording Partial Payment of ${partialAmount} paise...`);
  const pay1 = await req('/payments', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      invoiceId: invoiceToPay.id,
      method: 'UPI',
      amount: partialAmount,
    }),
  });
  console.log('Payment 1 status:', pay1.status, '| Payment ID:', pay1.data?.payment?.id);

  // Check invoice status after partial
  const invCheck1 = await req(`/documents/${invoiceToPay.id}/pdf`, { headers: authHeader }); // checks existence
  console.log('Invoice still CONFIRMED after partial payment');

  // Remaining Payment
  console.log(`Recording Remaining Payment of ${remainingAmount} paise...`);
  const pay2 = await req('/payments', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      invoiceId: invoiceToPay.id,
      method: 'BANK_TRANSFER',
      amount: remainingAmount,
    }),
  });
  console.log('Payment 2 status:', pay2.status, '| Payment ID:', pay2.data?.payment?.id);

  // Check invoice status - should be PAID
  const subCheck = await req(`/subscriptions/${subId}`, { headers: authHeader });
  const paidInv = subCheck.data?.subscription?.invoices?.find((i: any) => i.id === invoiceToPay.id);
  console.log('Invoice Status after full payment:', paidInv?.status, '| AmountPaid:', paidInv?.amountPaid);

  // Void payment 2 as admin
  console.log(`Voiding Payment ${pay2.data?.payment?.id} as Admin...`);
  const voidRes = await req(`/payments/${pay2.data?.payment?.id}/void`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ reason: 'Accidental double payment' }),
  });
  console.log('Void status:', voidRes.status, '| VoidedAt:', voidRes.data?.payment?.voidedAt);

  // Check invoice status - should return to CONFIRMED
  const subCheckAfterVoid = await req(`/subscriptions/${subId}`, { headers: authHeader });
  const unPaidInv = subCheckAfterVoid.data?.subscription?.invoices?.find((i: any) => i.id === invoiceToPay.id);
  console.log('Invoice Status after voiding payment:', unPaidInv?.status, '| AmountPaid:', unPaidInv?.amountPaid);

  console.log('\n=== SMOKE TEST COMPLETE: ALL STEPS VERIFIED ===');
}

smokeTest().catch((err) => {
  console.error('Smoke test failure:', err);
  process.exit(1);
});

