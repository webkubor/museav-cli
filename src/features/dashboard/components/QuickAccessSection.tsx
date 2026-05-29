import React from 'react'
import {
  LuBox,
  LuKey,
  LuActivity,
  LuCreditCard,
  LuShieldCheck,
  LuLayoutDashboard
} from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'

interface QuickLink {
  title: string
  desc: string
  icon: React.ReactNode
  path: string
  color: string
  bgColor: string
}

export const QuickAccessSection: React.FC = () => {
  const navigate = useNavigate()
  const { workspaceId } = useParams()

  const links: QuickLink[] = [
    {
      title: '模型仓库',
      desc: '探索与管理可用模型',
      icon: <LuBox size={22} />,
      path: '/models',
      color: 'var(--semi-color-primary)',
      bgColor: 'var(--semi-color-primary-light-default)'
    },
    {
      title: 'API 密钥',
      desc: '创建并管理访问令牌',
      path: workspaceId ? `/workspace/${workspaceId}/api-keys` : '/api-keys',
      icon: <LuKey size={22} />,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.15)'
    },
    {
      title: '用量统计',
      desc: '监控 API 调用与消耗',
      path: '/usage',
      icon: <LuActivity size={22} />,
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.15)'
    },
    {
      title: '财务账单',
      desc: '充值余额与下载发票',
      path: '/billing',
      icon: <LuCreditCard size={22} />,
      color: '#8b5cf6',
      bgColor: 'rgba(139, 92, 246, 0.15)'
    },
    {
      title: '内容安全',
      desc: '配置模型过滤护栏',
      path: workspaceId ? `/workspace/${workspaceId}/guardrails` : '/guardrails',
      icon: <LuShieldCheck size={22} />,
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.15)'
    },
    {
      title: '可观测性',
      desc: '查看实时调用审计日志',
      path: workspaceId ? `/workspace/${workspaceId}/observability` : '/observability',
      icon: <LuLayoutDashboard size={22} />,
      color: '#06b6d4',
      bgColor: 'rgba(6, 182, 212, 0.15)'
    }
  ]

  return (
    <div style={{ marginBottom: '36px' }}>
      <h3 style={{ marginBottom: '16px', fontWeight: 700, fontSize: '16px', color: 'var(--semi-color-text-0)' }}>
        快捷功能入口
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {links.map((link, idx) => (
          <Card
            key={idx}
            hoverable
            onClick={() => navigate(link.path)}
            className="p-5 flex flex-col gap-3 cursor-pointer group"
          >
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: link.bgColor,
              color: link.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease'
            }} className="group-hover:scale-110">
              {link.icon}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
                {link.title}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginTop: '4px', display: 'block' }}>
                {link.desc}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
