/**
 * 仪表盘欢迎横幅与 CLI 快速指引组件
 * 职责：展示带品牌色背景渐变的欢迎语，胶囊化展示租户类型徽章，并提供仿 Mac 暗色仿真 CLI 安装与认证命令终端
 * 路由：/ (Dashboard 主页)
 * API：无外部网络接口依赖，使用客户端 state 与 useAuthStore、storage 等进行状态计算
 */

import React, { useState } from 'react'
import { Typography, Button, Toast } from '@douyinfe/semi-ui'
import { LuCopy, LuCheck, LuBook } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { getMarket } from '@/lib/market'

const { Title, Text } = Typography

/**
 * 仪表盘核心欢迎 Banner 组件
 * 整合打招呼、工作区标签与 CLI 一键 Onboarding 安装
 */
export const WelcomeBanner: React.FC = () => {
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
    Toast.success(isDomestic ? 'CLI 接入命令已复制到剪贴板' : 'CLI commands copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  // 国际化文案自适应
  const t = {
    greeting: displayName
      ? isDomestic
        ? `你好，${displayName}`
        : `Hello, ${displayName}`
      : isDomestic
      ? '你好，开发者'
      : 'Hello, Developer',
    brandName: isDomestic ? '词元共生' : 'ModelGo',
    subTitle: isDomestic
      ? '高性能、高合规的多模型路由聚合平台'
      : 'Unified High-Performance Intelligent AI Routing Platform',
    desc: isDomestic
      ? '欢迎访问 ModelGo 开发者控制台。在下方管理 API 密钥、监控用量和账单。使用右侧 CLI 命令行即可在 1 分钟内免密接入与调用多款大语言模型。'
      : 'Welcome to the ModelGo workspace. Manage API keys, monitor requests, and check billing. Use the CLI commands on the right to auth and access models in less than a minute.',
    workspaceTag: isEnterprise
      ? isDomestic
        ? '企业级组织'
        : 'Enterprise Org'
      : isDomestic
      ? '个人开发者'
      : 'Personal Acc',
    docsBtn: isDomestic ? '开发文档' : 'Developer Docs',
    docsUrl: isDomestic ? 'https://doc.modelgo.com' : 'https://doc.modelgo.ai',
    terminalTitle: 'bash — installation & login'
  }

  // 动态主题渐变色
  const glowColor = isDomestic ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)'
  const accentBorder = isDomestic ? 'rgba(99, 102, 241, 0.15)' : 'rgba(16, 185, 129, 0.15)'
  const accentGlow = isDomestic ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)'

  return (
    <div
      style={{
        borderRadius: '16px',
        border: '1px solid var(--semi-color-border)',
        background: `linear-gradient(135deg, ${glowColor} 0%, rgba(255, 255, 255, 0.03) 50%, var(--semi-color-bg-0) 100%)`,
        padding: '32px',
        marginBottom: '36px',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.01)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '32px',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
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
              color: isEnterprise ? '#3b82f6' : 'var(--semi-color-text-2)',
              border: `1px solid ${isEnterprise ? 'rgba(59, 130, 246, 0.15)' : 'var(--semi-color-border)'}`,
              display: 'inline-flex',
              alignItems: 'center',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
          >
            {t.workspaceTag}
          </span>
          <span
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: 'var(--semi-color-border)'
            }}
          />
          <span style={{ fontSize: '11.5px', color: 'var(--semi-color-text-2)', fontWeight: 500 }}>
            {t.brandName} Control Center
          </span>
        </div>

        <Title
          heading={1}
          style={{
            margin: '0 0 8px 0',
            fontWeight: 800,
            fontSize: '28px',
            letterSpacing: '-0.03em',
            color: 'var(--semi-color-text-0)',
            lineHeight: 1.2
          }}
        >
          {t.greeting} 👋
        </Title>
        
        <Text
          style={{
            display: 'block',
            fontSize: '15px',
            fontWeight: 600,
            color: isDomestic ? '#4f46e5' : '#059669',
            letterSpacing: '-0.01em',
            marginBottom: '14px'
          }}
        >
          {t.subTitle}
        </Text>

        <Text
          style={{
            display: 'block',
            color: 'var(--semi-color-text-1)',
            fontSize: '13px',
            fontWeight: 400,
            lineHeight: 1.6,
            maxWidth: '560px',
            marginBottom: '22px'
          }}
        >
          {t.desc}
        </Text>

        <Button
          icon={<LuBook />}
          theme="light"
          style={{
            borderRadius: '8px',
            fontWeight: 600,
            padding: '8px 16px',
            backgroundColor: 'var(--semi-color-bg-1)',
            border: '1px solid var(--semi-color-border)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
            transition: 'all 0.2s'
          }}
          onClick={() => window.open(t.docsUrl, '_blank')}
        >
          {t.docsBtn}
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
              {t.terminalTitle}
            </span>
          </div>

          <Button
            size="small"
            theme="borderless"
            icon={copied ? <LuCheck style={{ color: '#10b981' }} /> : <LuCopy style={{ color: '#64748b' }} />}
            onClick={handleCopy}
            style={{
              color: copied ? '#10b981' : '#64748b',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '6px',
              padding: '2px 8px',
              height: '24px',
              transition: 'all 0.2s'
            }}
          >
            {copied ? (isDomestic ? '已复制' : 'Copied') : (isDomestic ? '复制' : 'Copy')}
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
            <span style={{ color: '#475569' }}># 1. {isDomestic ? '安装命令行接入工具' : 'Install ModelGo CLI'}</span>
            <br />
            <span style={{ color: '#38bdf8' }}>npm</span> install -g <span style={{ color: '#34d399' }}>modelgo-cli</span>
            <br />
            <br />
            <span style={{ color: '#475569' }}># 2. {isDomestic ? '快捷浏览器登录授权' : 'Auth & login via browser'}</span>
            <br />
            <span style={{ color: '#34d399' }}>modelgo-cli</span> auth <span style={{ color: '#f59e0b' }}>login</span>
          </code>
        </pre>
      </div>
    </div>
  )
}
