import { Button, Result } from 'antd'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { homeFor, useAuth } from './auth/AuthContext'
import { ProtectedRoute, PublicOnlyRoute } from './auth/ProtectedRoute'
import { AppLayout, PortalLayout } from './components/AppLayout'
import { PlaceholderPage } from './components/PlaceholderPage'
import CustomersPage from './pages/CustomersPage'
import PlansPage from './pages/PlansPage'
import SubscriptionDetailPage from './pages/SubscriptionDetailPage'
import SubscriptionFormPage from './pages/SubscriptionFormPage'
import SubscriptionsPage from './pages/SubscriptionsPage'
import TemplatesPage from './pages/TemplatesPage'
import ProductsPage from './pages/ProductsPage'
import ForgotPage from './pages/auth/ForgotPage'
import LoginPage from './pages/auth/LoginPage'
import ResetPage from './pages/auth/ResetPage'
import SignupPage from './pages/auth/SignupPage'

const P = PlaceholderPage

// Every route from SRS v1.1 section 9.7. Replace each <P /> with the real page as you build it.
export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
      </Route>
      <Route path="/reset" element={<ResetPage />} />

      {/* Admin + Staff back office */}
      <Route element={<ProtectedRoute roles={['ADMIN', 'STAFF']} />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<P title="Dashboard" todo="KPI cards (active, MRR, ARR, collected, outstanding, overdue), revenue-by-month chart, overdue table, aging buckets, filter bar, summary totals, CSV export" />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<P title="Customer" todo="profile form, the customer's subscriptions and invoices" />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/subscriptions/new" element={<SubscriptionFormPage />} />
          <Route path="/subscriptions/:id" element={<SubscriptionDetailPage />} />
          <Route path="/subscriptions/:id/edit" element={<SubscriptionFormPage />} />
          <Route path="/invoices" element={<P title="Invoices" todo="list with filters and overdue toggle; bulk Confirm drafts" />} />
          <Route path="/invoices/:id" element={<P title="Invoice" todo="lines, totals, payments; Confirm, Cancel, Send, Download PDF, Record payment" />} />
          <Route path="/billing" element={<P title="Billing" todo="Run billing button (date picker in demo mode), results panel, run history with failures" />} />
          <Route path="/payments" element={<P title="Payments" todo="payment list; record-payment modal; outstanding invoices tab" />} />
          <Route path="/audit" element={<P title="Audit Log" todo="audit table with entity filter" />} />

          {/* Admin only */}
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/taxes" element={<P title="Taxes" todo="tax rule table and form" />} />
            <Route path="/discounts" element={<P title="Discounts" todo="discount table; form switches fields by scope" />} />
            <Route path="/staff" element={<P title="Staff" todo="staff table, add form, deactivate toggle" />} />
          </Route>
        </Route>
      </Route>

      {/* Customer portal */}
      <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
        <Route element={<PortalLayout />}>
          <Route path="/portal" element={<P title="My Account" todo="tabs: My Subscriptions (pause/resume/renew/close gated by plan flags; browse plans and subscribe), My Invoices (download PDF), My Payments; responsive from 360 px" />} />
        </Route>
      </Route>

      <Route path="/" element={<HomeRedirect />} />
      <Route
        path="*"
        element={<Result status="404" title="Page not found" extra={<Link to="/"><Button type="primary">Go home</Button></Link>} />}
      />
    </Routes>
  )
}

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}
