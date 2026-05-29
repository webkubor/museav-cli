/**
 * 仪表盘鉴权中心 — 社交第三方授权登录面板 (SocialLogin)
 * 职责：渲染三方单点登录（微信、GitHub、Google）选项，支持根据不同端与市场动态显示启用列表
 * 路由：/login, /signup 中的子模块
 * API: GET /overview/platform-config 读取启用方式，动态跳转 oauth 路由
 */

import React from 'react'
import Google from '@lobehub/icons/es/Google'
import Github from '@lobehub/icons/es/Github'
import { SiWechat } from 'react-icons/si'
import { Button } from '@/components/ui/Button'
import { useMarket } from '@/hooks/useMarket'
import { oauthAuthorizeUrl } from '@/services/auth'
import { usePlatformConfig } from '@/hooks/use-platform-config'

interface Props {
  /** 授权成功后的重定向目的地址 */
  redirectTo: string
}

const OAUTH_ICONS: Record<string, React.ReactNode> = {
  wechat: <SiWechat size={16} className="mr-1 text-[#07C160]" />,
  github: <Github size={16} className="text-mg-text-0 mr-1" />,
  google: <Google size={16} className="mr-1" />,
}

const OAUTH_LABELS: Record<string, string> = {
  wechat: '微信',
  github: 'GitHub',
  google: 'Google',
}

const MARKET_FALLBACK: Record<string, string[]> = {
  domestic: ['wechat', 'github'],
  global:   ['google', 'github'],
}

/**
 * 第三方社交快速登录面板组件 (Tailwind 抽离与精纯图标库)
 */
export function SocialLogin({ redirectTo }: Props) {
  const market = useMarket()
  const { data: platformConfig } = usePlatformConfig()

  // 优先使用 Swagger 接口返回的动态启用列表，若未配置则根据市场进行降级
  const oauthMethods = (platformConfig?.enabled_login_methods ?? MARKET_FALLBACK[market] ?? [])
    .filter((m) => m !== 'password')

  if (oauthMethods.length === 0) return null

  return (
    <>
      {/* 分割线段 */}
      <div className="social-divider">
        <div className="social-divider-line" />
        <span className="social-divider-text">
          OR
        </span>
        <div className="social-divider-line" />
      </div>

      {/* 三方卡片按钮列表 */}
      <div className="social-btn-group">
        {oauthMethods.map((method) => (
          <Button
            key={method}
            variant="secondary"
            className="social-btn"
            onClick={() => {
              window.location.href = oauthAuthorizeUrl(method as any, redirectTo)
            }}
          >
            {OAUTH_ICONS[method]}
            <span>{OAUTH_LABELS[method] ?? method}</span>
          </Button>
        ))}
      </div>
    </>
  )
}
