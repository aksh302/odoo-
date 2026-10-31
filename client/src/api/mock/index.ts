import { AxiosError, AxiosHeaders } from 'axios'
import type { AxiosAdapter, AxiosResponse } from 'axios'
import { authRoutes, userFromToken } from './auth'
import { catalogRoutes } from './catalog'
import { subscriptionRoutes } from './subscriptions'
import { fail } from './util'
import type { MockResult, MockRoutes } from './util'

/**
 * Fake backend used when VITE_USE_MOCKS=true, so screens can be built
 * before the real API is ready. Responses follow SRS 9.6 shapes exactly,
 * including role checks (403) and validation errors (400 with fields).
 *
 * Demo logins (password for all: Demo@12345):
 *   admin@brightloop.test    -> ADMIN
 *   staff@brightloop.test    -> STAFF
 *   customer@brightloop.test -> CUSTOMER
 *
 * To add a page's endpoints: create mock/<area>.ts exporting MockRoutes,
 * then add it to ALL_ROUTES below. Patterns may use `:id` segments.
 */
const ALL_ROUTES: MockRoutes = {
  ...authRoutes,
  ...catalogRoutes,
  ...subscriptionRoutes,
}

// Pre-compile 'PUT /products/:id' -> regex once.
const compiled = Object.entries(ALL_ROUTES).map(([key, handler]) => {
  const [method, pattern] = key.split(' ')
  const names: string[] = []
  const re = new RegExp(
    '^' + pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)')) + '$',
  )
  return { method, re, names, handler }
})

export const mockAdapter: AxiosAdapter = async (config) => {
  await new Promise((r) => setTimeout(r, 250)) // feel like a network
  const method = (config.method ?? 'get').toUpperCase()
  const path = (config.url ?? '').split('?')[0]
  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data ?? {})
  const me = userFromToken(String(config.headers?.Authorization ?? ''))

  let result: MockResult | null = null
  for (const r of compiled) {
    if (r.method !== method) continue
    const m = path.match(r.re)
    if (!m) continue
    const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]))
    result = r.handler({ body, query: config.params ?? {}, params, me, config })
    break
  }
  if (!result) {
    result =
      method === 'GET'
        ? [200, { data: [], page: 1, limit: 20, total: 0 }] // unknown list -> empty page
        : fail(404, 'NOT_FOUND', `No mock for ${method} ${path}`)
  }

  const [status, data] = result
  const response: AxiosResponse = { data, status, statusText: String(status), headers: new AxiosHeaders(), config }
  if (status >= 400) throw new AxiosError(`Mock ${status}`, String(status), config, undefined, response)
  return response
}
