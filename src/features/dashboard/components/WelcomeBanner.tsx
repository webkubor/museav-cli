/**
 * 仪表盘欢迎横幅组件
 * 职责：展示带品牌色背景渐变的欢迎语，胶囊化展示租户类型徽章，并提供 21:9 控制台主视觉
 * 路由：/ (Dashboard 主页)
 * API：无外部网络接口依赖，使用客户端 state 与 useAuthStore、storage 等进行状态计算
 */

import React, { useState } from 'react'
import { LuKey, LuZap, LuArrowRight, LuX } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useLangStore } from '@/store/use-brand-store'
import { getMarketConfig } from '@/config/market'
import { TerminalSection } from './TerminalSection'
import './welcome-banner.css'

const STEPS = [
  { icon: LuKey,  label: '创建 API Key', to: '/api-keys' },
  { icon: LuZap,  label: '选择模型',     to: '/models' },
  { icon: LuArrowRight, label: '发起调用', to: null },
]

/**
 * 仪表盘核心欢迎 Banner 组件
 * 整合打招呼、工作区标签与 CLI 一键 Onboarding 安装
 */
export const WelcomeBanner: React.FC = () => {
  const navigate = useNavigate()
  const displayName = useAuthStore((s) => s.account?.display_name)
  const market = useLangStore((s) => s.market)
  const marketConfig = getMarketConfig(market)
  const name = displayName ?? '开发者'

  const [visible, setVisible] = useState(() => {
    return localStorage.getItem('mg_welcome_banner_hidden') !== 'true'
  })

  if (!visible) return null

  const handleClose = () => {
    localStorage.setItem('mg_welcome_banner_hidden', 'true')
    setVisible(false)
  }

  return (
    <div className="welcome-aurora-card flex flex-wrap items-center gap-6 md:gap-8 p-6 md:p-8 mb-8 rounded-lg relative overflow-hidden">
      {/* Web3 极客装饰网格线与流体极光发光团 */}
      <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none z-0">
        <div className="aurora-grid-pattern" />
        <div className="aurora-orb orb-1" />
        <div className="aurora-orb orb-2" />
        <div className="aurora-orb orb-3" />
      </div>

      {/* 右上角关闭按钮 */}
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-4 right-4 text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-1 p-1.5 rounded-full transition-colors cursor-pointer border-none bg-transparent flex items-center justify-center z-20"
        title="关闭欢迎横幅"
      >
        <LuX size={15} />
      </button>

      {/* 左侧：极简引导 */}
      <div className="flex flex-col justify-center gap-5 flex-1 min-w-[260px] relative z-10">
        <div>
          <p className="text-[11px] font-bold tracking-widest uppercase text-mg-text-2 mb-1.5">快速开始</p>
          <h2 className="text-[22px] font-bold tracking-tight text-mg-text-0 m-0">
            你好，{name} 👋
          </h2>
        </div>

        {/* 3 步引导 */}
        <ol className="flex flex-col gap-3 m-0 p-0 list-none">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-base/10 text-brand-base text-[11px] font-bold shrink-0">
                  {i + 1}
                </span>
                {step.to ? (
                  <button
                    type="button"
                    onClick={() => navigate(step.to!)}
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-mg-text-1 hover:text-brand-base transition-colors cursor-pointer bg-transparent border-none p-0"
                  >
                    <Icon size={13} />
                    {step.label}
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-mg-text-2">
                    <Icon size={13} />
                    {step.label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>

        <a
          href={marketConfig.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] text-mg-text-2 hover:text-brand-base transition-colors self-start"
        >
          查看完整文档 →
        </a>
      </div>

      {/* 右侧：代码块 */}
      <div className="flex-1 lg:flex-[0_1_500px] min-w-[300px] relative z-10">
        <TerminalSection />
      </div>
    </div>
  )
}
