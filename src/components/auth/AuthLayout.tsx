import type { ReactNode } from 'react'
import { useSiteLogo } from '@/config/brand-assets'
import { cn } from '@/lib/utils'

interface AuthLayoutProps {
  /** 鉴权卡片大标题 */
  title: string
  /** 鉴权卡片二级副标题 */
  subtitle?: string
  /** 底部额外操作提示区 */
  footer?: ReactNode
  /** 子页面表单结构 */
  children: ReactNode
  /** 是否使用宽版卡片布局 */
  wide?: boolean
}

/**
 * 鉴权公共高品质科技网格氛围骨架 (Tailwind 语义抽离架构)
 */
export function AuthLayout({ title, subtitle, footer, children, wide = false }: AuthLayoutProps) {
  const siteLogo = useSiteLogo()

  // 双氛围球：品牌 token 的 rgb 分量（--brand-base-rgb 随市场 × 明暗四象限自动切换）。
  // 原手写 isDomestic ? indigo : emerald 停在旧品牌色、与 brand token 漂移 —— 本文件唯一允许的视觉变化。
  const primaryGlow = 'rgba(var(--brand-base-rgb), 0.05)'
  const secondaryGlow = 'rgba(var(--brand-base-rgb), 0.04)'

  return (
    <div className="auth-layout-container">
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
      <div className={cn("auth-layout-content", wide && "max-w-none md:!max-w-[640px]")}>
        <div className="glass-auth-card">
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
      </div>
    </div>
  )
}
