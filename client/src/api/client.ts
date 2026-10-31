import axios from 'axios'
import { mockAdapter } from './mock'

export const TOKEN_KEY = 'bl_token'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/**
 * The ONE axios instance the whole app uses (SRS 9.7).
 * - adds Authorization: Bearer <jwt>
 * - on 401, clears the token and sends the user to /login
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  ...(USE_MOCKS ? { adapter: mockAdapter } : {}),
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
