import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { CopyButton } from '@/components/ui/CopyButton'
import { PermissionsPanel } from './PermissionsPanel'
import { DialogPreviewPanel } from './DialogPreviewPanel'

const PUBLIC_ROUTES = [
  { path: '/login', desc: '邮箱密码登录' },
  { path: '/signup', desc: '新用户注册' },
  { path: '/forgot-password', desc: '忘记密码（发送重置邮件）' },
  { path: '/reset-password?token=xxx', desc: '重置密码（邮件链接带 token）' },
  { path: '/auth/callback?redirect=/dashboard', desc: 'OAuth 回调（GitHub/Google/WeChat）' },
  { path: '/invitations', desc: '邀请列表' },
  { path: '/invitations/:token', desc: '邀请详情（链接带 token）' },
  { path: '/device', desc: 'CLI 设备码授权' },
] as const

// 开发者菜单 tab，挂到 URL ?tab= 上以便直接定位某个 tab
const DEV_CONFIG_TABS = ['permissions', 'dialog-preview']
const DEFAULT_TAB = 'permissions'

export default function PlatformConfigPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') ?? ''
  const activeTab = DEV_CONFIG_TABS.includes(tabParam) ? tabParam : DEFAULT_TAB
  const handleTabChange = (v: string) => setSearchParams({ tab: v }, { replace: true })


  // 微信收银台调试链接：带 demo 参数好直接看 UI；不传 tenant → 不轮询真实订单，纯 UI 调试。
  const cashierDemoURL = (() => {
    const url = new URL('/billing/wechat-cashier', window.location.origin)
    url.searchParams.set('amount', '100')
    url.searchParams.set('currency', 'CNY')
    url.searchParams.set('payee', '杭州词元共生科技有限公司')
    url.searchParams.set('qr', 'DEV_DEMO')
    url.searchParams.set('order', 'DEV_DEMO_ORDER')
    return url.toString()
  })()

  return (
    // 后台壳内页（挂在 DashboardLayout 下，带侧栏/头部）：自带内边距 + 限宽居中
    <div className="mx-auto max-w-6xl space-y-5 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-mg-text-1">
            {t('platformConfig.title')}
          </h1>
          <p className="text-sm text-mg-text-2 mt-1.5">
            {t('platformConfig.desc')}
          </p>
        </div>
        <Badge variant="warning" size="sm" className="uppercase tracking-wide select-none">
          DEV ONLY
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="permissions">权限 / 路由</TabsTrigger>
          <TabsTrigger value="dialog-preview">弹窗预览</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          <div className="space-y-8 pt-2">
            <PermissionsPanel />

            <section className="space-y-3">
              <div>
                <h2 className="text-base font-bold text-mg-text-1">公共路由</h2>
                <p className="mt-1 text-xs text-mg-text-3">无需登录即可访问的页面路由，点击复制完整 URL。</p>
              </div>
              {PUBLIC_ROUTES.map((r) => {
                const full = `${window.location.origin}${r.path}`
                return (
                  <div
                    key={r.path}
                    className="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border px-5 py-3 flex items-center gap-4 transition-colors hover:border-brand-base/30"
                  >
                    <code className="text-xs font-mono text-brand-base shrink-0 select-all">{r.path}</code>
                    <span className="text-xs text-mg-text-3">—</span>
                    <span className="text-xs text-mg-text-2">{r.desc}</span>
                    <CopyButton value={full} aria-label={`复制 ${r.path}`} toast={`已复制 ${r.path}`} className="ml-auto" />
                  </div>
                )
              })}
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-base font-bold text-mg-text-1">调试跳转</h2>
                <p className="mt-1 text-xs text-mg-text-3">带 demo 参数直达页面，方便本地看 UI / 调样式（不传 tenant，不触发真实业务）。</p>
              </div>
              <div className="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border px-5 py-3 flex items-center gap-4 transition-colors hover:border-brand-base/30">
                <code className="text-xs font-mono text-brand-base shrink-0 select-all">/billing/wechat-cashier</code>
                <span className="text-xs text-mg-text-3">—</span>
                <span className="text-xs text-mg-text-2">微信支付收银台（demo）</span>
                <a
                  href={cashierDemoURL}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center rounded-md bg-brand-base px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-base/90"
                >
                  打开
                </a>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="dialog-preview">
          <DialogPreviewPanel />
        </TabsContent>

      </Tabs>
    </div>
  )
}
