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

  // 各市场允许的社交登录集（域名权威）。china 只 wechat/github、global 只 google/github。
  const MARKET_ALLOWED: Record<string, string[]> = {
    china:  ['wechat', 'github'],
    global: ['google', 'github'],
  }
  const allowed = MARKET_ALLOWED[market] ?? []
  // 统一入口判断以「域名 market」为准（对齐 market-domain 铁律：后端配置不得凌驾于域名）：
  // 后端 enabled_login_methods 只能在本市场允许集内取交集——后端错配（如 .ai 误返 wechat, qa#480）
  // 漏不到国外站；后端为空时回退到本市场默认集。避免线上入口不一致。
  // OAUTH_ICONS 只收录受支持的 provider，过滤后即可安全收窄为 OAuthProvider
  const methods = (oauthMethods.length > 0 ? oauthMethods.filter((m) => allowed.includes(m)) : allowed)
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
