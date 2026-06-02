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
import DevicePage from '@/pages/device'
import UsagePage from '@/pages/usage'
import LogsPage from '@/pages/logs'
import BillingPage from '@/pages/billing'
import AccountSettingsPage from '@/pages/settings/account'
import OrganizationPage from '@/pages/settings/organization'
import GuardrailsPage from '@/pages/guardrails'
import InvitationsMgmtPage from '@/pages/invitations-mgmt'
import ObservabilityPage from '@/pages/observability'
import ModelsPage from '@/pages/models'
import ModelsComparePage from '@/pages/models-compare'
import ModelsChatPage from '@/pages/models-chat'
import PlatformConfigPage from '@/pages/platform-config'
import ChatTestPage from '@/pages/chat-test'
import { useAuthStore } from '@/store/auth'
import { getSession } from '@/services/auth'
import { getMarket } from '@/lib/market'
import { applyTheme, getSavedTheme } from '@/lib/theme'
import { toLoginWithRedirect } from '@/lib/redirect'
import { DevRequirements } from '@/components/dev-requirements'

import { Toaster } from 'sonner'

// 注入市场标识，驱动 CSS 品牌色切换
document.documentElement.dataset.market = getMarket()

let isFetchingSession = false

function SessionLoader() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const setLoading = useAuthStore((s) => s.setLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated || isFetchingSession) return
    isFetchingSession = true
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
          result.active_workspace_id,
          result.permissions?.granted ?? null
        )
      })
      .catch(() => {
        setLoading(false)
      })
      .finally(() => {
        isFetchingSession = false
      })
  }, [])

  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to={toLoginWithRedirect()} replace />
  if (!activeTenantId) return <Navigate to="/login?reason=no_access" replace />
  return <>{children}</>
}

export default function App() {
  useEffect(() => {
    applyTheme(getSavedTheme())
  }, [])

  return (
    <Providers>
      <Toaster richColors position="top-right" closeButton />
      <BrowserRouter>
        <SessionLoader />
        {import.meta.env.DEV && <DevRequirements />}
        <Routes>
          {/* 认证路由（公开） */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="/invitations/:token" element={<InvitationsPage />} />
          <Route path="/device" element={<DevicePage />} />

          {/* 控制台路由（需登录） */}
          <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Tenant 级 */}
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="models">
              <Route index element={<Navigate to="explore" replace />} />
              <Route path="explore" element={<ModelsPage />} />
              <Route path="compare" element={<ModelsComparePage />} />
              <Route path="chat" element={<ModelsChatPage />} />
            </Route>
            <Route path="usage" element={<UsagePage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="platform-config" element={<PlatformConfigPage />} />

            <Route path="settings">
              <Route index element={<Navigate to="workspace" replace />} />
              <Route path="workspace" element={<WorkspacesPage />} />
              <Route path="account" element={<AccountSettingsPage />} />
              <Route path="organization" element={<OrganizationPage />} />
            </Route>

            {/* 工作区级（URL 携带 workspaceId） */}
            <Route path="workspace/:workspaceId">
              <Route path="api-keys" element={<ApiKeysPage />} />
              <Route path="guardrails" element={<GuardrailsPage />} />
              <Route path="observability" element={<ObservabilityPage />} />
              <Route path="invitations-mgmt" element={<InvitationsMgmtPage />} />
              <Route path="chat-test" element={<ChatTestPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  )
}
