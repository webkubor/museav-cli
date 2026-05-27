import { Tag, Spin, Typography } from '@douyinfe/semi-ui'
import { useQuery } from '@tanstack/react-query'
import { getPlatformConfig } from '@/services/platform'

const { Title, Text } = Typography

const CHANNEL_LABEL: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信支付',
  stripe: 'Stripe',
}

const LOGIN_LABEL: Record<string, string> = {
  password: '邮箱密码',
  wechat: '微信',
  github: 'GitHub',
  google: 'Google',
}

function ConfigCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--semi-color-bg-0)',
      border: '1px solid var(--semi-color-fill-0)',
      borderRadius: '12px',
      padding: '20px 24px',
      marginBottom: '16px',
    }}>
      <Text style={{ fontSize: '11px', fontWeight: 700, color: 'var(--semi-color-text-2)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '14px' }}>
        {title}
      </Text>
      {children}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '12px' }}>
      <span style={{ fontSize: '13px', color: 'var(--semi-color-text-2)', width: '140px', flexShrink: 0, paddingTop: '2px' }}>{label}</span>
      <div style={{ flex: 1 }}>{value}</div>
    </div>
  )
}

export default function PlatformConfigPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-config'],
    queryFn: getPlatformConfig,
    staleTime: 60_000,
  })

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div>
          <Title heading={4} style={{ margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>平台配置</Title>
          <Text style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
            来源：<code style={{ fontSize: '12px', background: 'var(--semi-color-fill-0)', padding: '1px 6px', borderRadius: '4px' }}>GET /api/v1/platform-config</code>，仅测试环境可见
          </Text>
        </div>
        <Tag style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', fontWeight: 700, fontSize: '11px', borderRadius: '4px' }}>
          TEST ONLY
        </Tag>
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Spin size="large" />
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px 20px', color: '#dc2626', fontSize: '13px' }}>
          接口请求失败：{(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <ConfigCard title="站点信息">
            <FieldRow label="站点标识 (site)" value={
              <Tag style={{ background: 'var(--semi-color-primary-light-default)', color: 'var(--semi-color-primary)', border: 'none', fontWeight: 700 }}>
                {data.site || '—'}
              </Tag>
            } />
            <FieldRow label="结算货币" value={
              <Text style={{ fontSize: '14px', fontWeight: 700, color: 'var(--semi-color-text-0)', fontVariantNumeric: 'tabular-nums' }}>
                {data.settlement_currency || '—'}
              </Text>
            } />
          </ConfigCard>

          <ConfigCard title="登录方式">
            <FieldRow label="已启用 (enabled)" value={
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {data.enabled_login_methods.length === 0
                  ? <Text style={{ color: 'var(--semi-color-text-3)', fontSize: '13px' }}>—</Text>
                  : data.enabled_login_methods.map((m) => (
                    <Tag key={m} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontWeight: 600, borderRadius: '6px' }}>
                      {LOGIN_LABEL[m] ?? m}
                    </Tag>
                  ))
                }
              </div>
            } />
            <FieldRow label="平台支持 (available)" value={
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {data.available_login_methods.length === 0
                  ? <Text style={{ color: 'var(--semi-color-text-3)', fontSize: '13px' }}>—</Text>
                  : data.available_login_methods.map((m) => (
                    <Tag key={m} style={{ background: 'var(--semi-color-fill-0)', color: 'var(--semi-color-text-1)', border: '1px solid var(--semi-color-border)', borderRadius: '6px' }}>
                      {LOGIN_LABEL[m] ?? m}
                    </Tag>
                  ))
                }
              </div>
            } />
          </ConfigCard>

          <ConfigCard title="支付渠道">
            <FieldRow label="已启用 (enabled)" value={
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {data.enabled_channels.length === 0
                  ? <Text style={{ color: 'var(--semi-color-text-3)', fontSize: '13px' }}>—</Text>
                  : data.enabled_channels.map((c) => (
                    <Tag key={c} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontWeight: 600, borderRadius: '6px' }}>
                      {CHANNEL_LABEL[c] ?? c}
                    </Tag>
                  ))
                }
              </div>
            } />
            <FieldRow label="平台支持 (available)" value={
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {data.available_channels.length === 0
                  ? <Text style={{ color: 'var(--semi-color-text-3)', fontSize: '13px' }}>—</Text>
                  : data.available_channels.map((c) => (
                    <Tag key={c} style={{ background: 'var(--semi-color-fill-0)', color: 'var(--semi-color-text-1)', border: '1px solid var(--semi-color-border)', borderRadius: '6px' }}>
                      {CHANNEL_LABEL[c] ?? c}
                    </Tag>
                  ))
                }
              </div>
            } />
          </ConfigCard>
        </>
      )}
    </div>
  )
}
