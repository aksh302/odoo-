#!/usr/bin/env node
// Checks a running backend against what the frontend expects (SRS 9.6 + README notes).
// Read-only: it only logs in and calls GET endpoints, so it never changes data.
//
//   node scripts/check-api.mjs
//   API_URL=http://localhost:4000/api ADMIN_EMAIL=admin@brightloop.test ADMIN_PASSWORD='Demo@12345' node scripts/check-api.mjs
//
// Prints one line per endpoint: OK, MISSING (404), or WRONG SHAPE with the fields that are missing.

const API = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/$/, '')
const EMAIL = process.env.ADMIN_EMAIL || 'admin@brightloop.test'
const PASSWORD = process.env.ADMIN_PASSWORD || 'Demo@12345'

const green = (s) => `\x1b[32m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const amber = (s) => `\x1b[33m${s}\x1b[0m`

let token = ''
const results = { ok: 0, bad: 0, missing: 0 }

async function call(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  })
  let body = null
  const text = await res.text()
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, body }
}

/** Every listed key must exist on obj (dot paths allowed: "customer.name"). */
function missingKeys(obj, keys) {
  return keys.filter((k) => k.split('.').reduce((o, part) => (o == null ? undefined : o[part]), obj) === undefined)
}

function report(label, problems, note = '') {
  if (problems === 'MISSING') {
    results.missing++
    console.log(`${amber('MISSING    ')} ${label}${note ? `  ${note}` : ''}`)
  } else if (problems.length) {
    results.bad++
    console.log(`${red('WRONG SHAPE')} ${label}  missing: ${problems.join(', ')}`)
  } else {
    results.ok++
    console.log(`${green('OK         ')} ${label}${note ? `  ${note}` : ''}`)
  }
}

/** Checks a paged list: { data: [], page, limit, total } and the fields of its first row. */
async function list(path, rowKeys, note) {
  const { status, body } = await call(path)
  if (status === 404) return report(`GET ${path}`, 'MISSING', note)
  if (status >= 400) return report(`GET ${path}`, [`HTTP ${status} ${body?.error?.code ?? ''}`.trim()])
  const shape = missingKeys(body, ['data', 'page', 'limit', 'total'])
  if (shape.length) return report(`GET ${path}`, shape.map((k) => `{ ${k} }`))
  if (!Array.isArray(body.data)) return report(`GET ${path}`, ['data is not an array'])
  if (!body.data.length) return report(`GET ${path}`, [], '(empty list, row fields not checked; add seed data)')
  report(`GET ${path}`, missingKeys(body.data[0], rowKeys))
  return body.data[0]
}

async function one(path, keys, note) {
  const { status, body } = await call(path)
  if (status === 404) return report(`GET ${path}`, 'MISSING', note)
  if (status >= 400) return report(`GET ${path}`, [`HTTP ${status}`])
  report(`GET ${path}`, missingKeys(body, keys), note)
  return body
}

async function main() {
  console.log(`Checking ${API} as ${EMAIL}\n`)

  // ---- auth ----
  let login
  try {
    login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  } catch (e) {
    console.log(red(`Can't reach ${API}: ${e.message}. Is the server running?`))
    process.exit(1)
  }
  if (login.status !== 200 || !login.body?.token) {
    console.log(red(`Login failed (HTTP ${login.status}). Set ADMIN_EMAIL / ADMIN_PASSWORD to a seeded admin.`))
    process.exit(1)
  }
  token = login.body.token
  report('POST /auth/login', missingKeys(login.body, ['token', 'user.id', 'user.name', 'user.email', 'user.role']))
  await one('/auth/me', ['user.id', 'user.role'])

  // Errors must use { error: { code, message } }
  const bad = await call('/subscriptions/999999999')
  report('Error format (404 example)', bad.status === 404 ? missingKeys(bad.body, ['error.code', 'error.message']) : [`expected 404, got ${bad.status}`])

  // ---- catalog ----
  await list('/products?limit=5', ['id', 'name', 'type', 'salesPrice', 'costPrice', 'isArchived', 'variants'])
  await list('/plans?limit=5', ['id', 'name', 'price', 'billingPeriod', 'minQty', 'startDate', 'endDate', 'autoClose', 'closable', 'pausable', 'renewable', 'isArchived'])
  await list('/taxes?limit=5', ['id', 'name', 'percent'])
  await list('/templates?limit=5', ['id', 'name', 'planId', 'validityDays', 'lines'])

  // ---- customers & subscriptions ----
  const cust = await list('/customers?limit=5', ['id', 'name', 'email', 'role', 'profile'])
  if (cust?.id) await one(`/customers/${cust.id}`, ['customer.id', 'subscriptions', 'invoices'], '(extension, see README)')
  const sub = await list('/subscriptions?limit=5', ['id', 'number', 'customerId', 'customer.name', 'planId', 'plan.billingPeriod', 'status', 'startDate', 'expiryDate', 'paymentTerms', 'recurringAmount'])
  if (sub?.id) await one(`/subscriptions/${sub.id}`, ['subscription.id', 'lines', 'invoices'])

  // ---- billing ----
  const inv = await list('/invoices?limit=5', ['id', 'number', 'subscriptionId', 'subscriptionNumber', 'customerId', 'customerSnapshot.name', 'periodStart', 'periodEnd', 'dueDate', 'subtotal', 'discountTotal', 'taxTotal', 'total', 'amountPaid', 'status', 'overdue'])
  if (inv?.id) await one(`/invoices/${inv.id}`, ['invoice.id', 'lines', 'payments'])
  await list('/invoices?overdue=true&limit=5', ['id', 'dueDate', 'overdue'])
  await list('/billing/runs?limit=5', ['id', 'startedAt', 'asOf', 'created', 'skipped', 'failed'])
  await list('/payments?limit=5', ['id', 'invoiceId', 'invoiceNumber', 'customerName', 'method', 'amount', 'date'])

  // ---- reports & admin ----
  await one('/reports/summary', ['activeSubscriptions', 'mrr', 'arr', 'revenueCollected', 'outstanding', 'overdueCount', 'overdueAmount', 'aging.d0_30', 'aging.d31_60', 'aging.d60plus', 'counts', 'revenueByMonth'])
  await list('/discounts?limit=5', ['id', 'name', 'type', 'value', 'scope', 'productIds', 'startDate', 'endDate', 'usedCount', 'isActive'])
  await list('/users?limit=5', ['id', 'name', 'email', 'role', 'isActive'], '(extension, see README)')
  await list('/audit?limit=5', ['id', 'at', 'action', 'entity', 'entityId'])

  console.log(`\n${green(`${results.ok} OK`)}, ${red(`${results.bad} wrong shape`)}, ${amber(`${results.missing} missing`)}`)
  console.log('Field meanings and money rules (integer paise, YYYY-MM-DD dates): see client/README.md, "Notes for the backend".')
  process.exit(results.bad || results.missing ? 1 : 0)
}

main()
