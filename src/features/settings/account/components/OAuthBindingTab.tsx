import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOAuthMethods } from '@/hooks/use-platform-config'
import { useTranslation } from 'react-i18next'
import type { OAuthConnection } from '@/types'
import { connectOAuth, disconnectOAuth } from '@/services/account'
import { appToast } from '@/lib/app-toast'
import type { OAuthProvider } from '@/interfaces/account'
import { OAUTH_ICONS_LG } from '@/constants/oauth'
import { Modal } from '@/components/ui/Modal'

interface OAuthBindingTabProps {
  connections: OAuthConnection[]
}

export const OAuthBindingTab: React.FC<OAuthBindingTabProps> = ({ connections }) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const PROVIDERS = useOAuthMethods() as OAuthProvider[]
  const [pendingUnbind, setPendingUnbind] = useState<OAuthProvider | null>(null)

  const bindMutation = useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const redirect = `${window.location.origin}${window.location.pathname}?tab=security`
      return connectOAuth(provider, redirect)
    },
    onSuccess: (result) => {
      window.location.assign(result.authorize_url)
    },
    onError: (error) => {
      appToast.requestError(error, t('account.oauth.bindError'))
    },
  })

  const unbindMutation = useMutation({
    mutationFn: (provider: OAuthProvider) => disconnectOAuth(provider),
    onSuccess: () => {
      appToast.success(t('account.oauth.unbindSuccess'))
      queryClient.invalidateQueries({ queryKey: ['account-profile'] })
    },
    onError: (error) => {
      appToast.requestError(error, t('account.oauth.unbindError'))
    },
  })

  const connMap = new Map<OAuthProvider, OAuthConnection>()
  connections.forEach((c) => connMap.set(c.provider, c))

  const boundCount = connections.filter((c) => !!c.connected_at).length
  const isOnlyLoginMethod = boundCount === 1

  const handleUnbindClick = (provider: OAuthProvider) => {
    setPendingUnbind(provider)
  }

  const handleUnbindConfirm = () => {
    if (pendingUnbind) {
      unbindMutation.mutate(pendingUnbind)
    }
    setPendingUnbind(null)
  }

  const handleUnbindCancel = () => {
    setPendingUnbind(null)
  }

  const confirmMessage = isOnlyLoginMethod
    ? t('account.oauth.unbindOnlyLoginMethod')
    : t('account.oauth.unbindConfirmMessage')

  return (
    <>
      {/* OAuth 绑定区——不自带卡片，作为「安全与登录」统一卡片内的一段分隔行 */}
      <div className="pt-5">
        <div className="mb-4 text-xs leading-relaxed text-mg-text-2">
          {t('account.oauth.desc')}
        </div>

        <div className="flex flex-col">
          {PROVIDERS.map((provider) => {
            const conn = connMap.get(provider)
            const isBound = !!conn?.connected_at
            const isPending = (bindMutation.variables === provider && bindMutation.isPending)
              || (unbindMutation.variables === provider && unbindMutation.isPending)

            const handleClick = () => {
              if (isBound) {
                handleUnbindClick(provider)
                return
              }
              bindMutation.mutate(provider)
            }

            return (
              <div
                key={provider}
                className="flex items-center justify-between gap-4 py-3.5 border-b border-mg-border/40 last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 flex items-center">{OAUTH_ICONS_LG[provider]}</span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-semibold text-mg-text-1">
                        {t(`account.oauth.${provider}`)}
                      </span>
                      <Badge variant={isBound ? 'success' : 'secondary'} size="sm">
                        {t(isBound ? 'account.oauth.bound' : 'account.oauth.notBound')}
                      </Badge>
                    </div>
                    {isBound && conn.external_email && (
                      <span className="text-xs text-mg-text-3">
                        {t('account.oauth.emailLabel', { email: conn.external_email })}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="small"
                  variant={isBound ? 'outline' : 'brand'}
                  loading={isPending}
                  disabled={isPending}
                  onClick={handleClick}
                >
                  {isPending
                    ? t('account.oauth.processing')
                    : isBound ? t('account.oauth.unbind') : t('account.oauth.bind')}
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      <Modal
        open={pendingUnbind !== null}
        onClose={handleUnbindCancel}
        size="sm"
        title={t('account.oauth.unbindConfirmTitle')}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="small" variant="secondary" onClick={handleUnbindCancel}>
              {t('common.cancel')}
            </Button>
            <Button
              size="small"
              variant="brand"
              loading={unbindMutation.isPending}
              disabled={unbindMutation.isPending}
              onClick={handleUnbindConfirm}
              className={isOnlyLoginMethod ? 'text-mg-danger' : undefined}
            >
              {t('account.oauth.unbindConfirm')}
            </Button>
          </div>
        }
      >
        <p className={`m-0 text-sm ${isOnlyLoginMethod ? 'text-mg-danger' : 'text-mg-text-2'}`}>
          {confirmMessage}
        </p>
      </Modal>
    </>
  )
}
