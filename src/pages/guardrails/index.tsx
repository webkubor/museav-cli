import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Select, Toast, Skeleton } from '@douyinfe/semi-ui'
import { useAuthStore } from '@/store/auth'
import {
  listGuardrails,
  createGuardrail,
  updateGuardrail,
  replaceAssignments,
  addBudgetPolicy,
  deleteBudgetPolicy,
} from '@/services/guardrails'
import { listWorkspaceMembers } from '@/services/workspaces'
import { listApiKeys } from '@/services/api-keys'
import { pageItems } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'
import type {
  AssignmentInput,
  GuardrailBudgetPolicy,
  GuardrailDetail,
} from '@/interfaces/guardrails'
import type { WorkspaceMember, ApiKeyItem } from '@/types'
import { GUARDRAIL_STATUS_CONFIG, ENFORCEMENT_CONFIG, PERIOD_LABEL } from '@/constants/status'
import { useCurrency } from '@/hooks/use-platform-config'

// ── Styles ──────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  padding: '24px',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  marginBottom: '20px',
}

const listCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  overflow: 'hidden',
}



// ── Main page ────────────────────────────────────────────────────────────────

export default function GuardrailsPage() {
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  const listQuery = useQuery({
    queryKey: ['guardrails', activeWorkspaceId],
    queryFn: () => listGuardrails(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const guardrails = listQuery.data?.items ?? []
  const selected = guardrails.find((g) => g.id === selectedId) ?? guardrails[0] ?? null

  const membersQuery = useQuery({
    queryKey: ['workspace-members', activeWorkspaceId],
    queryFn: () => listWorkspaceMembers(activeWorkspaceId!, { page_size: 50 }),
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      createGuardrail(activeWorkspaceId!, body),
    onSuccess: (data) => {
      Toast.success('护栏已创建')
      setSelectedId(data.id)
      setCreateOpen(false)
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '创建失败'
      Toast.error(msg)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: GuardrailDetail['status'] }) =>
      updateGuardrail(id, { status }),
    onSuccess: () => {
      Toast.success('状态已更新')
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '更新失败'
      Toast.error(msg)
    },
  })

  const addPolicyMutation = useMutation({
    mutationFn: (body: Parameters<typeof addBudgetPolicy>[1]) => {
      if (!selected) return Promise.reject(new Error('no guardrail selected'))
      return addBudgetPolicy(selected.id, body)
    },
    onSuccess: () => {
      Toast.success('预算策略已添加')
      setPolicyOpen(false)
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '添加失败'
      Toast.error(msg)
    },
  })

  const deletePolicyMutation = useMutation({
    mutationFn: (policyId: string) => {
      if (!selected) return Promise.reject(new Error('no guardrail selected'))
      return deleteBudgetPolicy(selected.id, policyId)
    },
    onSuccess: () => {
      Toast.success('预算策略已删除')
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '删除失败'
      Toast.error(msg)
    },
  })

  const assignMutation = useMutation({
    mutationFn: (assignments: Parameters<typeof replaceAssignments>[1]) => {
      if (!selected) return Promise.reject(new Error('no guardrail selected'))
      return replaceAssignments(selected.id, assignments)
    },
    onSuccess: () => {
      Toast.success('绑定对象已更新')
      setAssignOpen(false)
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '更新失败'
      Toast.error(msg)
    },
  })

  function memberName(accountId: string) {
    const m = pageItems(membersQuery.data).find((m) => m.account?.account_id === accountId)
    return m?.account?.display_name ?? accountId
  }

  function apiKeyName(keyId: string) {
    const k = pageItems(apiKeysQuery.data).find((k) => k.api_key_id === keyId)
    return k?.name ?? keyId
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '32px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>
            安全护栏
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--semi-color-text-1)', margin: '6px 0 0' }}>
            为成员或 API Key 设置用量限额和限速策略，保障资源安全。
          </p>
        </div>
        <Button theme="solid" type="primary" onClick={() => setCreateOpen(true)}>
          + 新建护栏
        </Button>
      </div>

      {/* Two-column layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px minmax(0, 1fr)',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left: list */}
        <div style={listCardStyle}>
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--semi-color-fill-0)',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--semi-color-text-2)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            已配置护栏
          </div>

          {listQuery.isLoading ? (
            <div style={{ padding: '20px' }}>
              <Skeleton.Title style={{ width: '100%', marginBottom: '12px' }} />
              <Skeleton.Title style={{ width: '100%' }} />
            </div>
          ) : guardrails.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--semi-color-text-2)',
                fontSize: '13px',
                fontStyle: 'italic',
              }}
            >
              暂无护栏
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {guardrails.map((g) => {
                const isActive = selected?.id === g.id
                return (
                  <li
                    key={g.id}
                    onClick={() => setSelectedId(g.id)}
                    style={{
                      padding: '14px 20px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--semi-color-bg-1)',
                      backgroundColor: isActive ? '#eff6ff' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: isActive ? '#2563eb' : 'var(--semi-color-text-0)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {g.name}
                      </p>
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: '4px',
                          padding: '1px 8px',
                          borderRadius: '100px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: GUARDRAIL_STATUS_CONFIG[g.status].bg,
                          color: GUARDRAIL_STATUS_CONFIG[g.status].color,
                        }}
                      >
                        {GUARDRAIL_STATUS_CONFIG[g.status].label}
                      </span>
                    </div>
                    <span style={{ color: isActive ? '#2563eb' : 'var(--semi-color-text-3)', fontSize: '16px' }}>
                      ›
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Right: detail */}
        {selected ? (
          <div>
            {/* Basic info card */}
            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                  marginBottom: '24px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h2
                    style={{ fontSize: '18px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}
                  >
                    {selected.name}
                  </h2>
                  {selected.description && (
                    <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: '6px 0 0' }}>
                      {selected.description}
                    </p>
                  )}
                </div>
                <Select
                  value={selected.status}
                  onChange={(v) =>
                    statusMutation.mutate({
                      id: selected.id,
                      status: v as GuardrailDetail['status'],
                    })
                  }
                  style={{ width: '120px' }}
                >
                  <Select.Option value="active">启用</Select.Option>
                  <Select.Option value="inactive">停用</Select.Option>
                  <Select.Option value="archived">归档</Select.Option>
                </Select>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '24px',
                  paddingTop: '20px',
                  borderTop: '1px solid var(--semi-color-fill-0)',
                }}
              >
                <MetaItem label="优先级" value={selected.priority ?? '默认'} />
                <MetaItem label="默认策略" value={selected.is_default ? '是' : '否'} />
                <MetaItem label="创建于" value={formatDateTime(selected.created_at)} />
                <MetaItem label="最近更新" value={formatDateTime(selected.updated_at)} />
              </div>
            </div>

            {/* Assignments card */}
            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '20px',
                }}
              >
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--semi-color-text-0)', margin: 0 }}>
                  绑定对象
                </p>
                <Button size="small" onClick={() => setAssignOpen(true)}>
                  管理
                </Button>
              </div>

              {selected.assignments.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    border: '1px dashed var(--semi-color-border)',
                    borderRadius: '10px',
                    color: 'var(--semi-color-text-2)',
                    fontSize: '13px',
                    fontStyle: 'italic',
                  }}
                >
                  暂未绑定任何成员或 API Key
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {selected.assignments.map((a) => (
                    <span
                      key={a.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 14px',
                        borderRadius: '100px',
                        border: '1px solid var(--semi-color-border)',
                        backgroundColor: 'var(--semi-color-bg-1)',
                        fontSize: '12.5px',
                        color: 'var(--semi-color-text-1)',
                        fontWeight: 500,
                      }}
                    >
                      <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)' }}>
                        {a.subject_type === 'member' ? '成员' : 'Key'}
                      </span>
                      {a.subject_type === 'member'
                        ? memberName(a.account_id)
                        : apiKeyName(a.api_key_id)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Budget policies card */}
            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '20px',
                }}
              >
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--semi-color-text-0)', margin: 0 }}>
                  预算策略
                </p>
                <Button theme="solid" type="primary" size="small" onClick={() => setPolicyOpen(true)}>
                  + 添加策略
                </Button>
              </div>

              {selected.budget_policies.length === 0 ? (
                <div
                  style={{
                    padding: '40px',
                    textAlign: 'center',
                    border: '1px dashed var(--semi-color-border)',
                    borderRadius: '10px',
                    color: 'var(--semi-color-text-2)',
                    fontSize: '13px',
                    fontStyle: 'italic',
                  }}
                >
                  暂无活跃的预算或限流策略
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selected.budget_policies.map((p) => (
                    <PolicyCard
                      key={p.id}
                      policy={p}
                      onDelete={() => deletePolicyMutation.mutate(p.id)}
                      isDeleting={deletePolicyMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          !listQuery.isLoading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '360px',
                borderRadius: '12px',
                border: '1px solid var(--semi-color-fill-0)',
                backgroundColor: 'var(--semi-color-bg-1)',
                textAlign: 'center',
                padding: '48px',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.25 }}>🛡</div>
              <p style={{ fontSize: '15px', color: 'var(--semi-color-text-2)' }}>
                请从左侧选择一个护栏以查看或编辑详细策略
              </p>
            </div>
          )
        )}
      </div>

      {/* Create guardrail modal */}
      <CreateGuardrailModal
        open={createOpen}
        isPending={createMutation.isPending}
        onConfirm={(name, description) => createMutation.mutate({ name, description })}
        onCancel={() => setCreateOpen(false)}
      />

      {/* Add budget policy modal */}
      {selected && (
        <AddBudgetPolicyModal
          open={policyOpen}
          isPending={addPolicyMutation.isPending}
          onConfirm={(body) => addPolicyMutation.mutate(body)}
          onCancel={() => setPolicyOpen(false)}
        />
      )}

      {/* Manage assignments modal */}
      {selected && (
        <ManageAssignmentsModal
          open={assignOpen}
          isPending={assignMutation.isPending}
          current={selected.assignments}
          members={membersQuery.data?.items ?? []}
          apiKeys={apiKeysQuery.data?.items ?? []}
          onConfirm={(assignments) => assignMutation.mutate(assignments)}
          onCancel={() => setAssignOpen(false)}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p
        style={{
          fontSize: '10px',
          fontWeight: 700,
          color: 'var(--semi-color-text-2)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: '0 0 4px',
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--semi-color-text-0)', margin: 0 }}>{value}</p>
    </div>
  )
}

function PolicyCard({
  policy: p,
  onDelete,
  isDeleting,
}: {
  policy: GuardrailBudgetPolicy
  onDelete: () => void
  isDeleting: boolean
}) {
  const enforcementCfg = ENFORCEMENT_CONFIG[p.enforcement_mode]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '16px 20px',
        borderRadius: '10px',
        border: '1px solid var(--semi-color-fill-0)',
        backgroundColor: 'var(--semi-color-bg-1)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '10px',
          }}
        >
          <span
            style={{
              padding: '2px 10px',
              borderRadius: '100px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor:
                p.enforcement_mode === 'hard_limit'
                  ? '#fef2f2'
                  : p.enforcement_mode === 'soft_limit'
                    ? '#fffbeb'
                    : 'var(--semi-color-bg-1)',
              color: enforcementCfg.color,
              border: `1px solid ${
                p.enforcement_mode === 'hard_limit'
                  ? '#fecaca'
                  : p.enforcement_mode === 'soft_limit'
                    ? '#fde68a'
                    : 'var(--semi-color-border)'
              }`,
            }}
          >
            {enforcementCfg.label}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
            每 {p.period_length > 1 ? p.period_length : ''}
            {PERIOD_LABEL[p.period_unit]} 重置
            <span style={{ margin: '0 8px', color: 'var(--semi-color-text-3)' }}>|</span>
            {p.aggregation_scope === 'per_member'
              ? '按成员独立计算'
              : p.aggregation_scope === 'per_api_key'
                ? '按密钥独立计算'
                : '护栏内整体累计'}
          </span>
          {!p.enabled && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '100px',
                fontSize: '11px',
                backgroundColor: 'var(--semi-color-fill-0)',
                color: 'var(--semi-color-text-2)',
              }}
            >
              已停用
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {p.spend_limit_amount && parseFloat(p.spend_limit_amount) > 0 && (
            <PolicyMeta label="最高预算" value={`${p.currency} ${p.spend_limit_amount}`} />
          )}
          {p.token_limit > 0 && (
            <PolicyMeta label="TOKEN 上限" value={p.token_limit.toLocaleString()} />
          )}
          {p.request_limit > 0 && (
            <PolicyMeta label="请求上限" value={p.request_limit.toLocaleString()} />
          )}
          {p.rate_request_limit > 0 && (
            <PolicyMeta
              label="当前限速"
              value={`${p.rate_request_limit} req / ${p.rate_window_seconds}s`}
            />
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        style={{
          flexShrink: 0,
          marginTop: '2px',
          padding: '6px 8px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          color: 'var(--semi-color-text-3)',
          fontSize: '14px',
          lineHeight: 1,
        }}
        title="删除策略"
      >
        ✕
      </button>
    </div>
  )
}

function PolicyMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 700,
          color: 'var(--semi-color-text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}:
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
        {value}
      </span>
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

function CreateGuardrailModal({
  open,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  isPending: boolean
  onConfirm: (name: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  function handleConfirm() {
    if (!name.trim()) {
      Toast.error('请输入护栏名称')
      return
    }
    onConfirm(name.trim(), description.trim())
  }

  return (
    <Modal
      title="新建安全护栏"
      visible={open}
      onCancel={onCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button theme="solid" type="primary" loading={isPending} onClick={handleConfirm}>
            创建护栏
          </Button>
        </div>
      }
      width={440}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '8px 0' }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--semi-color-text-1)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            护栏名称
          </label>
          <Input
            value={name}
            onChange={(v) => setName(v)}
            placeholder="例如：免费用户限额"
            autoFocus
            onEnterPress={handleConfirm}
            size="large"
          />
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--semi-color-text-1)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            描述（可选）
          </label>
          <Input
            value={description}
            onChange={(v) => setDescription(v)}
            placeholder="简短说明用途"
            size="large"
          />
        </div>
      </div>
    </Modal>
  )
}

function AddBudgetPolicyModal({
  open,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  isPending: boolean
  onConfirm: (body: Parameters<typeof addBudgetPolicy>[1]) => void
  onCancel: () => void
}) {
  const { currency } = useCurrency()
  const [scope, setScope] = useState<'guardrail_total' | 'per_member' | 'per_api_key'>(
    'guardrail_total'
  )
  const [periodUnit, setPeriodUnit] = useState<'hour' | 'day' | 'week' | 'month'>('month')
  const [enforcement, setEnforcement] = useState<'monitor' | 'soft_limit' | 'hard_limit'>(
    'hard_limit'
  )
  const [spendLimit, setSpendLimit] = useState('')
  const [tokenLimit, setTokenLimit] = useState('')
  const [requestLimit, setRequestLimit] = useState('')

  function handleConfirm() {
    const body: Parameters<typeof addBudgetPolicy>[1] = {
      aggregation_scope: scope,
      period_unit: periodUnit,
      enforcement_mode: enforcement,
      enabled: true,
    }
    if (spendLimit && parseFloat(spendLimit) > 0) {
      body.spend_limit_amount = spendLimit
      body.currency = currency
    }
    if (tokenLimit && parseInt(tokenLimit) > 0) body.token_limit = parseInt(tokenLimit)
    if (requestLimit && parseInt(requestLimit) > 0) body.request_limit = parseInt(requestLimit)
    onConfirm(body)
  }

  const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--semi-color-text-1)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '8px',
  }

  return (
    <Modal
      title="添加预算与限流策略"
      visible={open}
      onCancel={onCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button theme="solid" type="primary" loading={isPending} onClick={handleConfirm}>
            确认添加
          </Button>
        </div>
      }
      width={500}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '8px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={fieldLabelStyle}>聚合维度</label>
            <Select
              value={scope}
              onChange={(v) => setScope(v as typeof scope)}
              style={{ width: '100%' }}
            >
              <Select.Option value="guardrail_total">护栏内整体</Select.Option>
              <Select.Option value="per_member">按成员独立</Select.Option>
              <Select.Option value="per_api_key">按 API Key 独立</Select.Option>
            </Select>
          </div>
          <div>
            <label style={fieldLabelStyle}>重置周期</label>
            <Select
              value={periodUnit}
              onChange={(v) => setPeriodUnit(v as typeof periodUnit)}
              style={{ width: '100%' }}
            >
              <Select.Option value="hour">每小时</Select.Option>
              <Select.Option value="day">每天</Select.Option>
              <Select.Option value="week">每周</Select.Option>
              <Select.Option value="month">每月</Select.Option>
            </Select>
          </div>
        </div>

        <div>
          <label style={fieldLabelStyle}>强制执行模式</label>
          <Select
            value={enforcement}
            onChange={(v) => setEnforcement(v as typeof enforcement)}
            style={{ width: '100%' }}
          >
            <Select.Option value="monitor">仅监控（记录不拦截）</Select.Option>
            <Select.Option value="soft_limit">软限制（超额发送告警）</Select.Option>
            <Select.Option value="hard_limit">硬限制（超额直接拒绝）</Select.Option>
          </Select>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '12px',
            paddingTop: '16px',
            borderTop: '1px solid var(--semi-color-fill-0)',
          }}
        >
          <div>
            <label style={{ ...fieldLabelStyle, fontSize: '10px' }}>金额上限 ({currency})</label>
            <Input
              type="number"
              value={spendLimit}
              onChange={(v) => setSpendLimit(v)}
              placeholder="不限"
            />
          </div>
          <div>
            <label style={{ ...fieldLabelStyle, fontSize: '10px' }}>TOKEN 上限</label>
            <Input
              type="number"
              value={tokenLimit}
              onChange={(v) => setTokenLimit(v)}
              placeholder="不限"
            />
          </div>
          <div>
            <label style={{ ...fieldLabelStyle, fontSize: '10px' }}>请求数上限</label>
            <Input
              type="number"
              value={requestLimit}
              onChange={(v) => setRequestLimit(v)}
              placeholder="不限"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ManageAssignmentsModal({
  open,
  isPending,
  current,
  members,
  apiKeys,
  onConfirm,
  onCancel,
}: {
  open: boolean
  isPending: boolean
  current: GuardrailDetail['assignments']
  members: WorkspaceMember[]
  apiKeys: ApiKeyItem[]
  onConfirm: (assignments: AssignmentInput[]) => void
  onCancel: () => void
}) {
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    () => new Set(current.filter((a) => a.subject_type === 'member').map((a) => a.account_id))
  )
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(current.filter((a) => a.subject_type === 'api_key').map((a) => a.api_key_id))
  )

  function toggleMember(id: string) {
    const next = new Set(selectedMembers)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedMembers(next)
  }

  function toggleKey(id: string) {
    const next = new Set(selectedKeys)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedKeys(next)
  }

  function handleConfirm() {
    const assignments: AssignmentInput[] = [
      ...[...selectedMembers].map((id) => ({ subject_type: 'member' as const, account_id: id })),
      ...[...selectedKeys].map((id) => ({ subject_type: 'api_key' as const, api_key_id: id })),
    ]
    onConfirm(assignments)
  }

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--semi-color-text-2)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '10px',
  }

  return (
    <Modal
      title="管理绑定对象"
      visible={open}
      onCancel={onCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button theme="solid" type="primary" loading={isPending} onClick={handleConfirm}>
            保存绑定
          </Button>
        </div>
      }
      width={520}
    >
      <div
        style={{
          maxHeight: '60vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          padding: '8px 0',
        }}
      >
        {/* Members section */}
        <div>
          <p style={sectionLabelStyle}>成员</p>
          {members.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', fontStyle: 'italic' }}>暂无成员</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {members.map((m) => {
                const id = m.account.account_id
                const checked = selectedMembers.has(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleMember(id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: checked ? '1px solid #bfdbfe' : '1px solid var(--semi-color-fill-0)',
                      backgroundColor: checked ? '#eff6ff' : 'var(--semi-color-bg-1)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <CheckBox checked={checked} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--semi-color-text-0)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.account.display_name}
                      </p>
                      <p
                        style={{
                          fontSize: '11px',
                          color: 'var(--semi-color-text-2)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.account.email}
                      </p>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '100px',
                        backgroundColor: 'var(--semi-color-fill-0)',
                        color: 'var(--semi-color-text-1)',
                      }}
                    >
                      {m.role}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* API Keys section */}
        <div>
          <p style={sectionLabelStyle}>API Key</p>
          {apiKeys.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', fontStyle: 'italic' }}>
              暂无 API Key
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {apiKeys.map((k) => {
                const checked = selectedKeys.has(k.api_key_id)
                return (
                  <button
                    key={k.api_key_id}
                    type="button"
                    onClick={() => toggleKey(k.api_key_id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: checked ? '1px solid #bfdbfe' : '1px solid var(--semi-color-fill-0)',
                      backgroundColor: checked ? '#eff6ff' : 'var(--semi-color-bg-1)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <CheckBox checked={checked} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--semi-color-text-0)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {k.name}
                      </p>
                      <p
                        style={{
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: 'var(--semi-color-text-2)',
                          margin: 0,
                        }}
                      >
                        {k.masked}
                      </p>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '100px',
                        backgroundColor: k.env === 'live' ? '#ecfdf5' : 'var(--semi-color-bg-1)',
                        color: k.env === 'live' ? '#10b981' : 'var(--semi-color-text-2)',
                      }}
                    >
                      {k.env}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: '16px',
        height: '16px',
        borderRadius: '4px',
        border: checked ? '2px solid #2563eb' : '2px solid var(--semi-color-text-3)',
        backgroundColor: checked ? '#2563eb' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && (
        <svg viewBox="0 0 10 8" style={{ width: '10px', height: '8px' }}>
          <path
            d="M1 4l3 3 5-6"
            stroke="white"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}
