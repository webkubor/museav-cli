import React from 'react'
import { Typography } from '@douyinfe/semi-ui'
import { IconChevronRight } from '@douyinfe/semi-icons'

const { Title } = Typography

interface GuideItem {
  title: string
  desc: string
  badge: string
  badgeBg: string
  badgeColor: string
}

const GUIDES: GuideItem[] = [
  {
    title: '创建与管理 API Key',
    desc: '5 分钟内获取安全高可用的 Token Key 凭证',
    badge: '🔑',
    badgeBg: '#fef3c7',
    badgeColor: '#d97706'
  },
  {
    title: 'CLI 一键登录授权',
    desc: '执行 modelgo-cli auth login，浏览器扫码确认即可',
    badge: '⌨️',
    badgeBg: '#f0f0ff',
    badgeColor: '#6366f1'
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
]

export const GuideSection: React.FC = () => {
  return (
    <div style={{
      background: 'var(--semi-color-bg-0)',
      borderRadius: '14px',
      border: '1px solid var(--semi-color-border)',
      boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.02)',
      padding: '24px',
      minHeight: '380px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Title heading={5} style={{ margin: '0 0 16px 0', color: 'var(--semi-color-text-0)', fontWeight: 700, letterSpacing: '-0.01em' }}>
        常用向导
      </Title>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
        {GUIDES.map((item, idx) => (
          <div 
            key={idx} 
            style={{
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--semi-color-bg-1)',
              border: '1px solid var(--semi-color-border)',
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
              e.currentTarget.style.backgroundColor = 'var(--semi-color-bg-1)';
              e.currentTarget.style.borderColor = 'var(--semi-color-border)';
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
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--semi-color-text-0)', letterSpacing: '-0.01em' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--semi-color-text-1)', marginTop: '2.5px' }}>
                  {item.desc}
                </div>
              </div>
            </div>
            <IconChevronRight 
              className="arrow-icon"
              style={{ 
                color: 'var(--semi-color-text-2)',
                marginLeft: '8px',
                transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }} 
            />
          </div>
        ))}
      </div>
    </div>
  )
}
