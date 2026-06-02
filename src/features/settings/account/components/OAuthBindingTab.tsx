import { Button } from '@/components/ui/Button'
import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePlatformConfig } from '@/hooks/use-platform-config'

import { useTranslation } from 'react-i18next'
import Google from '@lobehub/icons/es/Google'
import Github from '@lobehub/icons/es/Github'
import type { OAuthConnection } from '@/types'
import { SiWechat } from 'react-icons/si'
import { connectOAuth, disconnectOAuth } from '@/services/account'
import { appToast } from '@/lib/app-toast'
import type { OAuthProvider } from '@/interfaces/account'

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  google: <Google size={20} />,
  github: <Github size={20} />,
  wechat: <SiWechat size={20} color="#07C160" />,
}

interface OAuthBindingTabProps {
  connections: OAuthConnection[]
}

export const OAuthBindingTab: React.FC<OAuthBindingTabProps> = ({ connections }) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: platformConfig } = usePlatformConfig()
  const PROVIDERS = (
    platformConfig?.enabled_login_methods?.filter((m) => m !== 'password') ??
    ['google', 'github', 'wechat']
  ) as OAuthProvider[]

  const bindMutation = useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const redirect = `${window.location.pathname}?tab=oauth`
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '520px', paddingTop: '8px' }}>
      <div style={{ fontSize: '13px', color: 'var(--mg-text-1)', marginBottom: '8px', lineHeight: '1.5' }}>
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
              unbindMutation.mutate(provider)
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
                  {PROVIDER_ICONS[provider]}
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--mg-text-0)', fontSize: '14.5px', letterSpacing: '-0.01em' }}>
                      {t(`account.oauth.${provider}`)}
                    </span>
                    {isBound ? (
                      <span style={{ 
                        fontSize: '11px', 
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
                        fontSize: '11px',
                        color: 'var(--mg-text-2)',
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
                    <span style={{ fontSize: '12px', color: 'var(--mg-text-2)' }}>
                      {t('account.oauth.emailLabel', { email: conn.external_email })}
                    </span>
                  )}
                </div>
              </div>
              <Button 
                size="small" 
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
  )
}
