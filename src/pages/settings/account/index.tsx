import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { getProfile } from '@/services/account'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { BasicInfoTab } from '@/features/settings/account/components/BasicInfoTab'
import { ChangePasswordTab } from '@/features/settings/account/components/ChangePasswordTab'
import { OAuthBindingTab } from '@/features/settings/account/components/OAuthBindingTab'
import { PreferencesTab } from '@/features/settings/account/components/PreferencesTab'

type Tab = 'info' | 'security' | 'oauth' | 'preferences'
const TABS = new Set<Tab>(['info', 'security', 'oauth', 'preferences'])

function normalizeTab(value: string | null): Tab {
  return TABS.has(value as Tab) ? (value as Tab) : 'info'
}

export default function AccountSettingsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = normalizeTab(searchParams.get('tab'))

  const setActiveTab = (tab: Tab) => {
    setSearchParams(tab === 'info' ? {} : { tab })
  }

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['account-profile'],
    queryFn: getProfile,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '40px', color: 'var(--mg-text-1)', fontSize: '14px' }}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          {t('common.loading')}
        </div>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div style={{ padding: '40px', color: 'var(--mg-danger)', fontSize: '14px' }}>
        {t('common.errorLoadProfile')}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <PageHeader
        title={t('account.title')}
        description={t('account.desc')}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList variant="pills" className="mb-6">
          <TabsTrigger variant="pills" value="info">{t('account.tabs.info')}</TabsTrigger>
          <TabsTrigger variant="pills" value="security">{t('account.tabs.security')}</TabsTrigger>
          <TabsTrigger variant="pills" value="oauth">{t('account.tabs.oauth')}</TabsTrigger>
          <TabsTrigger variant="pills" value="preferences">{t('account.tabs.preferences')}</TabsTrigger>
        </TabsList>
        <TabsContent value="info"><BasicInfoTab profile={profile} /></TabsContent>
        <TabsContent value="security"><ChangePasswordTab /></TabsContent>
        <TabsContent value="oauth"><OAuthBindingTab connections={profile.connected_oauth} /></TabsContent>
        <TabsContent value="preferences"><PreferencesTab /></TabsContent>
      </Tabs>
    </div>
  )
}
