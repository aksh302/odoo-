import { Button, Result, Spin } from 'antd'
import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { homeFor, useAuth } from './auth/AuthContext'
import { ProtectedRoute, PublicOnlyRoute } from './auth/ProtectedRoute'
import { AppLayout, PortalLayout } from './components/AppLayout'
import LoginPage from './pages/auth/LoginPage'

// Pages load on first visit, so the login screen appears faster.
const AuditPage = lazy(() => import('./pages/admin/AuditPage'))
const BillingPage = lazy(() => import('./pages/BillingPage'))
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DiscountsPage = lazy(() => import('./pages/admin/DiscountsPage'))
const ForgotPage = lazy(() => import('./pages/auth/ForgotPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage'))
const InvoicePrintPage = lazy(() => import('./pages/InvoicePrintPage'))
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'))
const PlansPage = lazy(() => import('./pages/PlansPage'))
const PortalPage = lazy(() => import('./pages/PortalPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const ResetPage = lazy(() => import('./pages/auth/ResetPage'))
const SignupPage = lazy(() => import('./pages/auth/SignupPage'))
const StaffPage = lazy(() => import('./pages/admin/StaffPage'))
const SubscriptionDetailPage = lazy(() => import('./pages/SubscriptionDetailPage'))
const SubscriptionFormPage = lazy(() => import('./pages/SubscriptionFormPage'))
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'))
const TaxesPage = lazy(() => import('./pages/admin/TaxesPage'))
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'))

// Every route from SRS v1.1 section 9.7.
export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[60vh] items-center justify-center">
          <Spin size="large" />
        </div>
      }
    >
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
        {/* Printable invoice opens in its own tab, without the app layout */}
        <Route path="/invoices/:id/print" element={<InvoicePrintPage />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/subscriptions/new" element={<SubscriptionFormPage />} />
          <Route path="/subscriptions/:id" element={<SubscriptionDetailPage />} />
          <Route path="/subscriptions/:id/edit" element={<SubscriptionFormPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/help" element={<HelpPage />} />

          {/* Admin only */}
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/taxes" element={<TaxesPage />} />
            <Route path="/discounts" element={<DiscountsPage />} />
            <Route path="/staff" element={<StaffPage />} />
          </Route>
        </Route>
      </Route>

      {/* Customer portal */}
      <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
        <Route path="/portal/invoices/:id/print" element={<InvoicePrintPage source="portal" />} />
        <Route element={<PortalLayout />}>
          <Route path="/portal" element={<PortalPage />} />
          <Route path="/portal/help" element={<HelpPage />} />
        </Route>
      </Route>

      <Route path="/" element={<HomeRedirect />} />
      <Route
        path="*"
        element={<Result status="404" title="Page not found" extra={<Link to="/"><Button type="primary">Go home</Button></Link>} />}
      />
    </Routes>
    </Suspense>
  )
}

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}
