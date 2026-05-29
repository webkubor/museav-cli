import React from 'react'
import { useTranslation } from 'react-i18next'
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
  titleKey: string
  descKey: string
  icon: React.ReactNode
  path: string
  color: string
  bgColor: string
}

export const QuickAccessSection: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { workspaceId } = useParams()

  const links: QuickLink[] = [
    {
      titleKey: 'quickAccess.link0.title',
      descKey: 'quickAccess.link0.desc',
      icon: <LuBox size={22} />,
      path: '/models',
      color: 'var(--mg-primary)',
      bgColor: 'var(--mg-primary-light)'
    },
    {
      titleKey: 'quickAccess.link1.title',
      descKey: 'quickAccess.link1.desc',
      path: workspaceId ? `/workspace/${workspaceId}/api-keys` : '/api-keys',
      icon: <LuKey size={22} />,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.15)'
    },
    {
      titleKey: 'quickAccess.link2.title',
      descKey: 'quickAccess.link2.desc',
      path: '/usage',
      icon: <LuActivity size={22} />,
      color: 'var(--mg-success)',
      bgColor: 'rgba(16, 185, 129, 0.15)'
    },
    {
      titleKey: 'quickAccess.link3.title',
      descKey: 'quickAccess.link3.desc',
      path: '/billing',
      icon: <LuCreditCard size={22} />,
      color: '#8b5cf6',
      bgColor: 'rgba(139, 92, 246, 0.15)'
    },
    {
      titleKey: 'quickAccess.link4.title',
      descKey: 'quickAccess.link4.desc',
      path: workspaceId ? `/workspace/${workspaceId}/guardrails` : '/guardrails',
      icon: <LuShieldCheck size={22} />,
      color: 'var(--mg-danger)',
      bgColor: 'rgba(239, 68, 68, 0.15)'
    },
    {
      titleKey: 'quickAccess.link5.title',
      descKey: 'quickAccess.link5.desc',
      path: workspaceId ? `/workspace/${workspaceId}/observability` : '/observability',
      icon: <LuLayoutDashboard size={22} />,
      color: '#06b6d4',
      bgColor: 'rgba(6, 182, 212, 0.15)'
    }
  ]

  return (
    <div style={{ marginBottom: '36px' }}>
      <h3 style={{ marginBottom: '16px', fontWeight: 700, fontSize: '16px', color: 'var(--mg-text-0)' }}>
        {t('quickAccess.sectionTitle')}
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
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--mg-text-0)' }}>
                {t(link.titleKey)}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--mg-text-2)', marginTop: '4px', display: 'block' }}>
                {t(link.descKey)}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
