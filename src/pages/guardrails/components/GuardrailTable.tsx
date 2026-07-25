/**
 * 安全护栏三分区列表（PRD v1.0.3）：按作用域拆「全局 / 个人 / Key」三张表，
 * 各表自带名称搜索。字段/列严格对齐 PRD 原型；后端未交付的口径（scope/kind/三档预算）
 * 由 ../derive 统一派生兜底，缺失即显示「不限额 / - / 常规」而非留空或报错。
 */
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/Table'
import { LuSearch, LuShieldCheck, LuUserRound, LuKeyRound } from 'react-icons/lu'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import {
  KIND_LABEL,
  PROMPT_INJECTION_LABEL,
  PROMPT_INJECTION_INHERIT_LABEL,
  apiKeyCount,
  boostExpiry,
  budgetByScope,
  deriveKind,
  deriveScope,
  formatBudget,
  guardrailPromptInjectionMode,
  rawPromptInjectionMode,
  memberCount,
  metadataList,
  nameMatches,
  primaryBudget,
  type GuardrailScope,
} from '../derive'

// 数据值单元格统一字号/字重/颜色（需求方#155）：一律 text-xs·常规字重·text-2，
// 「不限制/继承全局护栏/关闭/时间」等有效值同为一档；仅「—/-/不适用/永不过期」空占位降为 text-3。
// 新增列必须复用这两个常量，别再散写 class（#192 加创建人列时散写 font-semibold 曾致本单返工）。
const DATA_CELL = 'text-xs text-mg-text-2'
const PLACEHOLDER = 'font-normal text-mg-text-3'

// ── 共用单元格 ──────────────────────────────────────────────────────────────

function CountBadge({ count, unit }: { count: number; unit: string }) {
  return (
    <Badge variant={count > 0 ? 'info' : 'outline'} title={count > 0 ? `已绑定 ${count} ${unit}` : `未绑定${unit.replace(/^名|^个 /, '')}`}>
      {count} {unit}
    </Badge>
  )
}

// ── 独立字段单元格（严格对齐 PRD 原型列，不再合并；需求方要求展开显示）───────────
// Table 组件自带 overflow-auto，全局/Key 宽表由容器横向滚动承载。

/** 名称列：名称 + 描述 + 默认徽标（类型独立成列，不再并入） */
function NameCell({ row, onOpenDetail }: { row: GuardrailDetail; onOpenDetail: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpenDetail(row.id)} className="group flex max-w-[220px] flex-col items-start gap-0.5 text-left">
      <span className="flex max-w-full min-w-0 items-center gap-1.5">
        <span className="truncate text-[13.5px] font-bold text-mg-text-1 group-hover:text-brand-base">{row.name}</span>
        {row.is_default && row.status === 'active' && <Badge variant="warning" className="shrink-0">默认</Badge>}
      </span>
      {row.description && <span className="max-w-full truncate text-xs font-medium text-mg-text-3">{row.description}</span>}
    </button>
  )
}

/** 类型列：常规 / 提额 徽标 */
function KindCell({ row }: { row: GuardrailDetail }) {
  const kind = deriveKind(row)
  return <Badge variant={kind === 'boost' ? 'warning' : 'brand'}>{KIND_LABEL[kind]}</Badge>
}

/** 预算列（单档生效预算；提额到期独立成列） */
function BudgetCell({ row, currencySymbol }: { row: GuardrailDetail; currencySymbol: string }) {
  return <span className={DATA_CELL}>{formatBudget(currencySymbol, primaryBudget(row))}</span>
}

/** 指定聚合口径的预算（全局三档分列：工作空间总 / 默认个人 / 默认 Key） */
function ScopeBudgetCell({ row, currencySymbol, agg }: { row: GuardrailDetail; currencySymbol: string; agg: 'guardrail_total' | 'per_member' | 'per_api_key' }) {
  return <span className={DATA_CELL}>{formatBudget(currencySymbol, budgetByScope(row, agg))}</span>
}

/** 提额到期时间列：提额类型显到期(或永不过期)，常规不适用 */
function BoostExpiryCell({ row }: { row: GuardrailDetail }) {
  if (deriveKind(row) !== 'boost') return <span className={cn('cursor-help text-xs', PLACEHOLDER)} title="常规护栏不涉及提额到期">不适用</span>
  const expiry = boostExpiry(row)
  return <span className={cn('text-xs', expiry ? DATA_CELL : PLACEHOLDER)} title={expiry ? '提额护栏到期后自动失效' : '未设到期，提额长期有效'}>{expiry ? formatDateTime(expiry) : '永不过期'}</span>
}

/** 模型黑名单列：列出黑名单模型，空=不限制 */
function ModelBlacklistCell({ row }: { row: GuardrailDetail }) {
  const bl = metadataList(row, 'model_blacklist')
  if (!bl.length) return <span className={cn('cursor-help text-xs', PLACEHOLDER)} title="未设模型黑名单，允许调用全部模型">不限制</span>
  return <span className={cn('block max-w-[180px] cursor-help truncate', DATA_CELL)} title={`共 ${bl.length} 个：${bl.join(' / ')}`}>{bl.join(' / ')}</span>
}

/** IP 白名单列：列出白名单 IP，空=不限制 */
function IpWhitelistCell({ row }: { row: GuardrailDetail }) {
  const ip = metadataList(row, 'ip_whitelist')
  if (!ip.length) return <span className={cn('cursor-help text-xs', PLACEHOLDER)} title="未设 IP 白名单，允许任意来源 IP">不限制</span>
  return <span className={cn('block max-w-[160px] cursor-help truncate font-mono', DATA_CELL)} title={`共 ${ip.length} 条：${ip.join(', ')}`}>{ip.join(', ')}</span>
}

/** 提示词注入列 */
function InjectionCell({ label }: { label: string }) {
  return <span className={DATA_CELL}>{label}</span>
}

/** 创建人列 */
function CreatorCell({ row }: { row: GuardrailDetail }) {
  const name = row.created_by?.display_name
  return <span className={cn('block max-w-[130px] truncate', name ? DATA_CELL : PLACEHOLDER)} title={name || ''}>{name || '—'}</span>
}

/** 最近更新列 */
function UpdatedCell({ row }: { row: GuardrailDetail }) {
  return <span className={cn('whitespace-nowrap', DATA_CELL)}>{formatDateTime(row.updated_at)}</span>
}

function StatusCell({
  row,
  canEdit,
  onToggle,
  lockOffReason,
}: {
  row: GuardrailDetail
  canEdit: boolean
  onToggle: (args: { id: string; status: 'active' | 'inactive' }) => void
  /** 非空 = 该 active 行不允许关闭（如「至少保留一条启用的全局护栏」），置灰开关并提示原因 */
  lockOffReason?: string
}) {
  const active = row.status === 'active'
  const lockedOff = active && !!lockOffReason
  // 状态列只保留开关本身表达启用/停用（需求方反馈：文字「启用/停用」冗余且占宽致列头换行）；
  // 语义交给 Switch 的开/关态 + title/aria，锁定态则提示原因。
  return (
    <div className="flex items-center" title={lockedOff ? lockOffReason : active ? '启用' : '停用'}>
      <Switch
        checked={active}
        disabled={!canEdit || lockedOff}
        aria-label={active ? '启用' : '停用'}
        onChange={(checked) => onToggle({ id: row.id, status: checked ? 'active' : 'inactive' })}
      />
    </div>
  )
}

function RowActions({
  row,
  canEdit,
  canDelete,
  onOpenDetail,
  onDelete,
}: {
  row: GuardrailDetail
  canEdit: boolean
  canDelete: boolean
  onOpenDetail: (id: string) => void
  onDelete: (target: { id: string; name: string }) => void
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={() => onOpenDetail(row.id)} className="h-7 px-1 text-xs font-semibold text-brand-base">
        {canEdit ? '编辑' : '查看'}
      </Button>
      {canDelete && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onDelete({ id: row.id, name: row.name })}
          className="h-7 text-xs"
        >
          删除
        </Button>
      )}
    </div>
  )
}

// ── 分区外壳 ────────────────────────────────────────────────────────────────

const SCOPE_META: Record<GuardrailScope, { title: string; icon: ReactNode; empty: string }> = {
  global: { title: '全局护栏', icon: <LuShieldCheck />, empty: '暂无全局护栏，当前放开使用' },
  member: { title: '个人护栏', icon: <LuUserRound />, empty: '暂无个人护栏' },
  key: { title: 'Key 护栏', icon: <LuKeyRound />, empty: '暂无 Key 护栏' },
}

function ScopeSection({
  scope,
  rows,
  hasSearch,
  search,
  onSearch,
  canCreate,
  onCreate,
  children,
}: {
  scope: GuardrailScope
  rows: GuardrailDetail[]
  hasSearch: boolean
  search: string
  onSearch: (value: string) => void
  canCreate: boolean
  onCreate: () => void
  children: ReactNode
}) {
  const meta = SCOPE_META[scope]
  return (
    <section className="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mg-border/70 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-sm font-bold text-mg-text-1">{meta.title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            variant="search"
            prefix={<LuSearch className="w-3.5 h-3.5" />}
            placeholder="搜索护栏名称"
            aria-label={`搜索${meta.title}名称`}
            className="w-56"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
      {rows.length > 0 ? (
        <Table>{children}</Table>
      ) : (
        <EmptyState
          icon={meta.icon}
          title={hasSearch ? '没有匹配的护栏' : meta.empty}
          action={!hasSearch && canCreate ? (
            <Button size="sm" variant="brand" onClick={onCreate} className="rounded-full">创建护栏</Button>
          ) : undefined}
        />
      )}
    </section>
  )
}

// ── 主组件 ──────────────────────────────────────────────────────────────────

export interface GuardrailSectionsProps {
  guardrails: GuardrailDetail[]
  isLoading: boolean
  /** 分类 × 动作细粒度（需求方#57）：各分区行内动作按自己分类的码控 */
  canEdit: Record<GuardrailScope, boolean>
  canDelete: Record<GuardrailScope, boolean>
  /** 逐行编辑归属（需求方#261）：分区码 × 本行归属——管理者管全部、成员只管自己创建的。
   *  gate 编辑/查看 label、删除按钮、启停开关，避免「按钮可编辑但保存 40301」。 */
  canManageRow: (row: GuardrailDetail) => boolean
  /** 空状态创建按钮按分区权限控（需求方#262）：member 只授 key:create 时，全局/个人分区不显示创建入口 */
  canCreate: Record<GuardrailScope, boolean>
  showMember: boolean
  currencySymbol: string
  search: Record<GuardrailScope, string>
  onSearchChange: (scope: GuardrailScope, value: string) => void
  onOpenDetail: (id: string) => void
  onToggle: (args: { id: string; status: 'active' | 'inactive' }) => void
  onDelete: (target: { id: string; name: string }) => void
  /** scope：从某分区入口创建时带上该分区分类，默认选中对应作用范围（需求方#202） */
  onCreate: (scope?: GuardrailScope) => void
}

export function GuardrailSections(props: GuardrailSectionsProps) {
  const {
    guardrails, isLoading, canEdit, canDelete, canManageRow, canCreate, showMember, currencySymbol,
    search, onSearchChange, onOpenDetail, onToggle, onDelete, onCreate,
  } = props

  if (isLoading) {
    return (
      <div className="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border p-10 space-y-4 animate-pulse">
        <div className="h-6 bg-mg-fill-0 rounded-sm w-1/4" />
        <div className="h-4 bg-mg-fill-0 rounded-sm w-full" />
        <div className="h-4 bg-mg-fill-0 rounded-sm w-5/6" />
      </div>
    )
  }

  const byScope = (scope: GuardrailScope) =>
    guardrails.filter((g) => deriveScope(g) === scope && nameMatches(g, search[scope]))

  // 三分区均不做有效性过滤（PRD 原型分区头只有搜索框，需求方#65）：
  // 过期/停用状态由「状态」列表达，行始终可见可管理。
  const globalRows = byScope('global')
  const memberRows = byScope('member')
  // 全局护栏「至少保留一条启用」不变量（需求方#108）：仅剩 1 条 active 全局时，该条不允许关闭。
  // 从全量算（不受搜索过滤影响），传给 StatusCell 置灰其停用开关。
  const activeGlobalCount = guardrails.filter((g) => deriveScope(g) === 'global' && g.status === 'active').length
  const keyRows = byScope('key')


  return (
    <div className="space-y-6">
      {/* 全局护栏：默认应用于工作空间的三档预算 + 模型/IP 规则 */}
      <ScopeSection
        scope="global"
        rows={globalRows}
        hasSearch={search.global.trim().length > 0}
        search={search.global}
        onSearch={(v) => onSearchChange('global', v)}
        canCreate={canCreate.global}
        onCreate={() => onCreate('global')}
      >
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>工作空间总预算</TableHead>
            {showMember && <TableHead>默认个人预算</TableHead>}
            <TableHead className="normal-case">默认 Key 预算</TableHead>
            <TableHead>模型黑名单</TableHead>
            <TableHead>IP 白名单</TableHead>
            <TableHead>提示词注入</TableHead>
            <TableHead>创建人</TableHead>
            <TableHead>最近更新</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="w-32 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {globalRows.map((row) => (
            <TableRow key={row.id}>
              <TableCell><NameCell row={row} onOpenDetail={onOpenDetail} /></TableCell>
              <TableCell><ScopeBudgetCell row={row} currencySymbol={currencySymbol} agg="guardrail_total" /></TableCell>
              {showMember && <TableCell><ScopeBudgetCell row={row} currencySymbol={currencySymbol} agg="per_member" /></TableCell>}
              <TableCell><ScopeBudgetCell row={row} currencySymbol={currencySymbol} agg="per_api_key" /></TableCell>
              <TableCell><ModelBlacklistCell row={row} /></TableCell>
              <TableCell><IpWhitelistCell row={row} /></TableCell>
              <TableCell><InjectionCell label={PROMPT_INJECTION_LABEL[guardrailPromptInjectionMode(row)]} /></TableCell>
              <TableCell><CreatorCell row={row} /></TableCell>
              <TableCell><UpdatedCell row={row} /></TableCell>
              <TableCell><StatusCell row={row} canEdit={canEdit.global && canManageRow(row)} onToggle={onToggle} lockOffReason={activeGlobalCount <= 1 ? '需至少保留一条启用的全局护栏' : undefined} /></TableCell>
              <TableCell className="text-right"><RowActions row={row} canEdit={canEdit.global && canManageRow(row)} canDelete={canDelete.global && canManageRow(row)} onOpenDetail={onOpenDetail} onDelete={onDelete} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </ScopeSection>

      {/* 个人护栏：绑定成员的护栏 / 提额（个人组织隐藏） */}
      {showMember && (
        <ScopeSection
          scope="member"
          rows={memberRows}
          hasSearch={search.member.trim().length > 0}
          search={search.member}
          onSearch={(v) => onSearchChange('member', v)}
          canCreate={canCreate.member}
          onCreate={() => onCreate('member')}
        >
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>成员</TableHead>
              <TableHead>预算</TableHead>
              <TableHead>提额到期时间</TableHead>
              <TableHead>创建人</TableHead>
              <TableHead>最近更新</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell><NameCell row={row} onOpenDetail={onOpenDetail} /></TableCell>
                <TableCell><KindCell row={row} /></TableCell>
                <TableCell><CountBadge count={memberCount(row)} unit="名成员" /></TableCell>
                <TableCell><BudgetCell row={row} currencySymbol={currencySymbol} /></TableCell>
                <TableCell><BoostExpiryCell row={row} /></TableCell>
                <TableCell><CreatorCell row={row} /></TableCell>
                <TableCell><UpdatedCell row={row} /></TableCell>
                <TableCell><StatusCell row={row} canEdit={canEdit.member && canManageRow(row)} onToggle={onToggle} /></TableCell>
                <TableCell className="text-right"><RowActions row={row} canEdit={canEdit.member && canManageRow(row)} canDelete={canDelete.member && canManageRow(row)} onOpenDetail={onOpenDetail} onDelete={onDelete} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </ScopeSection>
      )}

      {/* Key 护栏：绑定 API Key 的护栏 / 提额 */}
      <ScopeSection
        scope="key"
        rows={keyRows}
        hasSearch={search.key.trim().length > 0}
        search={search.key}
        onSearch={(v) => onSearchChange('key', v)}
        canCreate={canCreate.key}
        onCreate={() => onCreate('key')}
      >
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>类型</TableHead>
            <TableHead className="normal-case">绑定 Key</TableHead>
            <TableHead>预算</TableHead>
            <TableHead>提额到期时间</TableHead>
            <TableHead>模型黑名单</TableHead>
            <TableHead>IP 白名单</TableHead>
            <TableHead>提示词注入</TableHead>
            <TableHead>创建人</TableHead>
            <TableHead>最近更新</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="w-32 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keyRows.map((row) => {
            const injectionLabel = rawPromptInjectionMode(row)
              ? PROMPT_INJECTION_LABEL[rawPromptInjectionMode(row)!]
              : PROMPT_INJECTION_INHERIT_LABEL
            return (
              <TableRow key={row.id}>
                <TableCell><NameCell row={row} onOpenDetail={onOpenDetail} /></TableCell>
                <TableCell><KindCell row={row} /></TableCell>
                <TableCell><CountBadge count={apiKeyCount(row)} unit="个 Key" /></TableCell>
                <TableCell><BudgetCell row={row} currencySymbol={currencySymbol} /></TableCell>
                <TableCell><BoostExpiryCell row={row} /></TableCell>
                <TableCell><ModelBlacklistCell row={row} /></TableCell>
                <TableCell><IpWhitelistCell row={row} /></TableCell>
                <TableCell><InjectionCell label={injectionLabel} /></TableCell>
                <TableCell><CreatorCell row={row} /></TableCell>
                <TableCell><UpdatedCell row={row} /></TableCell>
                <TableCell><StatusCell row={row} canEdit={canEdit.key && canManageRow(row)} onToggle={onToggle} /></TableCell>
                <TableCell className="text-right"><RowActions row={row} canEdit={canEdit.key && canManageRow(row)} canDelete={canDelete.key && canManageRow(row)} onOpenDetail={onOpenDetail} onDelete={onDelete} /></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </ScopeSection>
    </div>
  )
}
