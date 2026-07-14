import type { ReactNode } from 'react'
import { useSiteLogo } from '@/config/brand-assets'
import { useLangStore } from '@/store/use-brand-store'
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
  const market = useLangStore((s) => s.market)
  const isDomestic = market === 'china'
  const siteLogo = useSiteLogo()

  // 自适应双氛围球的渐变渲染
  const primaryGlow = isDomestic ? 'rgba(99, 102, 241, 0.05)' : 'rgba(16, 185, 129, 0.05)'
  const secondaryGlow = isDomestic ? 'rgba(99, 102, 241, 0.04)' : 'rgba(16, 185, 129, 0.04)'

  return (
    <div className="auth-layout-container">
      {/* 🔮 氛围球一（left-bottom） */}
      <div
        className="auth-blur-orb-primary"
        style={{
          background: `radial-gradient(circle, ${primaryGlow} 0%, rgba(255, 255, 255, 0) 70%)`
        }}
      />

      {/* 🔮 氛围球二（right-top） */}
      <div
        className="auth-blur-orb-secondary"
        style={{
          background: `radial-gradient(circle, ${secondaryGlow} 0%, rgba(255, 255, 255, 0) 70%)`
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
