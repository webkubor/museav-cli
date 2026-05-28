import { useState } from 'react'
import { Button, Tag, Spin, Typography } from '@douyinfe/semi-ui'
import { useAuthStore } from '@/store/auth'
import { getPlatformConfig } from '@/services/platform'
import { getSession } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import { listModels, listModelTags } from '@/services/catalog'
import { listApiKeys } from '@/services/api-keys'

const { Text } = Typography

type Status = 'idle' | 'loading' | 'success' | 'error'

interface EndpointState {
  status: Status
  data: unknown
  error: string | null
  duration: number | null
}

interface EndpointDef {
  label: string
  method: 'GET' | 'POST'
  path: string
  group: string
  call: () => Promise<unknown>
}

function useEndpointState() {
  const [states, setStates] = useState<Record<string, EndpointState>>({})

  const call = async (key: string, fn: () => Promise<unknown>) => {
    setStates((s) => ({ ...s, [key]: { status: 'loading', data: null, error: null, duration: null } }))
    const t0 = Date.now()
    try {
      const data = await fn()
      setStates((s) => ({ ...s, [key]: { status: 'success', data, error: null, duration: Date.now() - t0 } }))
    } catch (e) {
      setStates((s) => ({ ...s, [key]: { status: 'error', data: null, error: (e as Error).message, duration: Date.now() - t0 } }))
    }
  }

  return { states, call }
}

function EndpointCard({ def, state, onCall }: {
  def: EndpointDef
  state: EndpointState | undefined
  onCall: () => void
}) {
  const methodColor = def.method === 'GET'
    ? { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' }
    : { bg: '#fef3c7', color: '#d97706', border: '#fde68a' }

  return (
    <div style={{
      background: 'var(--semi-color-bg-0)',
      border: '1px solid var(--semi-color-border)',
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '10px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: state?.status === 'idle' || !state ? 'none' : '1px solid var(--semi-color-fill-0)',
      }}>
        <span style={{
          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
          backgroundColor: methodColor.bg, color: methodColor.color, border: `1px solid ${methodColor.border}`,
          flexShrink: 0, fontFamily: 'monospace',
        }}>
          {def.method}
        </span>
        <code style={{ fontSize: '13px', color: 'var(--semi-color-text-0)', flex: 1, fontFamily: 'monospace' }}>
          {def.path}
        </code>
        <Text style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginRight: '8px' }}>{def.label}</Text>
        {state?.duration != null && (
          <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', fontFamily: 'monospace' }}>
            {state.duration}ms
          </span>
        )}
        <Button
          size="small"
          type={state?.status === 'success' ? 'tertiary' : 'primary'}
          loading={state?.status === 'loading'}
          onClick={onCall}
          style={{ flexShrink: 0, fontFamily: 'monospace', fontSize: '12px' }}
        >
          {state?.status === 'success' ? '重新调用' : '调用'}
        </Button>
      </div>

      {state?.status === 'loading' && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <Spin size="middle" />
        </div>
      )}

      {state?.status === 'success' && (
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', top: '8px', right: '8px',
            fontSize: '10px', fontWeight: 700, color: '#16a34a',
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            padding: '1px 6px', borderRadius: '4px',
          }}>
            200 OK
          </div>
          <pre style={{
            margin: 0, padding: '16px',
            fontSize: '12px', lineHeight: 1.6,
            color: 'var(--semi-color-text-0)',
            background: 'var(--semi-color-fill-0)',
            overflowX: 'auto',
            maxHeight: '400px',
            fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
          }}>
            {JSON.stringify(state.data, null, 2)}
          </pre>
        </div>
      )}

      {state?.status === 'error' && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px' }}>
            ERROR
          </span>
          <Text style={{ fontSize: '12px', color: '#dc2626', fontFamily: 'monospace' }}>{state.error}</Text>
        </div>
      )}
    </div>
  )
}

export default function PlatformConfigPage() {
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const endpoints: EndpointDef[] = [
    {
      group: 'Auth',
      label: '当前会话',
      method: 'GET',
      path: '/api/v1/auth/session',
      call: getSession,
    },
    {
      group: 'Platform',
      label: '平台配置',
      method: 'GET',
      path: '/api/v1/platform-config',
      call: getPlatformConfig,
    },
    {
      group: 'Tenant',
      label: '我的组织列表',
      method: 'GET',
      path: '/api/v1/tenants',
      call: listTenants,
    },
    {
      group: 'Workspace',
      label: '工作区列表',
      method: 'GET',
      path: '/api/v1/workspaces',
      call: listWorkspaces,
    },
    ...(activeWorkspaceId ? [{
      group: 'API Keys',
      label: 'API Key 列表',
      method: 'GET' as const,
      path: `/api/v1/workspaces/${activeWorkspaceId}/api-keys`,
      call: () => listApiKeys(activeWorkspaceId),
    }] : []),
    {
      group: 'Catalog',
      label: '模型目录',
      method: 'GET',
      path: '/api/v1/catalog/models',
      call: () => listModels({ limit: 10 }),
    },
    {
      group: 'Catalog',
      label: '模型标签',
      method: 'GET',
      path: '/api/v1/catalog/model-tags',
      call: listModelTags,
    },
  ]

  const { states, call } = useEndpointState()

  const groups = [...new Set(endpoints.map((e) => e.group))]

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            接口调试
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
            点击「调用」发起请求，查看接口实际返回的数据。
          </p>
        </div>
        <Tag style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', fontWeight: 700, fontSize: '11px', borderRadius: '4px', flexShrink: 0 }}>
          DEV ONLY
        </Tag>
      </div>

      {groups.map((group) => (
        <div key={group} style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--semi-color-text-2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
            {group}
          </div>
          {endpoints.filter((e) => e.group === group).map((def) => {
            const key = def.path
            return (
              <EndpointCard
                key={key}
                def={def}
                state={states[key]}
                onCall={() => call(key, def.call)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
