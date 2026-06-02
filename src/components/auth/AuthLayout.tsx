/**
 * 鉴权与登录公共骨架组件 (AuthLayout)
 * 职责：提供沉浸式弥散柔光科技网格背景，以高透毛玻璃圆角卡片渲染所有鉴权页面（登录、注册、重置密码等），自适应国内靛蓝/全球翠绿品牌视觉
 * 路由：/login, /signup, /forgot-password, /reset-password ...
 * API: 纯视觉布局，无直接网络请求依赖，依赖 getMarket() 实现双端品牌感知
 */

import type { ReactNode } from 'react'
import { modelGoLogos } from '@/config/brand-assets'
import { getMarket } from '@/lib/market'
import { AuthBackgroundVisual } from './AuthBackgroundVisual'

interface AuthLayoutProps {
  /** 鉴权卡片大标题 */
  title: string
  /** 鉴权卡片二级副标题 */
  subtitle?: string
  /** 底部额外操作提示区 */
  footer?: ReactNode
  /** 子页面表单结构 */
  children: ReactNode
  /** 鉴权背景视觉语义 */
  visual?: 'login' | 'signup'
}

/**
 * 鉴权公共高品质科技网格氛围骨架 (Tailwind 语义抽离架构)
 */
export function AuthLayout({ title, subtitle, footer, children, visual = 'login' }: AuthLayoutProps) {
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

      <AuthBackgroundVisual variant={visual} />

      {/* 核心内容包裹 */}
      <div className="auth-layout-content">
        {/* 顶部 Logo 与文案 */}
        <div className="text-center mb-7">
          <img
            src={modelGoLogos[market]}
            alt="ModelGo"
            className="w-11 h-11 object-contain mx-auto mb-4 transition-transform duration-300"
          />
          <h1 className="m-0 font-extrabold text-[22px] tracking-tight text-mg-text-0 leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-mg-text-2 text-xs font-semibold mt-1.5 mb-0">
              {subtitle}
            </p>
          )}
        </div>

        {/* 晶莹毛玻璃登录主体卡 */}
        <div className="glass-auth-card rounded-[18px] p-8">
          {children}
        </div>

        {/* 页脚 */}
        {footer && (
          <div className="text-center mt-[22px] text-[12.5px] font-semibold text-mg-text-2 tracking-tight">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
