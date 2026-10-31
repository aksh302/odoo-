import type { User } from '../../lib/types'
import { contains, fail, paginate, requireRole } from './util'
import type { MockRoutes } from './util'

const DEMO_PASSWORD = 'Demo@12345'

export const users: User[] = [
  { id: 1, name: 'Asha Admin', email: 'admin@brightloop.test', role: 'ADMIN', isActive: true },
  { id: 2, name: 'Sam Staff', email: 'staff@brightloop.test', role: 'STAFF', isActive: true },
  {
    id: 3,
    name: 'Cara Customer',
    email: 'customer@brightloop.test',
    role: 'CUSTOMER',
    isActive: true,
    profile: { company: 'Cara Stores', phone: '9876543210', billingAddress: 'Chennai', taxId: null },
  },
]

// 45 fake customers so pagination and search can be tested.
const COMPANIES = ['Sunrise Traders', 'Kaveri Foods', 'Nila Textiles', 'Orbit Labs', 'Peacock Prints']
export const customers: User[] = Array.from({ length: 45 }, (_, i) => ({
  id: 100 + i,
  name: `Customer ${i + 1}`,
  email: `customer${i + 1}@example.com`,
  role: 'CUSTOMER',
  isActive: true,
  profile: {
    company: `${COMPANIES[i % COMPANIES.length]} ${Math.floor(i / 5) + 1}`,
    phone: `98400${String(10000 + i).slice(-5)}`,
    billingAddress: 'Chennai, Tamil Nadu',
    taxId: i % 3 === 0 ? null : `33ABCDE${1000 + i}F1Z5`,
  },
}))

const tokenFor = (u: User) => `mock-${u.id}`

export function userFromToken(authHeader: string): User | undefined {
  const id = Number(authHeader.replace('Bearer mock-', ''))
  return users.find((u) => u.id === id)
}

export const authRoutes: MockRoutes = {
  'POST /auth/login': ({ body }) => {
    const u = users.find((x) => x.email === body.email?.toLowerCase())
    if (!u || body.password !== DEMO_PASSWORD) return fail(401, 'UNAUTHENTICATED', 'Invalid email or password')
    return [200, { token: tokenFor(u), user: u }]
  },
  'POST /auth/signup': ({ body }) => {
    if (users.some((x) => x.email === body.email?.toLowerCase()))
      return fail(409, 'EMAIL_TAKEN', 'Email already registered', { email: 'This email is already registered' })
    const u: User = {
      id: users.length + 1,
      name: body.name,
      email: body.email.toLowerCase(),
      role: 'CUSTOMER',
      isActive: true,
      profile: { company: body.company, phone: body.phone, billingAddress: body.billingAddress, taxId: body.taxId },
    }
    users.push(u)
    return [201, { token: tokenFor(u), user: u }]
  },
  'POST /auth/forgot': () => [200, { ok: true }],
  'POST /auth/reset': ({ body }) =>
    body.token === 'expired'
      ? fail(400, 'VALIDATION_ERROR', 'Link expired', { token: 'Link expired' })
      : [200, { ok: true }],
  'GET /auth/me': ({ me }) => (me ? [200, { user: me }] : fail(401, 'UNAUTHENTICATED', 'Not logged in')),

  'GET /customers': (ctx) => {
    const denied = requireRole(ctx, 'ADMIN', 'STAFF')
    if (denied) return denied
    const q = ctx.query.q ?? ''
    const all = customers.filter((c) => [c.name, c.email, c.profile?.company].some((s) => contains(s, q)))
    return paginate(all, ctx.query)
  },
}
