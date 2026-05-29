import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getProfile } from '@/services/account'
import { BasicInfoTab } from '@/features/settings/account/components/BasicInfoTab'
import { ChangePasswordTab } from '@/features/settings/account/components/ChangePasswordTab'
import { OAuthBindingTab } from '@/features/settings/account/components/OAuthBindingTab'

type Tab = 'info' | 'security' | 'oauth'

export default function AccountSettingsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('info')

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['account-profile'],
    queryFn: getProfile,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '40px', color: 'var(--mg-text-1)', fontSize: '14px' }}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-brand-base rounded-full animate-spin" />
          {t('common.loading')}
        </div>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div style={{ padding: '40px', color: '#ef4444', fontSize: '14px' }}>
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
      <div className="border-b border-gray-100 dark:border-gray-800 flex gap-6 text-sm mb-6 bg-transparent">
        <button
          onClick={() => setActiveTab('info')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeTab === 'info'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          }`}
        >
          {t('account.tabs.info')}
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeTab === 'security'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          }`}
        >
          {t('account.tabs.security')}
        </button>
        <button
          onClick={() => setActiveTab('oauth')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeTab === 'oauth'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          }`}
        >
          {t('account.tabs.oauth')}
        </button>
      </div>

      <div style={{ paddingTop: '8px' }}>
        {activeTab === 'info' && <BasicInfoTab profile={profile} />}
        {activeTab === 'security' && <ChangePasswordTab />}
        {activeTab === 'oauth' && <OAuthBindingTab connections={profile.connected_oauth} />}
      </div>
    </div>
  )
}
