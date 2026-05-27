import { Button } from '@douyinfe/semi-ui'
import { useQuery } from '@tanstack/react-query'
import Google from '@lobehub/icons/es/Google'
import Github from '@lobehub/icons/es/Github'
import { useMarket } from '@/hooks/useMarket'
import { oauthAuthorizeUrl } from '@/services/auth'
import { getPlatformConfig } from '@/services/platform'

interface Props { redirectTo: string }

const dividerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  margin: '20px 0',
}

const lineStyle: React.CSSProperties = {
  flex: 1,
  height: '1px',
  background: '#f1f5f9',
}

const btnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  height: '40px',
  borderRadius: '10px',
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#374151',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
}

function WechatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#07c160" d="M9.5 4C5.36 4 2 6.91 2 10.5c0 2.02 1.06 3.84 2.74 5.04l-.6 2.3 2.36-1.26c.64.18 1.31.28 2 .28.26 0 .52-.01.77-.04A5.54 5.54 0 0 1 9 15.5c0-3.04 2.9-5.5 6.5-5.5.24 0 .48.01.71.04C15.5 6.78 12.78 4 9.5 4zM7 8.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
      <path fill="#07c160" d="M22 15.5c0-2.76-2.69-5-6-5s-6 2.24-6 5 2.69 5 6 5c.77 0 1.51-.13 2.18-.37L20.5 21.5l-.57-1.88C21.21 18.6 22 17.12 22 15.5zm-8.5-1a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
    </svg>
  )
}

const OAUTH_ICONS: Record<string, React.ReactNode> = {
  wechat: <WechatIcon />,
  github: <Github size={16} />,
  google: <Google size={16} />,
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

export function SocialLogin({ redirectTo }: Props) {
  const market = useMarket()

  const { data: platformConfig } = useQuery({
    queryKey: ['platform-config'],
    queryFn: getPlatformConfig,
    staleTime: Infinity,
    retry: 1,
  })

  // 优先用 Swagger 接口返回的启用列表，降级到市场硬编码
  const oauthMethods = (platformConfig?.enabled_login_methods ?? MARKET_FALLBACK[market] ?? [])
    .filter((m) => m !== 'password')

  if (oauthMethods.length === 0) return null

  return (
    <>
      <div style={dividerStyle}>
        <div style={lineStyle} />
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.1em' }}>OR</span>
        <div style={lineStyle} />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {oauthMethods.map((method) => (
          <Button
            key={method}
            style={btnStyle}
            icon={OAUTH_ICONS[method]}
            onClick={() => { window.location.href = oauthAuthorizeUrl(method as any, redirectTo) }}
          >
            {OAUTH_LABELS[method] ?? method}
          </Button>
        ))}
      </div>
    </>
  )
}
