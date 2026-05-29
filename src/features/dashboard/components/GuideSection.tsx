/**
 * 仪表盘常用向导组件
 * 职责：平铺展示控制台常用指南卡片，如 API Key、CLI 授权、支付绑定与模型路由，引导新手开发者快速接入
 * 路由：/ (Dashboard 主页)
 * API：纯静态指南交互，无需外部 API 数据流
 */

import React from 'react'

/** 指南条目实体定义 */
interface GuideItem {
  /** 向导标题 */
  title: string
  /** 向导简短描述 */
  desc: string
  /** Emoji 图标标识 */
  badge: string
  /** 图标背景颜色 */
  badgeBg: string
  /** 图标前景色 */
  badgeColor: string
}

// 常用接入向导静态数据
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
    desc: '执行 modelgo-cli auth login，浏览器扫码确认',
    badge: '⌨️',
    badgeBg: '#f0f0ff',
    badgeColor: '#6366f1'
  },
  {
    title: '绑定支付并开具发票',
    desc: '国内/海外双市场支付及财务开票安全指引',
    badge: '💳',
    badgeBg: '#dcfce7',
    badgeColor: '#15803d'
  },
  {
    title: '探索高性价比合规模型',
    desc: '聚合深思、通义、千问等高性价比大模型路由',
    badge: '🚀',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1'
  }
]

/**
 * 常用向导平铺 Grid 组件
 * 大屏展示为 4 列，响应式适配中小屏与移动端
 */
export const GuideSection: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {GUIDES.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '20px',
              borderRadius: '12px',
              backgroundColor: 'var(--semi-color-bg-1)',
              border: '1px solid var(--semi-color-border)',
              cursor: 'pointer',
              height: '140px',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--semi-color-bg-2)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--semi-color-primary)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'var(--semi-shadow-elevated)';
              const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
              if (arrow) arrow.style.transform = 'translateX(4px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--semi-color-bg-1)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--semi-color-border)';
              (e.currentTarget as HTMLElement).style.transform = 'none';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
              if (arrow) arrow.style.transform = 'none';
            }}
          >
            {/* 卡片顶部：胶囊图标 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: item.badgeBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              >
                {item.badge}
              </div>
            </div>

            {/* 卡片底部：文本说明 */}
            <div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--semi-color-text-0)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.3
                }}
              >
                {item.title}
              </div>
              <span
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--semi-color-text-2)',
                  marginTop: '6px',
                  lineHeight: 1.4
                }}
              >
                {item.desc}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
