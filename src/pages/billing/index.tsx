import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './billing.css'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { PageHeader } from '@/components/ui/PageHeader'
import { trackPageView, trackEvent } from '@/lib/track'
import { BalanceCard } from './BalanceCard'
import type { BalanceTab } from './BalanceCard'
import { LowBalanceAlert } from './LowBalanceAlert'
import { BillingLedgerPanel } from './BillingLedgerPanel'

export default function BillingPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const { symbol: currencySymbol } = useCurrency()
  const { tenant, role } = useTenantRole()

  // 余额桶点击=台账表的余额桶筛选（同一份状态，非各自为政的假交互）；再点一次已选中的桶
  // 回到「全部」，因为三个桶按钮没有第四个「全部」选项可点。
  const [bucketFilter, setBucketFilter] = useState<BalanceTab>('all')
  const handleBucketTabChange = (tab: BalanceTab) => {
    setBucketFilter((prev) => (prev === tab ? 'all' : tab))
  }

  useEffect(() => {
    trackPageView('billing')
  }, [])

  // §11.2 billing_page_view：页面加载成功后单独上报一次，携带入口来源/租户类型/角色
  useEffect(() => {
    if (!tenant) return
    const entrySource = (location.state as { entrySource?: string } | null)?.entrySource ?? 'nav_sidebar'
    trackEvent('billing_page_view', {
      entry_source: entrySource,
      tenant_kind: tenant.type,
      role: role ?? 'unknown',
    })
    // 只在租户/角色首次就绪时上报一次，避免余额等轮询触发重复上报
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(tenant), role])

  return (
    <div className="space-y-6">
      <PageHeader title={t('billing.title')} description={t('billing.desc')} />

      <BalanceCard
        tenantId={tenantId}
        currencySymbol={currencySymbol}
        activeTab={bucketFilter}
        onTabChange={handleBucketTabChange}
      />

      <LowBalanceAlert tenantId={tenantId} />

      <BillingLedgerPanel
        tenantId={tenantId}
        currencySymbol={currencySymbol}
        bucketFilter={bucketFilter}
        onBucketFilterChange={setBucketFilter}
      />
    </div>
  )
}
