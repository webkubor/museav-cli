import { LuShieldAlert } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/components/auth/use-auth'

/**
 * 403 — 已登录但无访问权限。
 * 典型场景：账号登录成功但不属于任何组织（active_tenant_id 为空），
 * 无法进入控制台。这是「有身份、无授权」，按 403 处理，不回跳登录页。
 */
export default function ForbiddenPage() {
  const { t } = useTranslation()
  // 登出走中央 signOut（logout + 清态 + 跳登录），不再 inline 重复
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-mg-bg-1 px-6">
      <div className="w-full max-w-sm rounded-lg border border-mg-border bg-card-bg p-8 text-center shadow-sm space-y-5">
        <div className="mx-auto w-14 h-14 rounded-lg bg-mg-warning/10 border border-mg-warning/20 flex items-center justify-center">
          <LuShieldAlert size={26} className="text-mg-warning" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-mg-text-1">{t('common.forbidden.pageTitle')}</h1>
          <p className="text-sm text-mg-text-3 leading-relaxed">
            {t('common.forbidden.pageDesc')}
          </p>
        </div>
        <Button variant="outline" onClick={signOut} className="w-full h-10 rounded-md font-semibold">
          {t('common.forbidden.logout')}
        </Button>
      </div>
    </div>
  )
}
