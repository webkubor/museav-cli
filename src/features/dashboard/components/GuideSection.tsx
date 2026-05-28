/**
 * 仪表盘常用向导组件
 * 职责：平铺展示控制台常用指南卡片，如 API Key、CLI 授权、支付绑定与模型路由，引导新手开发者快速接入
 * 路由：/ (Dashboard 主页)
 * API：纯静态指南交互，无需外部 API 数据流
 */

import React from 'react'
import { Typography, Row, Col } from '@douyinfe/semi-ui'
import { LuChevronRight } from 'react-icons/lu'

const { Text } = Typography

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
      <Row gutter={[16, 16]}>
        {GUIDES.map((item, idx) => (
          <Col span={24} key={idx}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: 'var(--semi-color-bg-1)',
                border: '1px solid var(--semi-color-border)',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                gap: '16px'
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--semi-color-bg-2)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99, 102, 241, 0.25)';
                (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px -4px rgba(15, 23, 42, 0.06)';
                const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
                if (arrow) arrow.style.transform = 'translateX(2px)';
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
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: item.badgeBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  flexShrink: 0,
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              >
                {item.badge}
              </div>

              <div style={{ flex: 1 }}>
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
                <Text
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    color: 'var(--semi-color-text-2)',
                    marginTop: '4px',
                    lineHeight: 1.4
                  }}
                >
                  {item.desc}
                </Text>
              </div>

              <LuChevronRight
                className="arrow-icon"
                style={{
                  color: 'var(--semi-color-text-3)',
                  fontSize: '16px',
                  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  flexShrink: 0
                }}
              />
            </div>
          </Col>
        ))}
      </Row>
    </div>
  )
}
