import { Card, Row, Col, Typography, Button } from '@douyinfe/semi-ui'
import { IconChevronRight, IconCopy } from '@douyinfe/semi-icons'


const { Title, Text } = Typography

export default function DashboardPage() {
  // Mock 用量大卡片数据
  const kpis = [
    { title: '总请求量 (次)', value: '1,284', change: '+12.4%', color: '#0066ff' },
    { title: '消耗 Token (k)', value: '18,495', change: '+8.3%', color: '#10b981' },
    { title: '消费金额 ($)', value: '23.84', change: '+15.2%', color: '#f59e0b' }
  ]

  // 基础连接代码示例
  const codeSnippet = `import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: "your_modelgo_api_key",
  baseURL: "https://api.modelgo.com/v1"
});

const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }]
});`

  return (
    <div>
      {/* 欢迎头部 */}
      <div style={{ marginBottom: '28px' }}>
        <Title heading={2} style={{ margin: '0 0 4px 0', fontWeight: 600 }}>
          你好，开发者 👋
        </Title>
        <Text style={{ color: '#6b7280', fontSize: '13px' }}>
          欢迎使用开放平台控制台。在这里轻松管理您的密钥、监控请求量以及查看消费账单。
        </Text>
      </div>

      {/* KPI 卡片组 */}
      <Row gutter={16} style={{ marginBottom: '28px' }}>
        {kpis.map((k, idx) => (
          <Col span={8} key={idx}>
            <Card
              bordered
              style={{
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                transition: 'transform 0.2s',
                cursor: 'pointer'
              }}
              bodyStyle={{ padding: '24px' }}
            >
              <Text style={{ color: '#6b7280', fontSize: '13px' }}>{k.title}</Text>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginTop: '8px'
              }}>
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#111827' }}>
                  {k.value}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: k.color }}>
                  {k.change}
                </span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={20}>
        {/* 左侧：快速接入指南 */}
        <Col span={14}>
          <Card
            title="OpenAI 兼容极速接入"
            bordered
            headerStyle={{ borderBottom: '1px solid #f3f4f6', padding: '16px 24px' }}
            bodyStyle={{ padding: '24px' }}
            style={{ borderRadius: '12px', minHeight: '360px' }}
            headerExtraContent={
              <Button theme="borderless" icon={<IconCopy />} style={{ color: '#6b7280' }}>
                复制代码
              </Button>
            }
          >
            <pre style={{
              backgroundColor: '#1f2937',
              color: '#f9fafb',
              padding: '16px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '12px',
              overflowX: 'auto',
              margin: 0
            }}>
              <code>{codeSnippet}</code>
            </pre>
          </Card>
        </Col>

        {/* 右侧：推荐与公告 */}
        <Col span={10}>
          <Card
            title="常用向导"
            bordered
            headerStyle={{ borderBottom: '1px solid #f3f4f6', padding: '16px 24px' }}
            bodyStyle={{ padding: '16px 24px' }}
            style={{ borderRadius: '12px', minHeight: '360px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { title: '如何创建与管理您的 API Key?', desc: '5分钟内获取安全高可用的 Token Key' },
                { title: '如何集成微信与支付宝并开具发票?', desc: '国内词元共生市场支付及财务开票指引' },
                { title: '探索高性价比国内合规模型路由', desc: '深度聚合深思、通义、千问等高性价比大模型' }
              ].map((item, idx) => (
                <div 
                  key={idx} 
                  style={{
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#f9fafb',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{item.title}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{item.desc}</div>
                  </div>
                  <IconChevronRight style={{ color: '#9ca3af', marginLeft: '8px' }} />
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
