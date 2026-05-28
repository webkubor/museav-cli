import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Select, Toast, Skeleton, SideSheet, Dropdown } from '@douyinfe/semi-ui'
import { LuSearch, LuUsers, LuKey, LuEllipsis, LuSettings, LuShield } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { useWorkspaceRole } from '@/hooks/use-workspace-role'
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

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  padding: '24px',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
}

const listCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  overflow: 'hidden',
}

const COL = '1fr 130px 160px 90px 90px 52px'

export default function GuardrailsPage() {
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId)
  const { canManage } = useWorkspaceRole()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [addPolicyFormOpen, setAddPolicyFormOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [searchText, setSearchText] = useState('')

  const listQuery = useQuery({
    queryKey: ['guardrails', activeWorkspaceId],
    queryFn: () => listGuardrails(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const guardrails = listQuery.data?.items ?? []
  const filtered = useMemo(
    () => searchText ? guardrails.filter(g => g.name.toLowerCase().includes(searchText.toLowerCase())) : guardrails,
    [guardrails, searchText],
  )
  const selected = guardrails.find(g => g.id === selectedId) ?? null

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
    mutationFn: (body: { name: string; description: string }) => createGuardrail(activeWorkspaceId!, body),
    onSuccess: (data) => {
      Toast.success('护栏已创建')
      setSelectedId(data.id)
      setDetailOpen(true)
      setCreateOpen(false)
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => Toast.error(err instanceof Error ? err.message : '创建失败'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: GuardrailDetail['status'] }) => updateGuardrail(id, { status }),
    onSuccess: () => { Toast.success('状态已更新'); qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] }) },
    onError: (err: unknown) => Toast.error(err instanceof Error ? err.message : '更新失败'),
  })

  const addPolicyMutation = useMutation({
    mutationFn: (body: Parameters<typeof addBudgetPolicy>[1]) => {
      if (!selectedId) return Promise.reject(new Error('no guardrail'))
      return addBudgetPolicy(selectedId, body)
    },
    onSuccess: () => { Toast.success('策略已添加'); setAddPolicyFormOpen(false); qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] }) },
    onError: (err: unknown) => Toast.error(err instanceof Error ? err.message : '添加失败'),
  })

  const deletePolicyMutation = useMutation({
    mutationFn: (policyId: string) => {
      if (!selectedId) return Promise.reject(new Error('no guardrail'))
      return deleteBudgetPolicy(selectedId, policyId)
    },
    onSuccess: () => { Toast.success('策略已删除'); qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] }) },
    onError: (err: unknown) => Toast.error(err instanceof Error ? err.message : '删除失败'),
  })

  const assignMutation = useMutation({
    mutationFn: (assignments: Parameters<typeof replaceAssignments>[1]) => {
      if (!selectedId) return Promise.reject(new Error('no guardrail'))
      return replaceAssignments(selectedId, assignments)
    },
    onSuccess: () => { Toast.success('绑定已更新'); setAssignOpen(false); qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] }) },
    onError: (err: unknown) => Toast.error(err instanceof Error ? err.message : '更新失败'),
  })

  function memberName(accountId: string) {
    return pageItems(membersQuery.data).find(m => m.account?.account_id === accountId)?.account?.display_name ?? accountId
  }
  function apiKeyName(keyId: string) {
    return pageItems(apiKeysQuery.data).find(k => k.api_key_id === keyId)?.name ?? keyId
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>安全护栏</h1>
          <p style={{ fontSize: '14px', color: 'var(--semi-color-text-1)', margin: '6px 0 0' }}>为成员或 API Key 设置用量限额和限速策略，保障资源安全。</p>
        </div>
        {canManage && (
          <Button theme="solid" type="primary" onClick={() => setCreateOpen(true)}>+ 新建护栏</Button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', marginBottom: '20px', borderRadius: '10px', border: '1px solid var(--semi-color-fill-1)', backgroundColor: 'var(--semi-color-fill-0)', fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
        <LuShield size={14} style={{ flexShrink: 0, color: 'var(--semi-color-text-2)' }} />
        <span>组织级策略将自动继承到此工作区，并叠加应用于所有成员和 API Key。</span>
      </div>

      <div style={listCardStyle}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--semi-color-fill-0)' }}>
          <Input
            prefix={<LuSearch size={14} style={{ color: 'var(--semi-color-text-2)' }} />}
            placeholder="按名称搜索..."
            value={searchText}
            onChange={v => setSearchText(v)}
            style={{ width: '280px' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '10px 20px', borderBottom: '1px solid var(--semi-color-fill-0)', fontSize: '11px', fontWeight: 700, color: 'var(--semi-color-text-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <span>名称</span><span>状态</span><span>策略</span><span>成员</span><span>API Keys</span><span />
        </div>

        {listQuery.isLoading ? (
          <div style={{ padding: '20px' }}><Skeleton.Title style={{ width: '100%', marginBottom: '12px' }} /><Skeleton.Title style={{ width: '80%' }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: '13px' }}>
            {searchText ? '未找到匹配的护栏' : '暂无护栏，点击右上角新建'}
          </div>
        ) : filtered.map(g => (
          <GuardrailRow
            key={g.id}
            guardrail={g}
            canManage={canManage}
            onOpenDetail={() => { setSelectedId(g.id); setDetailOpen(true) }}
            onAddPolicy={() => { setSelectedId(g.id); setDetailOpen(true); setAddPolicyFormOpen(true) }}
            onManageAssign={() => { setSelectedId(g.id); setAssignOpen(true) }}
            onToggleStatus={() => statusMutation.mutate({ id: g.id, status: g.status === 'active' ? 'inactive' : 'active' })}
          />
        ))}

        {!listQuery.isLoading && guardrails.length > 0 && (
          <div style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--semi-color-text-2)', borderTop: '1px solid var(--semi-color-fill-0)' }}>
            共 {guardrails.length} 个护栏
          </div>
        )}
      </div>

      <SideSheet title={selected?.name ?? ''} visible={detailOpen} onCancel={() => setDetailOpen(false)} width={560}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: selected.description ? '4px' : 0 }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>{selected.name}</h2>
                    {selected.is_default && (
                      <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '100px', backgroundColor: 'var(--cn-selected-bg)', color: 'var(--cn-base)', border: '1px solid var(--cn-mid)', fontWeight: 600, flexShrink: 0 }}>默认</span>
                    )}
                  </div>
                  {selected.description && <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>{selected.description}</p>}
                </div>
                {canManage && (
                  <Select value={selected.status} onChange={v => statusMutation.mutate({ id: selected.id, status: v as GuardrailDetail['status'] })} style={{ width: '120px', flexShrink: 0 }}>
                    <Select.Option value="active">启用</Select.Option>
                    <Select.Option value="inactive">停用</Select.Option>
                    <Select.Option value="archived">归档</Select.Option>
                  </Select>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--semi-color-fill-0)' }}>
                <MetaItem label="优先级" value={selected.priority ?? '默认'} />
                <MetaItem label="默认策略" value={selected.is_default ? '是' : '否'} />
                <MetaItem label="创建于" value={formatDateTime(selected.created_at)} />
                <MetaItem label="最近更新" value={formatDateTime(selected.updated_at)} />
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--semi-color-text-0)', margin: 0 }}>绑定对象</p>
                {canManage && <Button size="small" onClick={() => setAssignOpen(true)}>管理</Button>}
              </div>
              {selected.assignments.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--semi-color-border)', borderRadius: '8px', color: 'var(--semi-color-text-2)', fontSize: '13px' }}>暂未绑定任何成员或 API Key</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {selected.assignments.map(a => (
                    <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 12px', borderRadius: '100px', border: '1px solid var(--semi-color-border)', backgroundColor: 'var(--semi-color-bg-1)', fontSize: '12px', color: 'var(--semi-color-text-1)', fontWeight: 500 }}>
                      <span style={{ fontSize: '10px', color: 'var(--semi-color-text-2)' }}>{a.subject_type === 'member' ? '成员' : 'Key'}</span>
                      {a.subject_type === 'member' ? memberName(a.account_id) : apiKeyName(a.api_key_id)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--semi-color-text-0)', margin: 0 }}>预算策略</p>
                {canManage && !addPolicyFormOpen && <Button theme="solid" type="primary" size="small" onClick={() => setAddPolicyFormOpen(true)}>+ 添加策略</Button>}
              </div>
              {selected.budget_policies.length === 0 && !addPolicyFormOpen ? (
                <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed var(--semi-color-border)', borderRadius: '8px', color: 'var(--semi-color-text-2)', fontSize: '13px' }}>暂无预算或限流策略</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selected.budget_policies.map(p => (
                    <PolicyCard key={p.id} policy={p} canManage={canManage} onDelete={() => deletePolicyMutation.mutate(p.id)} isDeleting={deletePolicyMutation.isPending} />
                  ))}
                </div>
              )}
              {addPolicyFormOpen && (
                <AddPolicyInlineForm
                  isPending={addPolicyMutation.isPending}
                  members={pageItems(membersQuery.data)}
                  apiKeys={pageItems(apiKeysQuery.data)}
                  onConfirm={(body) => addPolicyMutation.mutate(body)}
                  onCancel={() => setAddPolicyFormOpen(false)}
                />
              )}
            </div>
          </div>
        )}
      </SideSheet>

      <CreateGuardrailModal open={createOpen} isPending={createMutation.isPending} onConfirm={(name, description) => createMutation.mutate({ name, description })} onCancel={() => setCreateOpen(false)} />
      {selected && <ManageAssignmentsModal open={assignOpen} isPending={assignMutation.isPending} current={selected.assignments} members={membersQuery.data?.items ?? []} apiKeys={apiKeysQuery.data?.items ?? []} onConfirm={assignments => assignMutation.mutate(assignments)} onCancel={() => setAssignOpen(false)} />}
    </div>
  )
}

function GuardrailRow({ guardrail: g, canManage, onOpenDetail, onAddPolicy, onManageAssign, onToggleStatus }: {
  guardrail: GuardrailDetail
  canManage: boolean
  onOpenDetail: () => void
  onAddPolicy: () => void
  onManageAssign: () => void
  onToggleStatus: () => void
}) {
  const statusCfg = GUARDRAIL_STATUS_CONFIG[g.status]
  const memberCount = g.assignments.filter(a => a.subject_type === 'member').length
  const keyCount = g.assignments.filter(a => a.subject_type === 'api_key').length

  const btnStyle: React.CSSProperties = {
    width: '32px', height: '32px', borderRadius: '6px',
    border: '1px solid var(--semi-color-border)', backgroundColor: 'transparent',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--semi-color-text-1)', flexShrink: 0,
  }

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: COL, alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--semi-color-fill-0)', cursor: 'pointer', transition: 'background-color 0.15s' }}
      onClick={onOpenDetail}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--semi-color-fill-0)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
    >
      <div style={{ minWidth: 0, paddingRight: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: g.description ? '2px' : 0 }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>{g.name}</span>
          {g.is_default && <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '100px', backgroundColor: 'var(--cn-selected-bg)', color: 'var(--cn-base)', border: '1px solid var(--cn-mid)', fontWeight: 600, flexShrink: 0 }}>默认</span>}
        </div>
        {g.description && <p style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</p>}
      </div>

      <div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: 500, backgroundColor: 'var(--semi-color-fill-0)', color: statusCfg.color, border: '1px solid var(--semi-color-fill-1)' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusCfg.color, flexShrink: 0 }} />
          {statusCfg.label}
        </span>
      </div>

      <div>
        {g.budget_policies.length === 0
          ? <span style={{ fontSize: '12px', color: 'var(--semi-color-text-3)' }}>无策略</span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 10px', borderRadius: '100px', backgroundColor: 'var(--semi-color-fill-0)', border: '1px solid var(--semi-color-border)', color: 'var(--semi-color-text-1)', fontWeight: 500 }}>◎ 预算 × {g.budget_policies.length}</span>
        }
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
        <LuUsers size={13} style={{ flexShrink: 0 }} />
        <span>{g.is_default ? '全部' : memberCount}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
        <LuKey size={13} style={{ flexShrink: 0 }} />
        <span>{g.is_default ? '全部' : keyCount}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        {g.is_default || !canManage ? (
          <button style={btnStyle} onClick={onOpenDetail} title="查看详情"><LuSettings size={14} /></button>
        ) : (
          <Dropdown trigger="click" position="bottomRight" render={
            <Dropdown.Menu>
              <Dropdown.Item onClick={onAddPolicy}>添加预算策略</Dropdown.Item>
              <Dropdown.Item onClick={onManageAssign}>管理成员 / API Key</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={onToggleStatus}>{g.status === 'active' ? '停用护栏' : '启用护栏'}</Dropdown.Item>
            </Dropdown.Menu>
          }>
            <button style={btnStyle} title="更多操作"><LuEllipsis size={16} /></button>
          </Dropdown>
        )}
      </div>
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
  canManage,
}: {
  policy: GuardrailBudgetPolicy
  onDelete: () => void
  isDeleting: boolean
  canManage: boolean
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
                  ? 'var(--semi-color-danger-light-default)'
                  : p.enforcement_mode === 'soft_limit'
                    ? 'var(--semi-color-warning-light-default)'
                    : 'var(--semi-color-bg-1)',
              color: enforcementCfg.color,
              border: `1px solid ${
                p.enforcement_mode === 'hard_limit'
                  ? 'var(--semi-color-danger-light-hover)'
                  : p.enforcement_mode === 'soft_limit'
                    ? 'var(--semi-color-warning-light-hover)'
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
          {p.rate_request_limit > 0 && (
            <PolicyMeta
              label="当前限速"
              value={`${p.rate_request_limit} req / ${p.rate_window_seconds}s`}
            />
          )}
        </div>
      </div>
      {canManage && (
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
      )}
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

function AddPolicyInlineForm({
  isPending,
  members,
  apiKeys,
  onConfirm,
  onCancel,
}: {
  isPending: boolean
  members: WorkspaceMember[]
  apiKeys: ApiKeyItem[]
  onConfirm: (body: Parameters<typeof addBudgetPolicy>[1]) => void
  onCancel: () => void
}) {
  const { currency } = useCurrency()
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [periodUnit, setPeriodUnit] = useState<'hour' | 'day' | 'week' | 'month'>('month')
  const [spendLimit, setSpendLimit] = useState('')

  const scope: 'guardrail_total' | 'per_member' | 'per_api_key' =
    selectedMembers.length > 0 ? 'per_member' :
    selectedKeys.length > 0 ? 'per_api_key' :
    'guardrail_total'

  function handleConfirm() {
    const body: Parameters<typeof addBudgetPolicy>[1] = {
      aggregation_scope: scope,
      period_unit: periodUnit,
      enforcement_mode: 'hard_limit',
      enabled: true,
    }
    if (spendLimit && parseFloat(spendLimit) > 0) {
      body.spend_limit_amount = spendLimit
      body.currency = currency
    }
    onConfirm(body)
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '11px', fontWeight: 700, color: 'var(--semi-color-text-2)',
    letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px',
  }

  const groupStyle: React.CSSProperties = {
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid var(--semi-color-fill-1)',
    backgroundColor: 'var(--semi-color-bg-0)',
    marginBottom: '10px',
  }

  return (
    <div style={{ marginTop: '10px', padding: '16px', borderRadius: '10px', border: '1px dashed var(--semi-color-primary)', backgroundColor: 'var(--semi-color-primary-light-default)' }}>
      <div style={groupStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>
            <LuUsers size={12} /> 成员 ({selectedMembers.length})
          </span>
          {selectedMembers.length > 0 && (
            <button type="button" onClick={() => setSelectedMembers([])} style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--semi-color-text-2)', cursor: 'pointer', padding: 0 }}>
              清空
            </button>
          )}
        </div>
        <Select
          multiple
          value={selectedMembers}
          onChange={(v) => setSelectedMembers(v as string[])}
          placeholder="+ 添加成员"
          style={{ width: '100%' }}
          size="small"
        >
          {members.map(m => (
            <Select.Option key={m.account?.account_id} value={m.account?.account_id}>
              {m.account?.display_name ?? m.account?.account_id}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div style={groupStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>
            <LuKey size={12} /> API Keys ({selectedKeys.length})
          </span>
          {selectedKeys.length > 0 && (
            <button type="button" onClick={() => setSelectedKeys([])} style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--semi-color-text-2)', cursor: 'pointer', padding: 0 }}>
              清空
            </button>
          )}
        </div>
        <Select
          multiple
          value={selectedKeys}
          onChange={(v) => setSelectedKeys(v as string[])}
          placeholder="+ 添加 API Key"
          style={{ width: '100%' }}
          size="small"
        >
          {apiKeys.map(k => (
            <Select.Option key={k.api_key_id} value={k.api_key_id}>
              {k.name}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <Select value={periodUnit} onChange={(v) => setPeriodUnit(v as typeof periodUnit)} style={{ width: '100%' }} size="small">
            <Select.Option value="hour">每小时重置</Select.Option>
            <Select.Option value="day">每天重置</Select.Option>
            <Select.Option value="week">每周重置</Select.Option>
            <Select.Option value="month">每月重置</Select.Option>
          </Select>
        </div>
        <div style={{ flex: 1 }}>
          <Input type="number" value={spendLimit} onChange={(v) => setSpendLimit(v)} placeholder={`金额上限（${currency}，留空不限）`} size="small" />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: 'var(--semi-color-text-2)' }}>
          聚合维度：{scope === 'per_member' ? '按成员独立计算' : scope === 'per_api_key' ? '按 API Key 独立计算' : '护栏内整体累计'}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="small" onClick={onCancel}>取消</Button>
          <Button size="small" theme="solid" type="primary" loading={isPending} onClick={handleConfirm}>确认添加</Button>
        </div>
      </div>
    </div>
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
                      border: checked ? '1px solid var(--cn-mid)' : '1px solid var(--semi-color-fill-0)',
                      backgroundColor: checked ? 'var(--cn-selected-bg)' : 'var(--semi-color-bg-1)',
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
                      border: checked ? '1px solid var(--cn-mid)' : '1px solid var(--semi-color-fill-0)',
                      backgroundColor: checked ? 'var(--cn-selected-bg)' : 'var(--semi-color-bg-1)',
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
                        backgroundColor: k.env === 'live' ? 'var(--semi-color-success-light-default)' : 'var(--semi-color-bg-1)',
                        color: k.env === 'live' ? 'var(--semi-color-success)' : 'var(--semi-color-text-2)',
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
        border: checked ? '2px solid var(--brand-base)' : '2px solid var(--semi-color-text-3)',
        backgroundColor: checked ? 'var(--brand-base)' : 'transparent',
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
