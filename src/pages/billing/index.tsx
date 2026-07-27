import { useEffect, useState } from 'react'
import './billing.css'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { trackPageView } from '@/lib/track'
import { BalanceCard } from './BalanceCard'
import type { BalanceTab } from './BalanceCard'
import { BillingLedgerPanel } from './BillingLedgerPanel'

export default function BillingPage() {
  const { t } = useTranslation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const { symbol: currencySymbol } = useCurrency()

  const [activeTab, setActiveTab] = useState<BalanceTab>('main')

  useEffect(() => {
    trackPageView('billing')
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title={t('billing.title')} description={t('billing.desc')} />

      <BalanceCard
        tenantId={tenantId}
        currencySymbol={currencySymbol}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <BillingLedgerPanel tenantId={tenantId} currencySymbol={currencySymbol} />
    </div>
  )
}
