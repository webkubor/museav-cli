import { Button } from '@douyinfe/semi-ui'
import Google from '@lobehub/icons/es/Google'
import Github from '@lobehub/icons/es/Github'
import { useMarket } from '@/hooks/useMarket'
import { oauthAuthorizeUrl } from '@/services/auth'

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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#07c160' }}>
      <path d="M8.5 13.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM2 8.5C2 4.91 6.48 2 12 2s10 2.91 10 6.5-4.48 6.5-10 6.5a12.87 12.87 0 0 1-2.8-.31L5.5 16.5l1.27-2.84A5.9 5.9 0 0 1 2 8.5z"/>
    </svg>
  )
}

export function SocialLogin({ redirectTo }: Props) {
  const market = useMarket()

  return (
    <>
      <div style={dividerStyle}>
        <div style={lineStyle} />
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.1em' }}>OR</span>
        <div style={lineStyle} />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {market === 'domestic' ? (
          <>
            <Button
              style={btnStyle}
              icon={<WechatIcon />}
              onClick={() => { window.location.href = oauthAuthorizeUrl('wechat', redirectTo) }}
            >
              微信
            </Button>
            <Button
              style={btnStyle}
              icon={<Github size={16} />}
              onClick={() => { window.location.href = oauthAuthorizeUrl('github', redirectTo) }}
            >
              GitHub
            </Button>
          </>
        ) : (
          <>
            <Button
              style={btnStyle}
              icon={<Google size={16} />}
              onClick={() => { window.location.href = oauthAuthorizeUrl('google', redirectTo) }}
            >
              Google
            </Button>
            <Button
              style={btnStyle}
              icon={<Github size={16} />}
              onClick={() => { window.location.href = oauthAuthorizeUrl('github', redirectTo) }}
            >
              GitHub
            </Button>
          </>
        )}
      </div>
    </>
  )
}
