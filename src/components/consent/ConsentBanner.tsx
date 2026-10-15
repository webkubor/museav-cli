import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuArrowRight, LuCookie } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { readConsentChoice, recordConsent, type ConsentChoice } from '@/lib/consent'
import { isConsentBannerRequired, isConsentPreviewRequested } from '@/lib/consent-region'

/**
 * Cookie 同意横幅（左下角浮层）。未决定或版本过期时展示；决定后不再出现。
 *
 * 控制台是纯 SPA（无 SSR），所以可以在初始化时直接读 cookie，不需要 effect 同步。
 * 只对名单内国家展示（见 lib/consent-region.ts，国家由浏览器时区推断）；名单外不弹，统计照常（Consent Mode granted）。
 * `?showcookie=1` 为线上验证入口：强制展示，不受地区与本机已存选择影响（见 lib/consent-region.ts）。
 * 接受 / 拒绝两个按钮同层同权重，文案取自 common.consent。
 *
 * 版式对齐官网（modelgo-global-web 的 consent-banner）——2026-10-15 需求方定：
 * 单行「圆形 Cookie 徽标 + 正文 + 按钮同排」，大屏正文限两行与按钮齐平，容器放宽到 max-w-3xl。
 * 按钮颜色/档位仍用控制台自己的 Button（brand 实底 + outline），不照抄官网的白底 CTA。
 */
export function ConsentBanner() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(() => isConsentPreviewRequested() || (isConsentBannerRequired() && readConsentChoice() === null))

  if (!visible) return null

  const choose = (choice: ConsentChoice) => {
    recordConsent(choice)
    setVisible(false)
  }

  return (
    <div className="fixed bottom-4 left-4 z-[var(--mg-z-modal)] w-[calc(100%-2rem)] max-w-3xl md:bottom-6 md:left-6">
      <Card role="region" aria-label={t('common.consent.region')} glass level={2} className="p-3.5 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="flex min-w-0 items-center gap-3.5 md:flex-1 md:gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mg-fill-1 text-brand-base">
              <LuCookie className="size-5" aria-hidden="true" />
            </span>
            {/* 大屏限两行（18px×2 与 size="sm" 按钮齐平）；窄屏不截断，否则会隐藏隐私政策链接 */}
            <p className="min-w-0 text-sm leading-[18px] text-mg-text-2 md:line-clamp-2">
              {t('common.consent.text')}
              <a href="/legal/privacy" className="text-brand-base underline underline-offset-2 hover:opacity-80">
                {t('common.consent.privacyLink')}
              </a>
              {t('common.consent.suffix')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="brand" size="sm" className="cursor-pointer gap-1.5" onClick={() => choose('accept')}>
              {t('common.consent.accept')}
              <LuArrowRight aria-hidden="true" />
            </Button>
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => choose('reject')}>
              {t('common.consent.reject')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
