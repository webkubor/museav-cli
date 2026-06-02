/**
 * 鉴权与登录公共骨架组件 (AuthLayout)
 * 职责：提供沉浸式弥散柔光科技网格背景，以高透毛玻璃圆角卡片渲染所有鉴权页面（登录、注册、重置密码等），自适应国内靛蓝/全球翠绿品牌视觉
 * 路由：/login, /signup, /forgot-password, /reset-password ...
 * API: 纯视觉布局，无直接网络请求依赖，依赖 getMarket() 实现双端品牌感知
 */

import type { ReactNode } from 'react'
import { modelGoLogos } from '@/config/brand-assets'
import { getMarket } from '@/lib/market'

interface AuthLayoutProps {
  /** 鉴权卡片大标题 */
  title: string
  /** 鉴权卡片二级副标题 */
  subtitle?: string
  /** 底部额外操作提示区 */
  footer?: ReactNode
  /** 子页面表单结构 */
  children: ReactNode
}

/**
 * 鉴权公共高品质科技网格氛围骨架 (Tailwind 语义抽离架构)
 */
export function AuthLayout({ title, subtitle, footer, children }: AuthLayoutProps) {
  const market = getMarket()
  const isDomestic = market === 'domestic'

  // 自适应双氛围球的渐变渲染
  const primaryGlow = isDomestic ? 'rgba(99, 102, 241, 0.05)' : 'rgba(16, 185, 129, 0.05)'
  const secondaryGlow = isDomestic ? 'rgba(99, 102, 241, 0.04)' : 'rgba(16, 185, 129, 0.04)'

  return (
    <div className="auth-layout-container">
      {/* 🔮 氛围球一（左下角底层弥散） */}
      <div
        className="auth-blur-orb-primary"
        style={{
          background: `radial-gradient(circle, ${primaryGlow} 0%, rgba(255, 255, 255, 0) 70%)`
        }}
      />

      {/* 🔮 氛围球二（右上角底层弥散） */}
      <div
        className="auth-blur-orb-secondary"
        style={{
          background: `radial-gradient(circle, ${secondaryGlow} 0%, rgba(255, 255, 255, 0) 70%)`
        }}
      />

      {/* 核心内容包裹 */}
      <div className="auth-layout-content">
        <div className="glass-auth-card">
          {/* 顶部 Logo 与文案 */}
          <div className="auth-brand-header">
            <img
              src={modelGoLogos[market]}
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
