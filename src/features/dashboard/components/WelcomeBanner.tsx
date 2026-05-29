/**
 * 仪表盘欢迎横幅与 CLI 快速指引组件
 * 职责：展示带品牌色背景渐变的欢迎语，胶囊化展示租户类型徽章，并提供仿 Mac 暗色仿真 CLI 安装与认证命令终端
 * 路由：/ (Dashboard 主页)
 * API：无外部网络接口依赖，使用客户端 state 与 useAuthStore、storage 等进行状态计算
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCopy, LuCheck, LuBook } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { getMarket } from '@/lib/market'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'

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

  // 智能匹配当前活跃的租户实体与其类型
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)
  const isEnterprise = activeTenant?.type === 'enterprise'

  const [copied, setCopied] = useState(false)

  // CLI 核心命令段
  const installCmd = 'npm install -g modelgo-cli'
  const loginCmd = 'modelgo-cli auth login'
  const fullCmd = `${installCmd}\n${loginCmd}`

  const handleCopy = () => {
    navigator.clipboard.writeText(fullCmd)
    setCopied(true)
    appToast.success(isDomestic ? t('welcomeBanner.toast.copiedDomestic') : t('welcomeBanner.toast.copiedGlobal'))
    setTimeout(() => setCopied(false), 2000)
  }

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
  const docsUrl = isDomestic ? 'https://doc.modelgo.com' : 'https://doc.modelgo.ai'
  const terminalTitle = t('welcomeBanner.terminalTitle')
  const cliComment1 = isDomestic ? t('welcomeBanner.cliComment1Domestic') : t('welcomeBanner.cliComment1Global')
  const cliComment2 = isDomestic ? t('welcomeBanner.cliComment2Domestic') : t('welcomeBanner.cliComment2Global')
  const copyLabel = isDomestic ? t('welcomeBanner.copy') : t('welcomeBanner.copyGlobal')
  const copiedLabel = isDomestic ? t('welcomeBanner.copied') : t('welcomeBanner.copiedGlobal')

  // 动态主题渐变色
  const glowColor = isDomestic ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)'
  const accentBorder = isDomestic ? 'rgba(99, 102, 241, 0.15)' : 'rgba(16, 185, 129, 0.15)'
  const accentGlow = isDomestic ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)'
  const subTitleColor = isDomestic ? '#4f46e5' : '#059669'

  return (
    <div
      style={{
        borderRadius: '20px',
        border: '1px solid var(--mg-border)',
        background: `linear-gradient(135deg, ${glowColor} 0%, rgba(255, 255, 255, 0.03) 50%, var(--mg-bg-0) 100%)`,
        padding: '40px 48px',
        marginBottom: '36px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.02)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '40px',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
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
      <div style={{ flex: '1 1 500px', zIndex: 1 }}>
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
          {greeting} 👋
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

      {/* 右侧：仿真 Mac 暗色终端 CLI 接入命令 */}
      <div
        style={{
          flex: '0 1 400px',
          minWidth: '320px',
          backgroundColor: '#090d16',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.02)',
          overflow: 'hidden',
          zIndex: 1,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = accentBorder;
          (e.currentTarget as HTMLElement).style.boxShadow = `0 24px 48px -15px rgba(0, 0, 0, 0.45), 0 0 12px 2px ${accentGlow}`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.06)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 20px 40px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.02)';
        }}
      >
        {/* Terminal Header */}
        <div
          style={{
            height: '38px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5f56', display: 'inline-block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffbd2e', display: 'inline-block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27c93f', display: 'inline-block' }} />
            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace', marginLeft: '12px', fontWeight: 600 }}>
              {terminalTitle}
            </span>
          </div>

          <Button
            variant="ghost"
            size="xs"
            onClick={handleCopy}
            className="text-[#64748b] bg-white/4 rounded-[6px] px-2 py-1 h-6 transition-all border-none flex items-center gap-1 hover:text-white"
          >
            {copied ? <LuCheck className="text-[var(--mg-success)]" /> : <LuCopy className="text-[#64748b]" />}
            {copied ? copiedLabel : copyLabel}
          </Button>
        </div>

        {/* Terminal Body / CLI Commands */}
        <pre
          style={{
            margin: 0,
            padding: '16px 20px',
            fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace',
            fontSize: '12.5px',
            lineHeight: 1.7,
            color: '#cbd5e1',
            overflowX: 'auto',
            backgroundColor: 'transparent'
          }}
        >
          <code>
            <span style={{ color: '#475569' }}># 1. {cliComment1}</span>
            <br />
            <span style={{ color: '#38bdf8' }}>npm</span> install -g <span style={{ color: '#34d399' }}>modelgo-cli</span>
            <br />
            <br />
            <span style={{ color: '#475569' }}># 2. {cliComment2}</span>
            <br />
            <span style={{ color: '#34d399' }}>modelgo-cli</span> auth <span style={{ color: '#f59e0b' }}>login</span>
          </code>
        </pre>
      </div>
    </div>
  )
}
