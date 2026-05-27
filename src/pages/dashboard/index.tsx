import { Typography, Row, Col } from '@douyinfe/semi-ui'
import { KpiSection } from '@/features/dashboard/components/KpiSection'
import { TerminalSection } from '@/features/dashboard/components/TerminalSection'
import { GuideSection } from '@/features/dashboard/components/GuideSection'
import { useAuthStore } from '@/store/auth'

const { Title, Text } = Typography

export default function DashboardPage() {
  const displayName = useAuthStore((s) => s.account?.display_name)
  const greeting = displayName ? `你好，${displayName}` : '你好，开发者'

  return (
    <div>
      {/* 欢迎头部 */}
      <div style={{ marginBottom: '32px' }}>
        <Title heading={2} style={{
          margin: '0 0 6px 0',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--semi-color-text-0)'
        }}>
          {greeting} 👋
        </Title>
        <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '13.5px', fontWeight: 400 }}>
          欢迎访问 ModelGo 开发者控制台。在这里管理密钥、监控请求量以及查看账单。
        </Text>
      </div>

      {/* KPI 看板网格 */}
      <KpiSection />

      {/* 终端接入与向导排版 */}
      <Row gutter={24}>
        <Col span={14}>
          <TerminalSection />
        </Col>
        <Col span={10}>
          <GuideSection />
        </Col>
      </Row>
    </div>
  )
}
