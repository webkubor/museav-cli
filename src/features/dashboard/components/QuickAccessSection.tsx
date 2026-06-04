import React from 'react'
import { useTranslation } from 'react-i18next'
import { LuArrowUpRight } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'
import './quick-access-section.css'

type QuickIconType = 'models' | 'keys' | 'usage' | 'observability'

interface QuickLink {
  titleKey: string
  descKey: string
  icon: QuickIconType
  path: string
}

function quickPath(path: string, workspaceId: string | null) {
  if (!path.startsWith('workspace:')) return path
  const scopedPath = path.replace('workspace:', '')
  return workspaceId ? `/workspace/${workspaceId}/${scopedPath}` : '/dashboard'
}

function QuickWeb3Icon({ type }: { type: QuickIconType }) {
  const id = `quick-${type}`

  return (
    <svg className="quick-web3-icon" viewBox="0 0 96 96" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="12" y1="10" x2="84" y2="86">
          <stop stopColor="var(--brand-base)" />
          <stop offset="0.48" stopColor="var(--brand-light)" />
          <stop offset="1" stopColor="var(--brand-mid)" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="3.6" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.15 0 0 0 0 0.84 0 0 0 0 0.67 0 0 0 0.58 0"
          />
          <feBlend in="SourceGraphic" />
        </filter>
      </defs>

      <path className="quick-web3-shell" d="M48 8 82 28v40L48 88 14 68V28L48 8Z" />

      {type === 'models' && (
        <>
          <path className="quick-web3-stroke" d="M28 36 48 24l20 12v24L48 72 28 60V36Z" stroke={`url(#${id}-g)`} filter={`url(#${id}-glow)`} />
          <path d="M43 39v18l16-9-16-9Z" fill={`url(#${id}-g)`} />
          <path className="quick-web3-link" d="M28 36 16 28M68 36l12-8M28 60l-12 8M68 60l12 8" stroke={`url(#${id}-g)`} />
        </>
      )}

      {type === 'keys' && (
        <>
          <path className="quick-web3-stroke" d="M48 20c16 0 27 6 27 6v21c0 19-10 30-27 41-17-11-27-22-27-41V26s11-6 27-6Z" stroke={`url(#${id}-g)`} filter={`url(#${id}-glow)`} />
          <circle cx="39" cy="48" r="9" stroke={`url(#${id}-g)`} strokeWidth="5" />
          <path className="quick-web3-stroke" d="M48 48h24M61 48v10M70 48v7" stroke={`url(#${id}-g)`} />
        </>
      )}

      {type === 'usage' && (
        <>
          <path className="quick-web3-grid" d="M24 66h48M24 52h48M24 38h48" />
          <path className="quick-web3-stroke" d="M24 66c8-13 16-16 24-9 10 9 17 5 25-16" stroke={`url(#${id}-g)`} filter={`url(#${id}-glow)`} />
          <path d="M24 66c8-13 16-16 24-9 10 9 17 5 25-16v25H24Z" fill={`url(#${id}-g)`} opacity="0.16" />
        </>
      )}

      {type === 'observability' && (
        <>
          <path className="quick-web3-stroke" d="M30 20h30l12 12v44H30V20Z" stroke={`url(#${id}-g)`} filter={`url(#${id}-glow)`} />
          <path className="quick-web3-link" d="M34 60h15l8-12h16" stroke={`url(#${id}-g)`} />
          <circle cx="73" cy="65" r="10" stroke={`url(#${id}-g)`} strokeWidth="5" />
          <path className="quick-web3-link" d="M80 72l8 8" stroke={`url(#${id}-g)`} />
        </>
      )}

      <circle className="quick-web3-node" cx="16" cy="28" r="4" />
      <circle className="quick-web3-node" cx="80" cy="28" r="4" />
      <circle className="quick-web3-node" cx="16" cy="68" r="4" />
      <circle className="quick-web3-node" cx="80" cy="68" r="4" />
    </svg>
  )
}

export const QuickAccessSection: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const links: QuickLink[] = [
    { titleKey: 'quickAccess.link0.title', descKey: 'quickAccess.link0.desc', icon: 'models',        path: '/models' },
    { titleKey: 'quickAccess.link1.title', descKey: 'quickAccess.link1.desc', icon: 'keys',          path: 'workspace:api-keys' },
    { titleKey: 'quickAccess.link2.title', descKey: 'quickAccess.link2.desc', icon: 'usage',         path: '/usage' },
    { titleKey: 'quickAccess.link5.title', descKey: 'quickAccess.link5.desc', icon: 'observability', path: 'workspace:observability' },
  ]

  return (
    <section className="quick-access-section">
      <p className="text-[11px] font-bold tracking-widest uppercase text-mg-text-2 mb-3">
        {t('quickAccess.sectionTitle')}
      </p>
      <div className="quick-access-grid">
        {links.map((link) => (
          <Card
            key={link.titleKey}
            glass
            hoverable
            onClick={() => navigate(quickPath(link.path, activeWorkspaceId))}
            className="quick-access-card flex flex-col justify-between relative group rounded-2xl border border-mg-border text-left"
          >
            <div>
              <div className="w-14 h-14 flex items-center justify-center">
                <QuickWeb3Icon type={link.icon} />
              </div>
            </div>
            <div className="quick-access-copy">
              <div className="flex-1 min-w-0">
                <strong>{t(link.titleKey)}</strong>
                <span>{t(link.descKey)}</span>
              </div>
              <LuArrowUpRight size={16} className="quick-access-arrow text-brand-base" />
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
