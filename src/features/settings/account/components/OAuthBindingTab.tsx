import { Button } from '@/components/ui/Button'
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
    ? '解绑后将无法登录你的账号，请先设置密码。'
    : '确认解绑该账号？'

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '520px', paddingTop: '8px' }}>
      <div style={{ fontSize: '13px', color: 'var(--mg-text-2)', marginBottom: '8px', lineHeight: '1.5' }}>
        {t('account.oauth.desc')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {PROVIDERS.map((provider) => {
          const conn = connMap.get(provider)
          const isBound = !!conn?.connected_at
          const isPending = bindMutation.variables === provider && bindMutation.isPending
            || unbindMutation.variables === provider && unbindMutation.isPending

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
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '10px',
                border: '1px solid var(--mg-border)',
                backgroundColor: 'var(--mg-bg-1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--mg-bg-0)';
                e.currentTarget.style.borderColor = 'var(--brand-glow)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--mg-bg-1)';
                e.currentTarget.style.borderColor = 'var(--mg-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  {OAUTH_ICONS_LG[provider]}
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--mg-text-1)', fontSize: '14.5px', letterSpacing: '-0.01em' }}>
                      {t(`account.oauth.${provider}`)}
                    </span>
                    {isBound ? (
                      <span style={{ 
                        fontSize: '12px', 
                        color: 'var(--go-deep)', 
                        marginLeft: '10px',
                        backgroundColor: 'var(--go-pale)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 600,
                        border: '1px solid var(--go-light)'
                      }}>
                        {t('account.oauth.bound')}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '12px',
                        color: 'var(--mg-text-3)',
                        marginLeft: '10px',
                        backgroundColor: 'var(--mg-fill-0)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 500,
                        border: '1px solid var(--mg-border)'
                      }}>
                        {t('account.oauth.notBound')}
                      </span>
                    )}
                  </div>
                  {isBound && conn.external_email && (
                    <span style={{ fontSize: '12px', color: 'var(--mg-text-3)' }}>
                      {t('account.oauth.emailLabel', { email: conn.external_email })}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="small"
                variant={isBound ? "outline" : "brand"}
                loading={isPending}
                disabled={isPending}
                onClick={handleClick}
                style={{
                  borderRadius: '6px',
                  fontWeight: 600
                }}
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
        title="解绑确认"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button size="small" variant="secondary" onClick={handleUnbindCancel}>
              取消
            </Button>
            <Button
              size="small"
              loading={unbindMutation.isPending}
              disabled={unbindMutation.isPending}
              onClick={handleUnbindConfirm}
              style={{ color: isOnlyLoginMethod ? 'var(--mg-danger)' : undefined }}
            >
              确认解绑
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: '14px', color: isOnlyLoginMethod ? 'var(--mg-danger)' : 'var(--mg-text-2)', margin: 0 }}>
          {confirmMessage}
        </p>
      </Modal>
    </>
  )
}
