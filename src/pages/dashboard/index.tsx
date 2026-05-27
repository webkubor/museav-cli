import { useState } from 'react'
import { Typography, Button, Row, Col, Toast } from '@douyinfe/semi-ui'
import { IconChevronRight, IconCopy, IconTick } from '@douyinfe/semi-icons'

const { Title, Text } = Typography

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'python' | 'node' | 'curl'>('python')
  const [copied, setCopied] = useState(false)

  // Mock 用量大卡片数据
  const kpis = [
    { 
      title: '总请求量 (次)', 
      value: '1,284', 
      change: '+12.4%', 
      color: '#10b981',
      sparkline: (
        <svg width="100%" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 32C15 28 25 15 40 18C55 22 65 32 80 12C95 -8 105 5 120 2" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M0 32C15 28 25 15 40 18C55 22 65 32 80 12C95 -8 105 5 120 2V40H0V32Z" fill="url(#gradient-green)" opacity="0.08"/>
          <defs>
            <linearGradient id="gradient-green" x1="60" y1="0" x2="60" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#10b981"/>
              <stop offset="1" stopColor="#10b981" stopOpacity="0"/>
            </linearGradient>
          </defs>
        </svg>
      )
    },
    { 
      title: '消耗 Token (k)', 
      value: '18,495', 
      change: '+8.3%', 
      color: '#3b82f6',
      sparkline: (
        <svg width="100%" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 35C15 32 25 36 40 24C55 12 65 18 80 8C95 -2 105 6 120 4" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M0 35C15 32 25 36 40 24C55 12 65 18 80 8C95 -2 105 6 120 4V40H0V35Z" fill="url(#gradient-blue)" opacity="0.08"/>
          <defs>
            <linearGradient id="gradient-blue" x1="60" y1="0" x2="60" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3b82f6"/>
              <stop offset="1" stopColor="#3b82f6" stopOpacity="0"/>
            </linearGradient>
          </defs>
        </svg>
      )
    },
    { 
      title: '消费金额 ($)', 
      value: '23.84', 
      change: '+15.2%', 
      color: '#f59e0b',
      sparkline: (
        <svg width="100%" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 38C15 36 25 24 40 26C55 28 65 10 80 14C95 18 105 -2 120 1" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M0 38C15 36 25 24 40 26C55 28 65 10 80 14C95 18 105 -2 120 1V40H0V38Z" fill="url(#gradient-yellow)" opacity="0.08"/>
          <defs>
            <linearGradient id="gradient-yellow" x1="60" y1="0" x2="60" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f59e0b"/>
              <stop offset="1" stopColor="#f59e0b" stopOpacity="0"/>
            </linearGradient>
          </defs>
        </svg>
      )
    }
  ]

  // 不同 Tab 下的纯文本代码（供复制）
  const plainCodes = {
    python: `import openai

client = openai.OpenAI(
    api_key="your_modelgo_api_key",
    base_url="https://api.modelgo.com/v1"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "你好！"}]
)

print(response.choices[0].message.content)`,
    node: `import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: "your_modelgo_api_key",
  baseURL: "https://api.modelgo.com/v1"
});

const completion = await openai.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "Hello!" }]
});

console.log(completion.choices[0].message.content);`,
    curl: `curl https://api.modelgo.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_modelgo_api_key" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(plainCodes[activeTab])
    setCopied(true)
    Toast.success('接入代码已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* 欢迎头部：极雅气度 */}
      <div style={{ marginBottom: '32px' }}>
        <Title heading={2} style={{ 
          margin: '0 0 6px 0', 
          fontWeight: 700, 
          letterSpacing: '-0.02em',
          color: '#0f172a' 
        }}>
          你好，开发者 👋
        </Title>
        <Text style={{ color: '#64748b', fontSize: '13.5px', fontWeight: 400 }}>
          欢迎访问 ModelGo 开发者控制台。在这里轻松管理您的密钥、监控请求量以及查看消费账单。
        </Text>
      </div>

      {/* KPI 卡片组：透镜画布重构 */}
      <Row gutter={20} style={{ marginBottom: '36px' }}>
        {kpis.map((k, idx) => (
          <Col span={8} key={idx}>
            <div
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(226, 232, 240, 0.7)',
                background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.4) 0%, rgba(255, 255, 255, 0.9) 100%)',
                padding: '22px 24px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)';
                e.currentTarget.style.boxShadow = '0 12px 24px -10px rgba(15, 23, 42, 0.08), 0 4px 12px -5px rgba(59, 130, 246, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.7)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.01)';
              }}
            >
              <Text style={{ color: '#64748b', fontSize: '12.5px', fontWeight: 500, letterSpacing: '0.01em' }}>
                {k.title}
              </Text>
              
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginTop: '10px',
                position: 'relative',
                zIndex: 2
              }}>
                <span style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>
                  {k.value}
                </span>
                
                {/* 高饱和半透明微胶囊 */}
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  color: k.color,
                  backgroundColor: k.color + '15',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  border: '1px solid ' + k.color + '30',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px'
                }}>
                  <span style={{ fontSize: '10px' }}>↑</span>
                  {k.change}
                </span>
              </div>

              {/* 极客微趋势图 (Micro Sparklines) */}
              <div style={{ 
                position: 'absolute', 
                bottom: '-2px', 
                left: 0, 
                right: 0, 
                height: '42px',
                opacity: 0.85,
                zIndex: 1
              }}>
                {k.sparkline}
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={24}>
        {/* 左侧：精装 IDE 仿真面板 */}
        <Col span={14}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid rgba(226, 232, 240, 0.7)',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.02)',
            overflow: 'hidden'
          }}>
            {/* IDE 窗口顶栏 */}
            <div style={{
              backgroundColor: '#0f172a',
              height: '46px',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              {/* 左侧：Mac 三色按钮胶囊 */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ff5f56', display: 'inline-block' }}></span>
                <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ffbd2e', display: 'inline-block' }}></span>
                <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#27c93f', display: 'inline-block' }}></span>
                
                {/* 仿真 Tab 切换 */}
                <div style={{ display: 'flex', gap: '4px', marginLeft: '20px' }}>
                  {[
                    { key: 'python', label: 'main.py' },
                    { key: 'node', label: 'index.js' },
                    { key: 'curl', label: 'cURL' }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontFamily: 'monospace',
                        backgroundColor: activeTab === tab.key ? '#1e293b' : 'transparent',
                        color: activeTab === tab.key ? '#38bdf8' : '#64748b'
                      }}
                      onMouseEnter={(e) => {
                        if (activeTab !== tab.key) {
                          e.currentTarget.style.color = '#94a3b8';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeTab !== tab.key) {
                          e.currentTarget.style.color = '#64748b';
                        }
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 右侧：复制键 */}
              <Button
                size="small"
                theme="borderless"
                icon={copied ? <IconTick style={{ color: '#10b981' }} /> : <IconCopy style={{ color: '#94a3b8' }} />}
                onClick={handleCopy}
                style={{
                  color: copied ? '#10b981' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: '6px',
                  padding: '4px 10px'
                }}
              >
                {copied ? '已复制' : '复制'}
              </Button>
            </div>

            {/* 代码渲染区：高保真手动高亮 */}
            <pre className="code-editor-pre">
              {activeTab === 'python' && (
                <code>
                  <span className="code-keyword">import</span> openai<br /><br />
                  client = openai.<span className="code-builtin">OpenAI</span>(<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;api_key=<span className="code-string">"your_modelgo_api_key"</span>,<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;base_url=<span className="code-string">"https://api.modelgo.com/v1"</span><br />
                  )<br /><br />
                  response = client.chat.completions.create(<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;model=<span className="code-string">"deepseek-chat"</span>,<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;messages=[&#123;<span className="code-property">"role"</span>: <span className="code-string">"user"</span>, <span className="code-property">"content"</span>: <span className="code-string">"你好！"</span>&#125;]<br />
                  )<br /><br />
                  <span className="code-builtin">print</span>(response.choices[<span className="code-constant">0</span>].message.content)
                </code>
              )}
              {activeTab === 'node' && (
                <code>
                  <span className="code-keyword">import</span> <span className="code-builtin">OpenAI</span> <span className="code-keyword">from</span> <span className="code-string">"openai"</span>;<br /><br />
                  <span className="code-keyword">const</span> openai = <span className="code-keyword">new</span> <span className="code-builtin">OpenAI</span>(&#123;<br />
                  &nbsp;&nbsp;<span className="code-property">apiKey</span>: <span className="code-string">"your_modelgo_api_key"</span>,<br />
                  &nbsp;&nbsp;<span className="code-property">baseURL</span>: <span className="code-string">"https://api.modelgo.com/v1"</span><br />
                  &#125;);<br /><br />
                  <span className="code-keyword">const</span> completion = <span className="code-keyword">await</span> openai.chat.completions.create(&#123;<br />
                  &nbsp;&nbsp;<span className="code-property">model</span>: <span className="code-string">"deepseek-chat"</span>,<br />
                  &nbsp;&nbsp;<span className="code-property">messages</span>: [&#123; <span className="code-property">role</span>: <span className="code-string">"user"</span>, <span className="code-property">content</span>: <span className="code-string">"Hello!"</span> &#125;]<br />
                  &#125;);<br /><br />
                  <span className="code-builtin">console</span>.log(completion.choices[<span className="code-constant">0</span>].message.content);
                </code>
              )}
              {activeTab === 'curl' && (
                <code>
                  curl https://api.modelgo.com/v1/chat/completions \<br />
                  &nbsp;&nbsp;-H <span className="code-string">"Content-Type: application/json"</span> \<br />
                  &nbsp;&nbsp;-H <span className="code-string">"Authorization: Bearer your_modelgo_api_key"</span> \<br />
                  &nbsp;&nbsp;-d <span className="code-string">'&#123;<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;"model": "deepseek-chat",<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;"messages": [&#123;"role": "user", "content": "Hello!"&#125;]<br />
                  &nbsp;&nbsp;&#125;'</span>
                </code>
              )}
            </pre>
          </div>
        </Col>

        {/* 右侧：常用向导 (极雅渐进式面板) */}
        <Col span={10}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid rgba(226, 232, 240, 0.7)',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.02)',
            padding: '24px',
            minHeight: '380px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <Title heading={5} style={{ margin: '0 0 16px 0', color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em' }}>
              常用向导
            </Title>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              {[
                { 
                  title: '创建与管理 API Key', 
                  desc: '5分钟内获取安全高可用的 Token Key 凭证', 
                  badge: '🔑',
                  badgeBg: '#fef3c7',
                  badgeColor: '#d97706'
                },
                { 
                  title: '绑定支付并开具发票', 
                  desc: '词元共生市场支付及财务开票安全指引', 
                  badge: '💳',
                  badgeBg: '#dcfce7',
                  badgeColor: '#15803d'
                },
                { 
                  title: '探索高性价比国内合规模型', 
                  desc: '聚合深思、通义、千问等合规大模型路由', 
                  badge: '🚀',
                  badgeBg: '#e0f2fe',
                  badgeColor: '#0369a1'
                }
              ].map((item, idx) => (
                <div 
                  key={idx} 
                  style={{
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid rgba(226, 232, 240, 0.5)',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#eff6ff';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)';
                    const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
                    if (arrow) arrow.style.transform = 'translateX(3px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                    e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.5)';
                    const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
                    if (arrow) arrow.style.transform = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                    {/* 微胶囊指示标 */}
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: item.badgeBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '15px'
                    }}>
                      {item.badge}
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b', letterSpacing: '-0.01em' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2.5px' }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                  <IconChevronRight 
                    className="arrow-icon"
                    style={{ 
                      color: '#94a3b8', 
                      marginLeft: '8px',
                      transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }} 
                  />
                </div>
              ))}
            </div>
          </div>
        </Col>
      </Row>
    </div>
  )
}
