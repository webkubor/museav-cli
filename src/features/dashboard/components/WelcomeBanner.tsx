/**
 * 仪表盘欢迎横幅组件
 * 职责：展示带品牌色背景渐变的欢迎语，胶囊化展示租户类型徽章，并提供 21:9 控制台主视觉
 * 路由：/ (Dashboard 主页)
 * API：无外部网络接口依赖，使用客户端 state 与 useAuthStore、storage 等进行状态计算
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { LuBook } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { getMarket } from '@/lib/market'
import { getMarketConfig } from '@/config/market'
import { Button } from '@/components/ui/Button'
import { DashboardHeroVisual } from './DashboardHeroVisual'

/**
 * 仪表盘核心欢迎 Banner 组件
 * 整合打招呼、工作区标签与 CLI 一键 Onboarding 安装
 */
export const WelcomeBanner: React.FC = () => {
  const { t } = useTranslation()
  const displayName = useAuthStore((s) => s.account?.display_name)
  const tenants = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  // 智能探测当前市场与语言
  const market = getMarket()
  const isDomestic = market === 'domestic'
  const marketConfig = getMarketConfig(market)

  // 智能匹配当前活跃的租户实体与其类型
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)
  const isEnterprise = activeTenant?.type === 'enterprise'

  // 国际化文案自适应
  const greeting = displayName
    ? isDomestic
      ? t('welcomeBanner.greetingDomestic', { name: displayName })
      : t('welcomeBanner.greetingGlobal', { name: displayName })
    : isDomestic
    ? t('welcomeBanner.greetingDefaultDomestic')
    : t('welcomeBanner.greetingDefaultGlobal')

  const brandName = isDomestic ? t('welcomeBanner.brandNameDomestic') : t('welcomeBanner.brandNameGlobal')
  const subTitle = isDomestic ? t('welcomeBanner.subTitleDomestic') : t('welcomeBanner.subTitleGlobal')
  const desc = isDomestic ? t('welcomeBanner.descDomestic') : t('welcomeBanner.descGlobal')
  const workspaceTag = isEnterprise
    ? isDomestic
      ? t('welcomeBanner.workspaceTagEnterpriseDomestic')
      : t('welcomeBanner.workspaceTagEnterpriseGlobal')
    : isDomestic
    ? t('welcomeBanner.workspaceTagPersonalDomestic')
    : t('welcomeBanner.workspaceTagPersonalGlobal')
  const docsBtn = isDomestic ? t('welcomeBanner.docsBtnDomestic') : t('welcomeBanner.docsBtnGlobal')
  const docsUrl = marketConfig.docsUrl

  // 动态主题渐变色
  const glowColor = isDomestic ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)'
  const subTitleColor = isDomestic ? '#4f46e5' : '#059669'

  return (
    <div
      style={{
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: `linear-gradient(135deg, ${glowColor} 0%, rgba(255, 255, 255, 0.02) 50%, rgba(var(--mg-bg-0-rgb), 0.55) 100%)`,
        padding: 'clamp(28px, 4vw, 40px) clamp(24px, 4vw, 48px)',
        marginBottom: '36px',
        boxShadow: '0 8px 32px 0 rgba(15, 23, 42, 0.04)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '32px',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      }}
    >
      {/* 背景微型修饰辉光 */}
      <div
        style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          background: glowColor,
          filter: 'blur(60px)',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      {/* 左侧：打打招呼信息与身份胶囊 */}
      <div style={{ flex: '1 1 360px', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          {/* 精致的胶囊身份标签 */}
          <span
            style={{
              padding: '2px 10px',
              borderRadius: '99px',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              backgroundColor: isEnterprise
                ? 'rgba(59, 130, 246, 0.08)'
                : 'rgba(100, 116, 139, 0.08)',
              color: isEnterprise ? '#3b82f6' : 'var(--mg-text-2)',
              border: `1px solid ${isEnterprise ? 'rgba(59, 130, 246, 0.15)' : 'var(--mg-border)'}`,
              display: 'inline-flex',
              alignItems: 'center',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
          >
            {workspaceTag}
          </span>
          <span
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: 'var(--mg-border)'
            }}
          />
          <span style={{ fontSize: '11.5px', color: 'var(--mg-text-2)', fontWeight: 500 }}>
            {brandName} Control Center
          </span>
        </div>

        <h1
          style={{
            margin: '0 0 12px 0',
            fontWeight: 800,
            fontSize: '36px',
            letterSpacing: '-0.04em',
            color: 'var(--mg-text-0)',
            lineHeight: 1.1
          }}
        >
          {greeting}
        </h1>

        <p
          style={{
            display: 'block',
            fontSize: '15px',
            fontWeight: 600,
            color: subTitleColor,
            letterSpacing: '-0.01em',
            margin: '0 0 14px 0'
          }}
        >
          {subTitle}
        </p>

        <p
          style={{
            display: 'block',
            color: 'var(--mg-text-1)',
            fontSize: '13px',
            fontWeight: 400,
            lineHeight: 1.6,
            maxWidth: '560px',
            margin: '0 0 22px 0'
          }}
        >
          {desc}
        </p>

        <Button
          variant="outline"
          size="sm"
          className="rounded-[8px] font-semibold px-4 py-2 bg-mg-bg-1 border border-mg-border shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all cursor-pointer inline-flex items-center gap-2"
          onClick={() => window.open(docsUrl, '_blank')}
        >
          <LuBook />
          {docsBtn}
        </Button>
      </div>

      {/* 右侧：21:9 控制台首页主视觉 */}
      <div
        style={{
          flex: '0 1 500px',
          minWidth: 'min(360px, 100%)',
          zIndex: 1,
          transform: 'translateZ(0)',
        }}
      >
        <DashboardHeroVisual />
      </div>
    </div>
  )
}
