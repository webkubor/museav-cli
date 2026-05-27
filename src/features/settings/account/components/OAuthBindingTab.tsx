import React from 'react'
import { Button } from '@douyinfe/semi-ui'
import { useTranslation } from 'react-i18next'
import type { OAuthConnection } from '@/types'

interface OAuthBindingTabProps {
  connections: OAuthConnection[]
}

export const OAuthBindingTab: React.FC<OAuthBindingTabProps> = ({ connections }) => {
  const { t } = useTranslation()
  const PROVIDERS: OAuthConnection['provider'][] = ['google', 'github', 'wechat']

  const connMap = new Map<OAuthConnection['provider'], OAuthConnection>()
  connections.forEach((c) => connMap.set(c.provider, c))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '520px', paddingTop: '8px' }}>
      <div style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', marginBottom: '8px', lineHeight: '1.5' }}>
        {t('account.oauth.desc')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {PROVIDERS.map((provider) => {
          const conn = connMap.get(provider)
          const isBound = !!conn?.connected_at

          return (
            <div
              key={provider}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '10px',
                border: '1px solid var(--semi-color-border)',
                backgroundColor: 'var(--semi-color-bg-1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--semi-color-bg-0)';
                e.currentTarget.style.borderColor = 'var(--brand-glow)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--semi-color-bg-1)';
                e.currentTarget.style.borderColor = 'var(--semi-color-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* 社交/平台高保真 SVG 图标 */}
                {provider === 'google' && (
                  <svg width="20" height="20" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
                    <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.6z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.33-1.58-5.04-3.7H1.07v2.33A9 9 0 0 0 9 18z"/>
                    <path fill="#FBBC05" d="M3.96 10.7a5.4 5.4 0 0 1 0-3.4V4.97H1.07a9 9 0 0 0 0 8.06l2.89-2.33z"/>
                    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.06A9 9 0 0 0 1.07 4.97l2.89 2.33C4.67 5.16 6.66 3.58 9 3.58z"/>
                  </svg>
                )}
                {provider === 'github' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, color: 'var(--semi-color-text-0)' }}>
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                  </svg>
                )}
                {provider === 'wechat' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#07C160" style={{ flexShrink: 0 }}>
                    <path d="M8.5 14c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zm7 0c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM12 3C6.73 3 2.5 6.78 2.5 11.5c0 2.66 1.35 5.02 3.5 6.6l-.8 2.4c-.1.3.1.6.4.5l3.2-1.6c1 .4 2.1.6 3.2.6 5.27 0 9.5-3.78 9.5-8.5S17.27 3 12 3zm6.5 14c-.6.4-1.3.6-2 .8l2 1c.2.1.3.3.2.5l-.5 1.5c-.1.2-.3.3-.5.2l-2-1c-.7.2-1.4.3-2.2.3-3.6 0-6.5-2.2-6.5-5s2.9-5 6.5-5 6.5 2.2 6.5 5c0 1.6-.9 3-2.5 3.7z"/>
                  </svg>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--semi-color-text-0)', fontSize: '14.5px', letterSpacing: '-0.01em' }}>
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
                        color: 'var(--semi-color-text-2)',
                        marginLeft: '10px',
                        backgroundColor: 'var(--semi-color-fill-0)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 500,
                        border: '1px solid var(--semi-color-border)'
                      }}>
                        {t('account.oauth.notBound')}
                      </span>
                    )}
                  </div>
                  {isBound && conn.external_email && (
                    <span style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
                      {t('account.oauth.emailLabel', { email: conn.external_email })}
                    </span>
                  )}
                </div>
              </div>
              <Button 
                size="small" 
                disabled 
                style={{ 
                  borderRadius: '6px', 
                  fontWeight: 600 
                }}
              >
                {isBound ? t('account.oauth.unbind') : t('account.oauth.bind')}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
