import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi } from '../api/auth'
import type { SignupInput } from '../api/auth'
import { TOKEN_KEY } from '../api/client'
import type { Role, User } from '../lib/types'

interface AuthState {
  user: User | null
  /** true until we've checked a saved token with /auth/me */
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  signup: (input: SignupInput) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

/** Where each role lands after login (SRS 9.7). */
export function homeFor(role: Role): string {
  return role === 'CUSTOMER' ? '/portal' : '/dashboard'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On page load, restore the session from a saved token.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false)
      return
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await authApi.login(email, password)
    localStorage.setItem(TOKEN_KEY, token)
    setUser(user)
    return user
  }, [])

  const signup = useCallback(async (input: SignupInput) => {
    const { token, user } = await authApi.signup(input)
    localStorage.setItem(TOKEN_KEY, token)
    setUser(user)
    return user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** true when the logged-in user is an Admin (Staff gets read-only catalog screens). */
export function useIsAdmin(): boolean {
  return useAuth().user?.role === 'ADMIN'
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
