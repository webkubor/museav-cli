import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { getProfile } from '@/services/account'
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
      {/* 头部标题与说明 */}
      <div style={{ marginBottom: '32px' }}>
        <h1
          style={{ fontSize: '24px', fontWeight: 700, color: 'var(--mg-text-0)', margin: 0, letterSpacing: '-0.02em' }}
        >
          {t('account.title')}
        </h1>
        <span style={{ color: 'var(--mg-text-1)', fontSize: '13.5px', marginTop: '6px', display: 'block' }}>
          {t('account.desc')}
        </span>
      </div>

      {/* 清雅水平 Tabs 视窗切换，彻底告别堆叠 Card 拥挤感 */}
      <div className="border-b border-mg-border flex gap-6 text-sm mb-6 bg-transparent">
        <button
          onClick={() => setActiveTab('info')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeTab === 'info'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
          }`}
        >
          {t('account.tabs.info')}
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeTab === 'security'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
          }`}
        >
          {t('account.tabs.security')}
        </button>
        <button
          onClick={() => setActiveTab('oauth')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeTab === 'oauth'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
          }`}
        >
          {t('account.tabs.oauth')}
        </button>
        <button
          onClick={() => setActiveTab('preferences')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeTab === 'preferences'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
          }`}
        >
          {t('account.tabs.preferences')}
        </button>
      </div>

      <div style={{ paddingTop: '8px' }}>
        {activeTab === 'info' && <BasicInfoTab profile={profile} />}
        {activeTab === 'security' && <ChangePasswordTab />}
        {activeTab === 'oauth' && <OAuthBindingTab connections={profile.connected_oauth} />}
        {activeTab === 'preferences' && <PreferencesTab />}
      </div>
    </div>
  )
}
