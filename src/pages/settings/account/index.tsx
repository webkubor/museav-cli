import { useQuery } from '@tanstack/react-query'
import { Tabs, Typography } from '@douyinfe/semi-ui'
import { useTranslation } from 'react-i18next'
import { getProfile } from '@/services/account'
import { BasicInfoTab } from '@/features/settings/account/components/BasicInfoTab'
import { ChangePasswordTab } from '@/features/settings/account/components/ChangePasswordTab'
import { OAuthBindingTab } from '@/features/settings/account/components/OAuthBindingTab'

const { Title, Text } = Typography

export default function AccountSettingsPage() {
  const { t } = useTranslation()
  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['account-profile'],
    queryFn: getProfile,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '40px', color: 'var(--semi-color-text-1)', fontSize: '14px' }}>{t('common.loading')}</div>
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
        <Title
          heading={2}
          style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0, letterSpacing: '-0.02em' }}
        >
          {t('account.title')}
        </Title>
        <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '13.5px', marginTop: '6px', display: 'block' }}>
          {t('account.desc')}
        </Text>
      </div>

      {/* 清雅水平 Tabs 视窗切换，彻底告别堆叠 Card 拥挤感 */}
      <Tabs defaultActiveKey="info" style={{ marginTop: '0' }}>
        <Tabs.TabPane tab={t('account.tabs.info')} itemKey="info">
          <div style={{ paddingTop: '24px' }}>
            <BasicInfoTab profile={profile} />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('account.tabs.security')} itemKey="security">
          <div style={{ paddingTop: '24px' }}>
            <ChangePasswordTab />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('account.tabs.oauth')} itemKey="oauth">
          <div style={{ paddingTop: '24px' }}>
            <OAuthBindingTab connections={profile.connected_oauth} />
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}
