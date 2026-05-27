import type { ReactNode } from 'react'
import { Typography } from '@douyinfe/semi-ui'
import { modelGoLogos } from '@/config/brand-assets'
import { getMarket } from '@/lib/market'

const { Title, Text } = Typography

interface AuthLayoutProps {
  title: string
  subtitle?: string
  footer?: ReactNode
  children: ReactNode
}

export function AuthLayout({ title, subtitle, footer, children }: AuthLayoutProps) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src={modelGoLogos[getMarket()]}
            alt="ModelGo"
            style={{ width: '40px', height: '40px', objectFit: 'contain', margin: '0 auto 16px', display: 'block' }}
          />
          <Title heading={3} style={{ margin: '0 0 6px', fontWeight: 700, color: '#0f172a' }}>
            {title}
          </Title>
          {subtitle && (
            <Text style={{ color: '#64748b', fontSize: '13px' }}>{subtitle}</Text>
          )}
        </div>

        {/* Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #f1f5f9',
          boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
          padding: '32px',
        }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            textAlign: 'center',
            marginTop: '20px',
            fontSize: '13px',
            color: '#64748b',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
