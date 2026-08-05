/**
 * 安全护栏三分区列表（PRD v1.0.3）：按作用域拆「全局 / 个人 / Key」三张表，
 * 各表自带名称搜索。字段/列严格对齐 PRD 原型；后端未交付的口径（scope/kind/三档预算）
 * 由 ../derive 统一派生兜底，缺失即显示「不限额 / - / 常规」而非留空或报错。
 */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  KIND_LABEL_KEY,
  PROMPT_INJECTION_LABEL_KEY,
  PROMPT_INJECTION_INHERIT_LABEL_KEY,
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

function CountBadge({
  count, unit, emptyTitle, boundTitle,
}: {
  count: number
  unit: string
  emptyTitle: string
  boundTitle: string
}) {
  return (
    <Badge variant={count > 0 ? 'info' : 'outline'} title={count > 0 ? boundTitle : emptyTitle}>
      {count} {unit}
    </Badge>
  )
}

// ── 独立字段单元格（严格对齐 PRD 原型列，不再合并；需求方要求展开显示）───────────
// Table 组件自带 overflow-auto，全局/Key 宽表由容器横向滚动承载。

/** 名称列：名称 + 描述 + 默认徽标（类型独立成列，不再并入） */
function NameCell({ row, onOpenDetail }: { row: GuardrailDetail; onOpenDetail: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={() => onOpenDetail(row.id)} className="group flex max-w-[220px] flex-col items-start gap-0.5 text-left">
      <span className="flex max-w-full min-w-0 items-center gap-1.5">
        <span className="truncate text-[13.5px] font-bold text-mg-text-1 group-hover:text-brand-base">{row.name}</span>
        {row.is_default && row.status === 'active' && <Badge variant="warning" className="shrink-0">{t('guardrails.table.defaultBadgeShort')}</Badge>}
      </span>
      {row.description && <span className="max-w-full truncate text-xs font-medium text-mg-text-3">{row.description}</span>}
    </button>
  )
}

/** 类型列：常规 / 提额 徽标 */
function KindCell({ row }: { row: GuardrailDetail }) {
  const { t } = useTranslation()
  const kind = deriveKind(row)
  // 徽标短名与表单/列表的完整类型名分开维护（需求方#461：en 徽标要 Increase 而非 Temporary Increase）
  return <Badge variant={kind === 'boost' ? 'warning' : 'brand'}>{t(`guardrails.table.kindBadge.${kind}`, { defaultValue: t(KIND_LABEL_KEY[kind]) })}</Badge>
}

/** 预算列（单档生效预算；提额到期独立成列） */
function BudgetCell({ row, currencySymbol }: { row: GuardrailDetail; currencySymbol: string }) {
  const { t } = useTranslation()
  return <span className={DATA_CELL}>{formatBudget(currencySymbol, primaryBudget(row), (unit) => t(`guardrails.period.${unit}`, { defaultValue: unit }), t('guardrails.budget.unlimited'))}</span>
}

/** 指定聚合口径的预算（全局三档分列：工作空间总 / 默认个人 / 默认 Key） */
function ScopeBudgetCell({ row, currencySymbol, agg }: { row: GuardrailDetail; currencySymbol: string; agg: 'guardrail_total' | 'per_member' | 'per_api_key' }) {
  const { t } = useTranslation()
  return <span className={DATA_CELL}>{formatBudget(currencySymbol, budgetByScope(row, agg), (unit) => t(`guardrails.period.${unit}`, { defaultValue: unit }), t('guardrails.budget.unlimited'))}</span>
}

/** 提额到期时间列：提额类型显到期(或永不过期)，常规不适用 */
function BoostExpiryCell({ row }: { row: GuardrailDetail }) {
  const { t } = useTranslation()
  if (deriveKind(row) !== 'boost') return <span className={cn('cursor-help text-xs', PLACEHOLDER)} title={t('guardrails.table.boostExpiry.notApplicableTitle')}>{t('guardrails.table.notApplicable')}</span>
  const expiry = boostExpiry(row)
  return <span className={cn('text-xs', expiry ? DATA_CELL : PLACEHOLDER)} title={expiry ? t('guardrails.table.boostExpiry.expiryTitle') : t('guardrails.table.boostExpiry.neverTitle')}>{expiry ? formatDateTime(expiry) : t('guardrails.table.neverExpires')}</span>
}

/** 模型黑名单列：列出黑名单模型，空=不限制 */
function ModelBlacklistCell({ row }: { row: GuardrailDetail }) {
  const { t } = useTranslation()
  const bl = metadataList(row, 'model_blacklist')
  if (!bl.length) return <span className={cn('cursor-help text-xs', PLACEHOLDER)} title={t('guardrails.table.modelBlacklistEmptyTitle')}>{t('guardrails.budget.unlimited')}</span>
  return <span className={cn('block max-w-[180px] cursor-help truncate', DATA_CELL)} title={t('guardrails.table.modelBlacklistCountTitle', { count: bl.length, value: bl.join(' / ') })}>{bl.join(' / ')}</span>
}

/** IP 白名单列：列出白名单 IP，空=不限制 */
function IpWhitelistCell({ row }: { row: GuardrailDetail }) {
  const { t } = useTranslation()
  const ip = metadataList(row, 'ip_whitelist')
  if (!ip.length) return <span className={cn('cursor-help text-xs', PLACEHOLDER)} title={t('guardrails.table.ipWhitelistEmptyTitle')}>{t('guardrails.budget.unlimited')}</span>
  return <span className={cn('block max-w-[160px] cursor-help truncate font-mono', DATA_CELL)} title={t('guardrails.table.ipWhitelistCountTitle', { count: ip.length, value: ip.join(', ') })}>{ip.join(', ')}</span>
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
  pending,
}: {
  row: GuardrailDetail
  canEdit: boolean
  onToggle: (args: { id: string; status: 'active' | 'inactive' }) => void
  /** 非空 = 该 active 行不允许关闭（如「至少保留一条启用的全局护栏」），置灰开关并提示原因 */
  lockOffReason?: string
  /** 该行启停请求进行中：置灰开关，避免重复点击/请求未回时误判已切换（4-way 审计发现的唯一零反馈护栏动作） */
  pending?: boolean
}) {
  const { t } = useTranslation()
  const active = row.status === 'active'
  const lockedOff = active && !!lockOffReason
  // 状态列只保留开关本身表达启用/停用（需求方反馈：文字「启用/停用」冗余且占宽致列头换行）；
  // 语义交给 Switch 的开/关态 + title/aria，锁定态则提示原因。
  return (
    <div className="flex items-center" title={lockedOff ? lockOffReason : active ? t('guardrails.table.active') : t('guardrails.table.inactive')}>
      <Switch
        checked={active}
        disabled={!canEdit || lockedOff || pending}
        aria-label={active ? t('guardrails.table.active') : t('guardrails.table.inactive')}
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
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={() => onOpenDetail(row.id)} className="h-7 px-1 text-xs font-semibold text-brand-base">
        {canEdit ? t('guardrails.table.edit') : t('guardrails.table.view')}
      </Button>
      {canDelete && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onDelete({ id: row.id, name: row.name })}
          className="h-7 text-xs"
        >
          {t('guardrails.table.delete')}
        </Button>
      )}
    </div>
  )
}

// ── 分区外壳 ────────────────────────────────────────────────────────────────

const SCOPE_META: Record<GuardrailScope, { titleKey: string; icon: ReactNode; emptyKey: string }> = {
  global: { titleKey: 'guardrails.section.global', icon: <LuShieldCheck />, emptyKey: 'guardrails.emptyState.global' },
  member: { titleKey: 'guardrails.section.member', icon: <LuUserRound />, emptyKey: 'guardrails.emptyState.member' },
  key: { titleKey: 'guardrails.section.key', icon: <LuKeyRound />, emptyKey: 'guardrails.emptyState.key' },
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
  const { t } = useTranslation()
  const meta = SCOPE_META[scope]
  const title = t(meta.titleKey)
  return (
    <section className="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mg-border/70 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-sm font-bold text-mg-text-1">{title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            variant="search"
            prefix={<LuSearch className="w-3.5 h-3.5" />}
            placeholder={t('guardrails.table.searchPlaceholder')}
            aria-label={t('guardrails.table.searchAria', { title })}
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
          title={hasSearch ? t('guardrails.emptyState.noMatch') : t(meta.emptyKey)}
          action={!hasSearch && canCreate ? (
            <Button size="sm" variant="brand" onClick={onCreate} className="rounded-full">{t('guardrails.create')}</Button>
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
  /** 该行启停请求是否进行中，供 StatusCell 置灰即时反馈（qa 4-way 审计：启停开关曾零 pending 反馈） */
  isRowToggling: (id: string) => boolean
  onDelete: (target: { id: string; name: string }) => void
  /** scope：从某分区入口创建时带上该分区分类，默认选中对应作用范围（需求方#202） */
  onCreate: (scope?: GuardrailScope) => void
}

export function GuardrailSections(props: GuardrailSectionsProps) {
  const { t } = useTranslation()
  const {
    guardrails, isLoading, canEdit, canDelete, canManageRow, canCreate, showMember, currencySymbol,
    search, onSearchChange, onOpenDetail, onToggle, isRowToggling, onDelete, onCreate,
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
            <TableHead>{t('guardrails.table.name')}</TableHead>
            <TableHead>{t('guardrails.budget.workspaceTotal')}</TableHead>
            {showMember && <TableHead>{t('guardrails.budget.defaultMember')}</TableHead>}
            <TableHead className="normal-case">{t('guardrails.budget.defaultKey')}</TableHead>
            <TableHead>{t('guardrails.table.modelBlacklist')}</TableHead>
            <TableHead>{t('guardrails.table.ipWhitelist')}</TableHead>
            <TableHead>{t('guardrails.table.promptInjection')}</TableHead>
            <TableHead>{t('guardrails.table.creator')}</TableHead>
            <TableHead>{t('guardrails.table.updatedAt')}</TableHead>
            <TableHead>{t('guardrails.table.status')}</TableHead>
            <TableHead className="w-32 text-right">{t('guardrails.table.actions')}</TableHead>
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
              <TableCell><InjectionCell label={t(PROMPT_INJECTION_LABEL_KEY[guardrailPromptInjectionMode(row)])} /></TableCell>
              <TableCell><CreatorCell row={row} /></TableCell>
              <TableCell><UpdatedCell row={row} /></TableCell>
              <TableCell><StatusCell row={row} canEdit={canEdit.global && canManageRow(row)} onToggle={onToggle} lockOffReason={activeGlobalCount <= 1 ? t('guardrails.table.keepOneGlobal') : undefined} pending={isRowToggling(row.id)} /></TableCell>
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
              <TableHead>{t('guardrails.table.name')}</TableHead>
              <TableHead>{t('guardrails.table.kind')}</TableHead>
              <TableHead>{t('guardrails.table.members')}</TableHead>
              <TableHead>{t('guardrails.table.budget')}</TableHead>
              <TableHead>{t('guardrails.table.boostExpiresAt')}</TableHead>
              <TableHead>{t('guardrails.table.creator')}</TableHead>
              <TableHead>{t('guardrails.table.updatedAt')}</TableHead>
              <TableHead>{t('guardrails.table.status')}</TableHead>
              <TableHead className="w-32 text-right">{t('guardrails.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell><NameCell row={row} onOpenDetail={onOpenDetail} /></TableCell>
                <TableCell><KindCell row={row} /></TableCell>
                <TableCell><CountBadge count={memberCount(row)} unit={t('guardrails.table.memberUnit')} emptyTitle={t('guardrails.table.noMembersBound')} boundTitle={t('guardrails.table.boundMembers', { count: memberCount(row) })} /></TableCell>
                <TableCell><BudgetCell row={row} currencySymbol={currencySymbol} /></TableCell>
                <TableCell><BoostExpiryCell row={row} /></TableCell>
                <TableCell><CreatorCell row={row} /></TableCell>
                <TableCell><UpdatedCell row={row} /></TableCell>
                <TableCell><StatusCell row={row} canEdit={canEdit.member && canManageRow(row)} onToggle={onToggle} pending={isRowToggling(row.id)} /></TableCell>
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
            <TableHead>{t('guardrails.table.name')}</TableHead>
            <TableHead>{t('guardrails.table.kind')}</TableHead>
            <TableHead className="normal-case">{t('guardrails.table.boundKeys')}</TableHead>
            <TableHead>{t('guardrails.table.budget')}</TableHead>
            <TableHead>{t('guardrails.table.boostExpiresAt')}</TableHead>
            <TableHead>{t('guardrails.table.modelBlacklist')}</TableHead>
            <TableHead>{t('guardrails.table.ipWhitelist')}</TableHead>
            <TableHead>{t('guardrails.table.promptInjection')}</TableHead>
            <TableHead>{t('guardrails.table.creator')}</TableHead>
            <TableHead>{t('guardrails.table.updatedAt')}</TableHead>
            <TableHead>{t('guardrails.table.status')}</TableHead>
            <TableHead className="w-32 text-right">{t('guardrails.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keyRows.map((row) => {
            const injectionLabel = rawPromptInjectionMode(row)
              ? t(PROMPT_INJECTION_LABEL_KEY[rawPromptInjectionMode(row)!])
              : t(PROMPT_INJECTION_INHERIT_LABEL_KEY)
            return (
              <TableRow key={row.id}>
                <TableCell><NameCell row={row} onOpenDetail={onOpenDetail} /></TableCell>
                <TableCell><KindCell row={row} /></TableCell>
                <TableCell><CountBadge count={apiKeyCount(row)} unit={t('guardrails.table.keyUnit')} emptyTitle={t('guardrails.table.noKeysBound')} boundTitle={t('guardrails.table.boundKeysCount', { count: apiKeyCount(row) })} /></TableCell>
                <TableCell><BudgetCell row={row} currencySymbol={currencySymbol} /></TableCell>
                <TableCell><BoostExpiryCell row={row} /></TableCell>
                <TableCell><ModelBlacklistCell row={row} /></TableCell>
                <TableCell><IpWhitelistCell row={row} /></TableCell>
                <TableCell><InjectionCell label={injectionLabel} /></TableCell>
                <TableCell><CreatorCell row={row} /></TableCell>
                <TableCell><UpdatedCell row={row} /></TableCell>
                <TableCell><StatusCell row={row} canEdit={canEdit.key && canManageRow(row)} onToggle={onToggle} pending={isRowToggling(row.id)} /></TableCell>
                <TableCell className="text-right"><RowActions row={row} canEdit={canEdit.key && canManageRow(row)} canDelete={canDelete.key && canManageRow(row)} onOpenDetail={onOpenDetail} onDelete={onDelete} /></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </ScopeSection>
    </div>
  )
}
