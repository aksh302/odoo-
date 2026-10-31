import axios from 'axios'
import type { AxiosAdapter } from 'axios'
import { translatingAdapter } from './backend'
import { mockAdapter } from './mock'

export const TOKEN_KEY = 'bl_token'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/**
 * Mixed mode, for when the backend is only partly done:
 *   VITE_USE_MOCKS=true
 *   VITE_REAL_API=/auth,/products,/plans
 * Requests whose path starts with one of these go to the real server; everything else
 * stays on mock data. Put /auth first: the mock then accepts the real login token.
 */
const REAL_PREFIXES = (import.meta.env.VITE_REAL_API || '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

export const MIXED_MODE = USE_MOCKS && REAL_PREFIXES.length > 0

// Real server calls go through the translation layer (SRS paths -> the backend's routes and shapes).
const realAdapter = translatingAdapter(axios.getAdapter(['xhr', 'fetch']))
const routedAdapter: AxiosAdapter = (config) =>
  REAL_PREFIXES.some((p: string) => (config.url ?? '').startsWith(p)) ? realAdapter(config) : mockAdapter(config)

/**
 * The ONE axios instance the whole app uses (SRS 9.7).
 * - adds Authorization: Bearer <jwt>
 * - on 401, clears the token and sends the user to /login
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  adapter: USE_MOCKS ? (MIXED_MODE ? routedAdapter : mockAdapter) : realAdapter,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const url: string = err.config?.url ?? ''
    // A wrong password on /auth/login is also a 401 — don't redirect for auth calls.
    if (status === 401 && !url.startsWith('/auth/')) {
      localStorage.removeItem(TOKEN_KEY)
      if (window.location.pathname !== '/login') window.location.assign('/login')
    }
    return Promise.reject(err)
  },
)
