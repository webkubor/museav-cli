import { useEffect, useState } from 'react'
import './billing.css'
import { useTranslation } from 'react-i18next'
import { useCurrency, useSite } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { trackPageView } from '@/lib/track'
import { BalanceCard } from './BalanceCard'
import type { BalanceTab } from './BalanceCard'
import { BillingOrdersPanel } from './BillingOrdersPanel'
import { BillingLedgerPanel } from './BillingLedgerPanel'

export { OrderReceiptDrawer } from './OrderReceiptDrawer'

export default function BillingPage() {
  const { t } = useTranslation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const { symbol: currencySymbol } = useCurrency()
  const site = useSite()

  const [activeTab, setActiveTab] = useState<BalanceTab>('main')

  useEffect(() => {
    trackPageView('billing')
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title={t('billing.title')} />

      <BalanceCard
        tenantId={tenantId}
        currencySymbol={currencySymbol}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <BillingOrdersPanel
        tenantId={tenantId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        site={site ?? ''}
      />

      <BillingLedgerPanel tenantId={tenantId} currencySymbol={currencySymbol} />
    </div>
  )
}
