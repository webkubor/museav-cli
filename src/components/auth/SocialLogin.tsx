import { Button } from '@/components/ui/Button'
import { useMarket } from '@/hooks/useMarket'
import { oauthAuthorizeUrl } from '@/services/auth'
import { useOAuthMethods } from '@/hooks/use-platform-config'
import { OAUTH_ICONS, OAUTH_LABELS } from '@/constants/oauth'

interface Props {
  redirectTo: string
}

export function SocialLogin({ redirectTo }: Props) {
  const market = useMarket()
  const oauthMethods = useOAuthMethods()

  const MARKET_FALLBACK: Record<string, string[]> = {
    domestic: ['wechat', 'github'],
    global:   ['google', 'github'],
  }
  const methods = (oauthMethods.length > 0 ? oauthMethods : (MARKET_FALLBACK[market] ?? []))
    .filter((method) => OAUTH_ICONS[method])

  if (methods.length === 0) return null

  return (
    <>
      <div className="social-divider">
        <div className="social-divider-line" />
        <span className="social-divider-text">OR</span>
        <div className="social-divider-line" />
      </div>

      <div className="social-btn-group">
        {methods.map((method) => (
          <Button
            key={method}
            variant="secondary"
            className="social-btn"
            onClick={() => { window.location.href = oauthAuthorizeUrl(method as any, redirectTo) }}
          >
            {OAUTH_ICONS[method]}
            <span>{OAUTH_LABELS[method] ?? method}</span>
          </Button>
        ))}
      </div>
    </>
  )
}
