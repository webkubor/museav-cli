import React from 'react'
import { Button } from '@douyinfe/semi-ui'
import type { OAuthConnection } from '@/types'

interface OAuthBindingTabProps {
  connections: OAuthConnection[]
}

const PROVIDER_LABELS: Record<OAuthConnection['provider'], string> = {
  google: 'Google 账号',
  github: 'GitHub 账号',
  wechat: '微信 账号',
}

export const OAuthBindingTab: React.FC<OAuthBindingTabProps> = ({ connections }) => {
  const PROVIDERS: OAuthConnection['provider'][] = ['google', 'github', 'wechat']

  const connMap = new Map<OAuthConnection['provider'], OAuthConnection>()
  connections.forEach((c) => connMap.set(c.provider, c))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '520px', paddingTop: '8px' }}>
      <div style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', marginBottom: '8px', lineHeight: '1.5' }}>
        绑定第三方社交或代码托管平台账户，支持使用对应的快捷登录入口免密码接入控制台。
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
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--semi-color-bg-1)';
                e.currentTarget.style.borderColor = 'var(--semi-color-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: 'var(--semi-color-text-0)', fontSize: '14.5px', letterSpacing: '-0.01em' }}>
                  {PROVIDER_LABELS[provider]}
                </span>
                {isBound ? (
                  <span style={{ 
                    fontSize: '11.5px', 
                    color: '#059669', 
                    marginLeft: '12px',
                    backgroundColor: '#ecfdf5',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 600,
                    border: '1px solid #a7f3d0'
                  }}>
                    {conn.external_email || '已连接'}
                  </span>
                ) : (
                  <span style={{
                    fontSize: '11.5px',
                    color: 'var(--semi-color-text-1)',
                    marginLeft: '12px',
                    backgroundColor: 'var(--semi-color-fill-0)',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 500,
                    border: '1px solid var(--semi-color-border)'
                  }}>
                    未连接
                  </span>
                )}
              </div>
              <Button 
                size="small" 
                disabled 
                style={{ 
                  borderRadius: '6px', 
                  fontWeight: 600 
                }}
              >
                {isBound ? '解绑' : '连接'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
