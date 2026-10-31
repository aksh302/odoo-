import {
  AppstoreOutlined,
  AuditOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  LogoutOutlined,
  PercentageOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  ProfileOutlined,
  ScheduleOutlined,
  SyncOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Dropdown, Grid, Layout, Menu, Tag } from 'antd'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { MIXED_MODE, USE_MOCKS } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ErrorBoundary } from './ErrorBoundary'
import { Logo } from '../brand/Logo'
import type { Role } from '../lib/types'

const { Sider, Header, Content } = Layout

interface NavItem {
  path: string
  label: string
  icon: ReactNode
  roles: Role[]
  group: 'Overview' | 'Sell' | 'Bill' | 'Catalog' | 'Admin' | 'Help'
}

// Back-office menu, filtered by role (SRS 2.1 permissions table).
const NAV: NavItem[] = [
  { group: 'Overview', path: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Sell', path: '/customers', label: 'Customers', icon: <TeamOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Sell', path: '/subscriptions', label: 'Subscriptions', icon: <SyncOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Sell', path: '/templates', label: 'Quotation templates', icon: <ProfileOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Bill', path: '/invoices', label: 'Invoices', icon: <FileTextOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Bill', path: '/billing', label: 'Billing runs', icon: <ScheduleOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Bill', path: '/payments', label: 'Payments', icon: <WalletOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Catalog', path: '/products', label: 'Products', icon: <AppstoreOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Catalog', path: '/plans', label: 'Plans', icon: <FileDoneOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Admin', path: '/taxes', label: 'Taxes', icon: <DollarOutlined />, roles: ['ADMIN'] },
  { group: 'Admin', path: '/discounts', label: 'Discounts', icon: <PercentageOutlined />, roles: ['ADMIN'] },
  { group: 'Admin', path: '/staff', label: 'Staff', icon: <UserOutlined />, roles: ['ADMIN'] },
  { group: 'Admin', path: '/audit', label: 'Audit log', icon: <AuditOutlined />, roles: ['ADMIN', 'STAFF'] },
  { group: 'Help', path: '/help', label: 'How to use', icon: <QuestionCircleOutlined />, roles: ['ADMIN', 'STAFF'] },
]
const GROUPS = ['Overview', 'Sell', 'Bill', 'Catalog', 'Admin', 'Help'] as const

/** Back-office shell (Admin and Staff): sidebar + header. */
export function AppLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const screens = Grid.useBreakpoint()
  const phone = screens.md === false // hide the sidebar fully on phones; the trigger brings it back

  const visible = NAV.filter((n) => user && n.roles.includes(user.role))
  const items = GROUPS.map((g) => ({
    type: 'group' as const,
    key: g,
    label: collapsed ? null : g,
    children: visible.filter((n) => n.group === g).map((n) => ({ key: n.path, icon: n.icon, label: n.label })),
  })).filter((g) => g.children.length)
  const selected = NAV.find((n) => pathname.startsWith(n.path))?.path

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} breakpoint="lg" collapsedWidth={phone ? 0 : 80} theme="dark" width={232}>
        <div className="flex h-16 items-center" style={{ padding: collapsed ? '0 26px' : '0 22px' }}>
          <Logo onDark compact={collapsed} />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selected ? [selected] : []}
          items={items}
          onClick={(e) => navigate(e.key)}
          style={{ borderInlineEnd: 0, padding: '0 8px' }}
        />
      </Sider>
      <Layout>
        <TopBar />
        <Content style={{ padding: phone ? '20px 16px' : '28px 32px' }}>
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  )
}

/** Customer portal shell: no sidebar, works down to 360 px. */
export function PortalLayout() {
  const location = useLocation()
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <TopBar brand />
      <Content className="mx-auto w-full max-w-5xl" style={{ padding: 16 }}>
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </Content>
    </Layout>
  )
}

function TopBar({ brand }: { brand?: boolean }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <Header
      style={{ padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #DCE4E0' }}
    >
      {brand && (
        <Button type="text" className="px-0" onClick={() => navigate('/portal')} aria-label="Home">
          <Logo />
        </Button>
      )}
      <div className="flex-1" />
      {brand && (
        <Button type="text" icon={<QuestionCircleOutlined />} onClick={() => navigate('/portal/help')}>
          <span className="hidden sm:inline">How to use</span>
        </Button>
      )}
      {USE_MOCKS && (
        <Tag className="hidden sm:inline-block" style={{ color: '#7A4F05', background: '#FFF4DE', borderColor: '#F1D49B' }}>
          {MIXED_MODE ? 'Real + mock data' : 'Mock data'}
        </Tag>
      )}
      <Dropdown
        menu={{
          items: [
            ...(USE_MOCKS
              ? [
                  { key: 'reset', icon: <ReloadOutlined />, label: 'Reset demo data' },
                  { type: 'divider' as const },
                ]
              : []),
            { key: 'logout', icon: <LogoutOutlined />, label: 'Log out' },
          ],
          onClick: ({ key }) => {
            // Mock data lives in memory, so reloading puts every record back to its starting state.
            if (key === 'reset') {
              window.location.reload()
              return
            }
            logout()
            navigate('/login')
          },
        }}
      >
        <Button type="text" className="flex items-center gap-2" aria-label={`Account menu for ${user?.name ?? 'you'}`}>
          <Avatar size="small" icon={<UserOutlined />} />
          <span className="hidden sm:inline">{user?.name}</span>
          <Tag className="hidden sm:inline-block">{user?.role === 'ADMIN' ? 'Admin' : user?.role === 'STAFF' ? 'Staff' : 'Customer'}</Tag>
        </Button>
      </Dropdown>
    </Header>
  )
}
