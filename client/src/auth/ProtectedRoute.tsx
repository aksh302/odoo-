import { Spin } from 'antd'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '../lib/types'
import { homeFor, useAuth } from './AuthContext'

/**
 * Wrap routes that need login. Pass `roles` to restrict further.
 * Not logged in -> /login. Wrong role -> that user's own home page.
 * (The server checks roles too; this only keeps people off screens they can't use.)
 */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

/** For /login, /signup etc.: if already logged in, go home instead. */
export function PublicOnlyRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}
