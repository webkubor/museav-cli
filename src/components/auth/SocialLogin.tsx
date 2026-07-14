import { Button } from '@/components/ui/Button'
import { useMarket } from '@/hooks/useMarket'
import { useLangStore } from '@/store/use-brand-store'
import { oauthAuthorizeUrl, type OAuthProvider } from '@/services/auth'
import { useOAuthMethods } from '@/hooks/use-platform-config'
import { OAUTH_ICONS, OAUTH_LABELS } from '@/constants/oauth'

interface Props {
  redirectTo: string
}

export function SocialLogin({ redirectTo }: Props) {
  const market = useMarket()
  const lang = useLangStore((s) => s.lang)
  const oauthMethods = useOAuthMethods()

  const MARKET_FALLBACK: Record<string, string[]> = {
    china:  ['wechat', 'github'],
    global: ['google', 'github'],
  }
  // OAUTH_ICONS 只收录受支持的 provider，过滤后即可安全收窄为 OAuthProvider
  const methods = (oauthMethods.length > 0 ? oauthMethods : (MARKET_FALLBACK[market] ?? []))
    .filter((method): method is OAuthProvider => Boolean(OAUTH_ICONS[method]))

  if (methods.length === 0) return null

  return (
    <>
      <div className="social-divider">
        <div className="social-divider-line" />
        <span className="social-divider-text">{lang === 'zh' ? '或' : 'OR'}</span>
        <div className="social-divider-line" />
      </div>

      <div className="social-btn-group">
        {methods.map((method) => (
          <Button
            key={method}
            variant="secondary"
            className="social-btn"
            onClick={() => { window.location.href = oauthAuthorizeUrl(method, redirectTo) }}
          >
            {OAUTH_ICONS[method]}
            <span>{OAUTH_LABELS[method] ?? method}</span>
          </Button>
        ))}
      </div>
    </>
  )
}
