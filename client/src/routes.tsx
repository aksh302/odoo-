import { Button, Result } from 'antd'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { homeFor, useAuth } from './auth/AuthContext'
import { ProtectedRoute, PublicOnlyRoute } from './auth/ProtectedRoute'
import { AppLayout, PortalLayout } from './components/AppLayout'
import AuditPage from './pages/admin/AuditPage'
import DiscountsPage from './pages/admin/DiscountsPage'
import StaffPage from './pages/admin/StaffPage'
import TaxesPage from './pages/admin/TaxesPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import CustomersPage from './pages/CustomersPage'
import DashboardPage from './pages/DashboardPage'
import BillingPage from './pages/BillingPage'
import InvoiceDetailPage from './pages/InvoiceDetailPage'
import InvoicePrintPage from './pages/InvoicePrintPage'
import HelpPage from './pages/HelpPage'
import InvoicesPage from './pages/InvoicesPage'
import PaymentsPage from './pages/PaymentsPage'
import PlansPage from './pages/PlansPage'
import PortalPage from './pages/PortalPage'
import SubscriptionDetailPage from './pages/SubscriptionDetailPage'
import SubscriptionFormPage from './pages/SubscriptionFormPage'
import SubscriptionsPage from './pages/SubscriptionsPage'
import TemplatesPage from './pages/TemplatesPage'
import ProductsPage from './pages/ProductsPage'
import ForgotPage from './pages/auth/ForgotPage'
import LoginPage from './pages/auth/LoginPage'
import ResetPage from './pages/auth/ResetPage'
import SignupPage from './pages/auth/SignupPage'

// Every route from SRS v1.1 section 9.7.
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
  )
}

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}
