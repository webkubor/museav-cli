import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Providers } from '@/components/providers'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import DashboardPage from '@/pages/dashboard'
import ApiKeysPage from '@/pages/api-keys'
import WorkspacesPage from '@/pages/workspaces'
import LoginPage from '@/pages/login'
import SignupPage from '@/pages/signup'
import ForgotPasswordPage from '@/pages/forgot-password'
import ResetPasswordPage from '@/pages/reset-password'
import AuthCallbackPage from '@/pages/auth-callback'
import InvitationsPage from '@/pages/invitations'
import UsagePage from '@/pages/usage'
import LogsPage from '@/pages/logs'
import PayAsYouGoPage from '@/pages/pay-as-you-go'
import TokenPlanPage from '@/pages/token-plan'
import InvoicesPage from '@/pages/invoices'
import AccountSettingsPage from '@/pages/settings/account'
import AlarmsSettingsPage from '@/pages/settings/alarms'
import { useAuthStore } from '@/store/auth'
import { getSession } from '@/services/auth'
import { getMarket } from '@/lib/market'

// 注入市场标识，驱动 CSS 品牌色切换
document.documentElement.dataset.market = getMarket()

function SessionLoader() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const setLoading = useAuthStore((s) => s.setLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) return
    getSession()
      .then((result) => {
        setAuth(
          {
            account_id: result.account.account_id,
            display_name: result.account.display_name,
            email: result.account.email,
            avatar_url: result.account.avatar_url,
          },
          result.active_tenant_id,
          result.tenants,
          result.active_workspace_id
        )
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <SessionLoader />
        <Routes>
          {/* 认证路由（公开） */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />

          {/* 控制台路由（需登录） */}
          <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />

            <Route path="settings">
              <Route index element={<Navigate to="workspace" replace />} />
              <Route path="workspace" element={<WorkspacesPage />} />
              <Route path="account" element={<AccountSettingsPage />} />
              <Route path="alarms" element={<AlarmsSettingsPage />} />
            </Route>

            <Route path="usage" element={<UsagePage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="pay-as-you-go" element={<PayAsYouGoPage />} />
            <Route path="token-plan" element={<TokenPlanPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  )
}
