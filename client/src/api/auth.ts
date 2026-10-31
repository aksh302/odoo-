import { api } from './client'
import type { CustomerProfile, User } from '../lib/types'

export interface AuthResponse {
  token: string
  user: User
}

export interface SignupInput extends CustomerProfile {
  name: string
  email: string
  password: string
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),

  signup: (input: SignupInput) =>
    api.post<AuthResponse>('/auth/signup', input).then((r) => r.data),

  forgot: (email: string) =>
    api.post<{ ok: true }>('/auth/forgot', { email }).then((r) => r.data),

  reset: (token: string, password: string) =>
    api.post<{ ok: true }>('/auth/reset', { token, password }).then((r) => r.data),

  me: () => api.get<{ user: User }>('/auth/me').then((r) => r.data.user),
}
