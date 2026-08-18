import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useMarket } from '@/hooks/useMarket'
import { useTranslation } from 'react-i18next'
import { oauthAuthorizeUrl, type OAuthProvider } from '@/services/auth'
import { useOAuthMethods } from '@/hooks/use-platform-config'
import { OAUTH_ICONS, OAUTH_LABELS } from '@/constants/oauth'
import { getCaptchaOutcome } from '@/lib/aliyun-captcha'

interface Props {
  redirectTo: string
}

export function SocialLogin({ redirectTo }: Props) {
  const [pending, setPending] = useState<OAuthProvider | null>(null)
  const market = useMarket()
  const { t } = useTranslation('account')
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

  // 第三方登录同样是一次登录，所以同样要先过人机校验（产品定论 2026-08-14）。
  //
  // 之前这里直接 window.location.href = authorize，不带任何 token：后端在跳去厂商之前先校验，
  // 校验不过就把浏览器 302 回登录页 —— 用户看到的是"点一下立刻跳回来"，既没有滑块也没有提示。
  // 正确顺序是**先解题拿到 token，再带着它导航**。
  const startOAuth = async (method: OAuthProvider) => {
    if (pending) return // 防抖：滑块弹出期间重复点击会开出第二个实例
    setPending(method)
    try {
      const { param, presented } = await getCaptchaOutcome()
      // 拿不到 token 有两种情形，必须分开 —— 用 presented 而不是"是否启用"来分：
      //   - **呈现过**挑战但没解出来（用户关掉弹窗 / 一分钟没动）→ 停在原地。带空 token 导航只会
      //     被后端 302 弹回登录页，那正是这次要修的"点一下立刻弹回来"。
      //   - **呈现不出来**（该环境未启用 / SDK 不可用 / init 失败）→ 照常导航。后端此时也不要求；
      //     堵住会把尚未铺开挑战的站点（国际站）的第三方登录整条掐死。
      if (!param && presented) return
      window.location.href = oauthAuthorizeUrl(method, redirectTo, param)
    } finally {
      setPending(null)
    }
  }

  return (
    <>
      <div className="social-divider">
        <div className="social-divider-line" />
        <span className="social-divider-text">{t('account.auth.social.divider')}</span>
        <div className="social-divider-line" />
      </div>

      <div className="social-btn-group">
        {methods.map((method) => (
          <Button
            key={method}
            variant="secondary"
            className="social-btn"
            disabled={pending !== null}
            onClick={() => { void startOAuth(method) }}
          >
            {OAUTH_ICONS[method]}
            <span>{t(`account.auth.oauth.${method}`, { defaultValue: OAUTH_LABELS[method] ?? method })}</span>
          </Button>
        ))}
      </div>
    </>
  )
}
