import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { useAuthStore } from '@/store/auth'
import { deviceApprove } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { Button } from '@/components/ui/Button'
import type { TenantItem } from '@/types'

function isValidUserCode(code: string) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) || /^[A-Z0-9]{8,16}$/.test(code)
}

type PageState =
  | { kind: 'missing_code' }
  | { kind: 'invalid_code' }
  | { kind: 'checking_auth' }
  | { kind: 'loading_tenants'; userCode: string }
  | { kind: 'confirming'; userCode: string; tenants: TenantItem[] }
  | { kind: 'approving'; userCode: string; tenants: TenantItem[] }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

const ROLE_LABELS: Record<string, { zh: string; en: string }> = {
  tenant_owner:  { zh: '拥有者', en: 'Owner' },
  tenant_admin:  { zh: '管理员', en: 'Admin' },
  tenant_member: { zh: '成员',   en: 'Member' },
}

export default function DevicePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const account = useAuthStore((s) => s.account)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  const params = new URLSearchParams(window.location.search)
  const rawCode = params.get('user_code') ?? ''

  const [state, setState] = useState<PageState>({ kind: 'checking_auth' })
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)

  useEffect(() => {
    if (!rawCode) {
      setState({ kind: 'missing_code' })
      return
    }
    if (!isValidUserCode(rawCode.toUpperCase())) {
      setState({ kind: 'invalid_code' })
      return
    }
    if (isLoading) {
      setState({ kind: 'checking_auth' })
      return
    }
    if (!isAuthenticated) {
      const redirect = `/device?user_code=${encodeURIComponent(rawCode)}`
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true })
      return
    }
    loadTenants(rawCode.toUpperCase())
  }, [isLoading, isAuthenticated, rawCode])

  async function loadTenants(userCode: string) {
    setState({ kind: 'loading_tenants', userCode })
    try {
      const res = await listTenants()
      const tenants = res.items ?? []
      const defaultTenant = tenants.find((t) => t.is_default) ?? tenants[0]
      if (defaultTenant) setSelectedTenantId(defaultTenant.tenant_id)
      setState({ kind: 'confirming', userCode, tenants })
    } catch {
      setState({ kind: 'error', message: t('device.error.default') })
    }
  }

  async function handleApprove() {
    if (state.kind !== 'confirming' || !selectedTenantId) return
    const { userCode, tenants } = state
    setState({ kind: 'approving', userCode, tenants })
    try {
      await deviceApprove(userCode, selectedTenantId)
      setState({ kind: 'success' })
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code
      if (code === 40401 || code === 40901) {
        setState({ kind: 'error', message: t(`device.error.${code}`) })
        return
      }
      if (code === 40101) {
        const redirect = `/device?user_code=${encodeURIComponent(userCode)}`
        navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true })
        return
      }
      if (code === 40302) {
        setState({ kind: 'error', message: t('device.error.40302') })
        return
      }
      const msg = (err as { msg?: string })?.msg
      if (msg?.includes('TENANT_NOT_MEMBER')) {
        setSelectedTenantId(null)
        loadTenants(userCode)
        return
      }
      setState({ kind: 'error', message: t('device.error.default') })
    }
  }

  // ── 渲染 ──────────────────────────────────────────────

  if (state.kind === 'missing_code') {
    return (
      <AuthLayout title={t('device.title.missingCode')}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <span style={{ color: 'var(--mg-text-2)', fontSize: '14px' }}>
            {t('device.desc.missingCode')}
          </span>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'invalid_code') {
    return (
      <AuthLayout title={t('device.title.invalidCode')}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <span style={{ color: 'var(--mg-text-2)', fontSize: '14px' }}>
            {t('device.desc.invalidCode')}
          </span>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'checking_auth' || state.kind === 'loading_tenants') {
    return (
      <AuthLayout title={state.kind === 'checking_auth' ? t('device.title.checkingAuth') : t('device.tenant.loading')}>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{
            width: '32px', height: '32px', border: '3px solid var(--mg-border)',
            borderTopColor: 'var(--mg-primary)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto',
          }} />
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'success') {
    return (
      <AuthLayout title={t('device.title.success')}>
        <div style={{ textAlign: 'center', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '40px' }}>✓</div>
          <span style={{ color: 'var(--mg-text-0)', fontSize: '15px', fontWeight: 600 }}>
            {t('device.success.title')}
          </span>
          <span style={{ color: 'var(--mg-text-2)', fontSize: '13px' }}>
            {t('device.success.desc')}
          </span>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'error') {
    return (
      <AuthLayout title={t('device.title.error')}>
        <div style={{ textAlign: 'center', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <span style={{ color: 'var(--mg-danger)', fontSize: '14px' }}>{state.message}</span>
          <Button onClick={() => navigate('/dashboard')} className="rounded-[8px]">
            {t('device.button.backToDashboard')}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // confirming | approving
  const { userCode, tenants } = state
  const isApproving = state.kind === 'approving'
  const isZh = i18n.language?.startsWith('zh')
  const initials = account?.display_name
    ?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '?'
  const selectedTenant = tenants.find((t) => t.tenant_id === selectedTenantId)

  return (
    <AuthLayout
      title={t('device.title.confirm')}
      subtitle={t('device.subtitle.confirm')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* ① 叙事摘要：谁 → 做什么 → 到哪 */}
        <div style={{
          padding: '14px 16px', borderRadius: '10px',
          background: 'var(--mg-bg-1)', border: '1px solid var(--mg-border)',
        }}>
          {/* 当前账号行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              backgroundColor: 'var(--mg-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '11px', fontWeight: 600, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mg-text-0)' }}>
                {account?.display_name ?? '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--mg-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {account?.email ?? '—'}
              </div>
            </div>
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
              background: 'rgba(34,197,94,0.1)', color: 'rgb(22,163,74)', border: '1px solid rgba(34,197,94,0.2)',
              letterSpacing: '0.03em', flexShrink: 0,
            }}>
              {t('device.badge.loggedIn')}
            </span>
          </div>

          {/* 连接指示 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 0 4px 14px',
          }}>
            <div style={{
              width: '1px', height: '14px', background: 'var(--mg-border)', flexShrink: 0,
            }} />
            <span style={{ fontSize: '11px', color: 'var(--mg-text-2)' }}>
              {t('device.flow.arrow')}
            </span>
          </div>

          {/* 目标企业 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 10px', borderRadius: '8px',
            background: selectedTenant ? 'rgba(99,102,241,0.05)' : 'transparent',
            border: selectedTenant ? '1px solid rgba(99,102,241,0.15)' : '1px dashed var(--mg-border)',
            minHeight: '38px',
          }}>
            {selectedTenant ? (
              <>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mg-text-0)' }}>
                  {selectedTenant.name}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
                  background: selectedTenant.type === 'enterprise' ? 'rgba(99,102,241,0.1)' : 'rgba(107,114,128,0.1)',
                  color: selectedTenant.type === 'enterprise' ? 'rgb(79,70,229)' : 'rgb(107,114,128)',
                  border: `1px solid ${selectedTenant.type === 'enterprise' ? 'rgba(99,102,241,0.2)' : 'rgba(107,114,128,0.2)'}`,
                }}>
                  {selectedTenant.type === 'enterprise'
                    ? (isZh ? '企业' : 'Enterprise')
                    : (isZh ? '个人' : 'Personal')}
                </span>
              </>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--mg-text-2)', fontStyle: 'italic' }}>
                {t('device.tenant.placeholder')}
              </span>
            )}
          </div>
        </div>

        {/* ② 企业选择器 */}
        {tenants.length > 1 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--mg-text-2)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('device.tenant.label')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {tenants.map((tenant) => {
                const selected = selectedTenantId === tenant.tenant_id
                const roleLabel = ROLE_LABELS[tenant.role]
                return (
                  <button
                    key={tenant.tenant_id}
                    type="button"
                    disabled={isApproving}
                    onClick={() => setSelectedTenantId(tenant.tenant_id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px',
                      background: selected ? 'var(--mg-bg-1)' : 'transparent',
                      border: `1.5px solid ${selected ? 'var(--mg-primary)' : 'var(--mg-border)'}`,
                      cursor: isApproving ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'left', width: '100%',
                      opacity: isApproving ? 0.6 : 1,
                    }}
                  >
                    <div style={{
                      width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${selected ? 'var(--mg-primary)' : 'var(--mg-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && (
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'var(--mg-primary)' }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mg-text-0)' }}>
                          {tenant.name}
                        </span>
                        {tenant.is_default && (
                          <span style={{
                            fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px',
                            background: 'var(--mg-primary)', color: '#fff', lineHeight: '14px',
                          }}>
                            {t('header.default')}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--mg-text-2)', marginTop: '1px' }}>
                        {tenant.slug} · {roleLabel ? (isZh ? roleLabel.zh : roleLabel.en) : tenant.role}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ③ 授权码 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '8px 0',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--mg-text-2)' }}>
            {t('device.codeLabel')}
          </span>
          <code style={{
            letterSpacing: '0.12em', fontFamily: 'monospace',
            color: 'var(--mg-text-0)', fontSize: '15px', fontWeight: 700,
          }}>
            {userCode}
          </code>
        </div>

        {/* ④ 操作按钮 */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            variant="outline"
            style={{ flex: 1, height: '40px', borderRadius: '8px' }}
            disabled={isApproving}
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            {t('device.button.cancel')}
          </Button>
          <Button
            variant="default"
            style={{ flex: 2, height: '40px', borderRadius: '8px', fontWeight: 600 }}
            disabled={!selectedTenantId}
            onClick={handleApprove}
          >
            {isApproving ? t('device.button.approving') : t('device.button.approve')}
          </Button>
        </div>

        <span style={{ fontSize: '11px', color: 'var(--mg-text-2)', textAlign: 'center', display: 'block' }}>
          {t('device.footer')}
        </span>
      </div>
    </AuthLayout>
  )
}
