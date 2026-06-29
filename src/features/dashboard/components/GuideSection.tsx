/**
 * 仪表盘常用向导组件
 * 职责：平铺展示控制台常用指南卡片，如 API Key、CLI 授权、支付绑定与模型路由，引导新手开发者快速接入
 * 路由：/ (Dashboard 主页)
 * API：纯静态指南交互，无需外部 API 数据流
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { LuKey, LuTerminal, LuCreditCard, LuRocket } from 'react-icons/lu'

/** 指南条目实体定义 */
interface GuideItem {
  /** i18n key prefix */
  keyPrefix: string
  /** Emoji 图标标识 */
  badge: React.ReactNode
  /** 图标背景颜色 */
  badgeBg: string
  /** 图标前景色 */
  badgeColor: string
}

// 常用接入向导静态数据
const GUIDES: GuideItem[] = [
  {
    keyPrefix: 'guideSection.guide0',
    badge: <LuKey size={18} />,
    badgeBg: 'rgba(245,158,11,0.10)',
    badgeColor: 'var(--mg-warning)'
  },
  {
    keyPrefix: 'guideSection.guide1',
    badge: <LuTerminal size={18} />,
    badgeBg: 'rgba(var(--mg-primary-rgb,99,102,241),0.10)',
    badgeColor: 'var(--mg-primary)'
  },
  {
    keyPrefix: 'guideSection.guide2',
    badge: <LuCreditCard size={18} />,
    badgeBg: 'rgba(16,185,129,0.10)',
    badgeColor: 'var(--mg-success)'
  },
  {
    keyPrefix: 'guideSection.guide3',
    badge: <LuRocket size={18} />,
    badgeBg: 'rgba(14,165,233,0.10)',
    badgeColor: '#0ea5e9'
  }
]

/**
 * 常用向导平铺 Grid 组件
 * 大屏展示为 4 列，响应式适配中小屏与移动端
 */
export const GuideSection: React.FC = () => {
  const { t } = useTranslation()

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
              backgroundColor: 'var(--mg-bg-0)',
              border: '1px solid var(--mg-border)',
              cursor: 'pointer',
              height: '140px',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--mg-bg-2)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--mg-primary)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
              const arrow = e.currentTarget.querySelector('.arrow-icon') as HTMLElement;
              if (arrow) arrow.style.transform = 'translateX(4px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--mg-bg-0)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--mg-border)';
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
                  color: 'var(--mg-text-1)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.3
                }}
              >
                {t(`${item.keyPrefix}.title`)}
              </div>
              <span
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--mg-text-3)',
                  marginTop: '6px',
                  lineHeight: 1.4
                }}
              >
                {t(`${item.keyPrefix}.desc`)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
