import { useQuery } from '@tanstack/react-query'
import { Tabs, Typography } from '@douyinfe/semi-ui'
import { getProfile } from '@/services/account'
import { BasicInfoTab } from '@/features/settings/account/components/BasicInfoTab'
import { ChangePasswordTab } from '@/features/settings/account/components/ChangePasswordTab'
import { OAuthBindingTab } from '@/features/settings/account/components/OAuthBindingTab'

const { Title, Text } = Typography

export default function AccountSettingsPage() {
  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['account-profile'],
    queryFn: getProfile,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '40px', color: 'var(--semi-color-text-1)', fontSize: '14px' }}>加载中...</div>
    )
  }

  if (isError || !profile) {
    return (
      <div style={{ padding: '40px', color: '#ef4444', fontSize: '14px' }}>
        加载账号信息失败，请刷新重试。
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
          账号设置
        </Title>
        <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '13.5px', marginTop: '6px', display: 'block' }}>
          管理你的个人信息、密码及第三方账号绑定。
        </Text>
      </div>

      {/* 清雅水平 Tabs 视窗切换，彻底告别堆叠 Card 拥挤感 */}
      <Tabs defaultActiveKey="info" style={{ marginTop: '0' }}>
        <Tabs.TabPane tab="基本资料" itemKey="info">
          <div style={{ paddingTop: '24px' }}>
            <BasicInfoTab profile={profile} />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="密码与安全" itemKey="security">
          <div style={{ paddingTop: '24px' }}>
            <ChangePasswordTab />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="第三方账号" itemKey="oauth">
          <div style={{ paddingTop: '24px' }}>
            <OAuthBindingTab connections={profile.connected_oauth} />
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}
