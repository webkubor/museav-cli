import type { ReactNode } from 'react'
import { useSiteLogo } from '@/config/brand-assets'
import { useLangStore } from '@/store/use-brand-store'
import { cn } from '@/lib/utils'
import { AuthMarketSwitcher } from '@/components/auth/AuthMarketSwitcher'

interface AuthLayoutProps {
  /** 鉴权卡片大标题 */
  title: string
  /** 鉴权卡片二级副标题 */
  subtitle?: string
  /** 底部额外操作提示区 */
  footer?: ReactNode
  /** 子页面表单结构 */
  children: ReactNode
  /** 桌面端可选的辅助展示区 */
  aside?: ReactNode
  /** 是否使用宽版卡片布局 */
  wide?: boolean
  /** 登录/注册页展示中国站与 Global 的站点切换 */
  showMarketSwitcher?: boolean
}

/**
 * 鉴权公共高品质科技网格氛围骨架 (Tailwind 语义抽离架构)
 */
export function AuthLayout({
  title,
  subtitle,
  footer,
  children,
  aside,
  wide = false,
  showMarketSwitcher = false,
}: AuthLayoutProps) {
  // market 只给站点切换器用；氛围球配色已改走 brand token（release/v1.0.7 的 #1061），不再按市场写死色值。
  const market = useLangStore((s) => s.market)
  const siteLogo = useSiteLogo()

  // 双氛围球：品牌 token 的 rgb 分量（--brand-base-rgb 随市场 × 明暗四象限自动切换）。
  // 原手写 isDomestic ? indigo : emerald 停在旧品牌色、与 brand token 漂移 —— 本文件唯一允许的视觉变化。
  const primaryGlow = 'rgba(var(--brand-base-rgb), 0.05)'
  const secondaryGlow = 'rgba(var(--brand-base-rgb), 0.04)'

  return (
    <div className="auth-layout-container">
      {showMarketSwitcher && <AuthMarketSwitcher market={market} />}

      {/* 🔮 氛围球一（left-bottom） */}
      <div
        className="auth-blur-orb-primary"
        style={{
          background: `radial-gradient(circle, ${primaryGlow} 0%, rgba(var(--mg-bg-0-rgb), 0) 70%)`
        }}
      />

      {/* 🔮 氛围球二（right-top） */}
      <div
        className="auth-blur-orb-secondary"
        style={{
          background: `radial-gradient(circle, ${secondaryGlow} 0%, rgba(var(--mg-bg-0-rgb), 0) 70%)`
        }}
      />

      {/* 核心内容包裹 */}
      <div className={cn(
        'auth-layout-content',
        aside && 'auth-layout-content-with-aside',
        wide && 'max-w-none md:!max-w-[640px]',
      )}>
        <div className="glass-auth-card auth-flow-surface">
          {/* 顶部 Logo 与文案 */}
          <div className="auth-brand-header">
            <img
              src={siteLogo}
              alt="ModelGo"
              className="auth-brand-logo"
            />
            <h1 className="auth-title">
              {title}
            </h1>
            {subtitle && (
              <p className="auth-subtitle">
                {subtitle}
              </p>
            )}
          </div>

          {children}

          {/* 页脚 */}
          {footer && (
            <div className="auth-footer">
              {footer}
            </div>
          )}
        </div>

        {aside && <div className="auth-layout-aside">{aside}</div>}
      </div>
    </div>
  )
}
