import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { readConsentChoice, recordConsent, type ConsentChoice } from '@/lib/consent'
import { currentVisitorNeedsConsent } from '@/lib/consent-scope'

/**
 * Cookie 同意横幅（左下角浮层）。未决定或版本过期时展示；决定后不再出现。
 *
 * 控制台是纯 SPA（无 SSR），所以可以在初始化时直接读 cookie，不需要 effect 同步。
 * 只对名单内国家展示（见 lib/consent-scope.ts）；名单外不弹，已在 index.html 直接 granted 加载。
 * 接受 / 拒绝两个按钮同层同权重，文案取自 common.consent。
 */
export function ConsentBanner() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(() => currentVisitorNeedsConsent() && readConsentChoice() === null)

  if (!visible) return null

  const choose = (choice: ConsentChoice) => {
    recordConsent(choice)
    setVisible(false)
  }

  return (
    <div className="fixed bottom-4 left-4 z-[var(--mg-z-modal)] w-[calc(100%-2rem)] max-w-sm">
      <Card role="region" aria-label={t('common.consent.region')} glass level={2} className="p-4">
        <p className="text-sm leading-relaxed text-mg-text-2">
          {t('common.consent.text')}
          <a href="/legal/privacy" className="text-mg-info underline underline-offset-2 hover:opacity-80">
            {t('common.consent.privacyLink')}
          </a>
          {t('common.consent.suffix')}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="brand" size="sm" onClick={() => choose('accept')}>
            {t('common.consent.accept')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => choose('reject')}>
            {t('common.consent.reject')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
