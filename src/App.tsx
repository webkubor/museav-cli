import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Providers } from '@/components/providers'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import DashboardPage from '@/pages/dashboard'
import ApiKeysPage from '@/pages/api-keys'
import WorkspacesPage from '@/pages/workspaces'

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardLayout />}>
            {/* 首页默认重定向到控制面板 */}
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            
            {/* 千问云风格的设置子级路由 */}
            <Route path="settings">
              <Route index element={<Navigate to="workspace" replace />} />
              <Route path="workspace" element={<WorkspacesPage />} />
              <Route path="account" element={<div style={{ padding: '8px' }}>账号设置骨架</div>} />
              <Route path="alarms" element={<div style={{ padding: '8px' }}>告警配置骨架</div>} />
            </Route>

            {/* 账单用量与分析占位骨架 */}
            <Route path="usage" element={<div style={{ padding: '8px' }}>用量分析数据可视化</div>} />
            <Route path="logs" element={<div style={{ padding: '8px' }}>大模型调用审计日志</div>} />
            <Route path="pay-as-you-go" element={<div style={{ padding: '8px' }}>按量付费与额度充值</div>} />
            <Route path="token-plan" element={<div style={{ padding: '8px' }}>Token 套餐配置</div>} />
            <Route path="invoices" element={<div style={{ padding: '8px' }}>企业发票与开票管理</div>} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  )
}


