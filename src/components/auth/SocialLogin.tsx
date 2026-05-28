import { Button } from '@douyinfe/semi-ui'
import Google from '@lobehub/icons/es/Google'
import Github from '@lobehub/icons/es/Github'
import { WechatIcon } from '@/components/icons/WechatIcon'
import { useMarket } from '@/hooks/useMarket'
import { oauthAuthorizeUrl } from '@/services/auth'
import { usePlatformConfig } from '@/hooks/use-platform-config'

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

const OAUTH_ICONS: Record<string, React.ReactNode> = {
  wechat: <WechatIcon size={16} />,
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

  const { data: platformConfig } = usePlatformConfig()

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
