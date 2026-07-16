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
import { LuSettings, LuSearch, LuShieldCheck, LuUserRound, LuKeyRound, LuInfo } from 'react-icons/lu'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import {
  KIND_LABEL,
  PROMPT_INJECTION_LABEL,
  PROMPT_INJECTION_HINTS,
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

/** 列头「提示词注入」+ info tooltip（对齐 PRD：字段标题右侧说明命中后的处理方式），与表单内 tooltip 同源文案。 */
function PromptInjectionHeaderLabel() {
  return (
    <span className="inline-flex items-center gap-1">
      提示词注入
      <span className="group relative inline-flex">
        <button
          type="button"
          aria-label="命中后的处理方式"
          className="inline-flex text-mg-text-3 outline-none transition-colors hover:text-mg-text-2 focus-visible:text-mg-text-2"
        >
          <LuInfo className="h-3.5 w-3.5" />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-6 z-20 w-[280px] rounded-md border border-mg-border bg-mg-bg-0 p-3 text-left font-normal normal-case opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <span className="mb-1.5 block text-[11px] font-bold text-mg-text-1">命中后的处理方式</span>
          {PROMPT_INJECTION_HINTS.map((h) => (
            <span key={h.mode} className="mt-1 flex gap-1.5 text-[10px]">
              <span className="shrink-0 font-bold text-mg-text-2">{PROMPT_INJECTION_LABEL[h.mode]}</span>
              <span className="font-medium leading-snug text-mg-text-3">{h.text}</span>
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}

// ── 共用单元格 ──────────────────────────────────────────────────────────────

function NameCell({ row, onOpenDetail }: { row: GuardrailDetail; onOpenDetail: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(row.id)}
      className="group flex max-w-[240px] items-center gap-2 text-left"
    >
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-bold text-mg-text-1 group-hover:text-brand-base">
          {row.name}
        </span>
        {row.description && (
          <span className="mt-0.5 block truncate text-xs font-medium text-mg-text-3">
            {row.description}
          </span>
        )}
      </span>
      {row.is_default && row.status === 'active' && (
        <Badge variant="warning" className="shrink-0">默认</Badge>
      )}
    </button>
  )
}

function TagCell({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <span className="text-xs text-mg-text-3">不限制</span>
  }
  return (
    <div className="flex max-w-[220px] flex-wrap gap-1.5">
      {values.slice(0, 3).map((value) => (
        <span
          key={value}
          className="rounded-full border border-mg-border bg-mg-fill-0 px-2 py-0.5 font-mono text-xs font-semibold text-mg-text-2"
        >
          {value}
        </span>
      ))}
      {values.length > 3 && (
        <span className="rounded-full bg-mg-fill-1 px-2 py-0.5 text-xs font-bold text-mg-text-3">
          +{values.length - 3}
        </span>
      )}
    </div>
  )
}

function KindBadge({ row }: { row: GuardrailDetail }) {
  const kind = deriveKind(row)
  return (
    <Badge variant={kind === 'boost' ? 'warning' : 'secondary'}>{KIND_LABEL[kind]}</Badge>
  )
}

function CountBadge({ count, unit }: { count: number; unit: string }) {
  return (
    <Badge variant={count > 0 ? 'info' : 'outline'}>
      {count} {unit}
    </Badge>
  )
}

function StatusCell({
  row,
  canEdit,
  onToggle,
}: {
  row: GuardrailDetail
  canEdit: boolean
  onToggle: (args: { id: string; status: 'active' | 'inactive' }) => void
}) {
  const active = row.status === 'active'
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={!canEdit}
        onChange={(checked) => onToggle({ id: row.id, status: checked ? 'active' : 'inactive' })}
      />
      <span className={cn('mg-text-caption font-semibold', active ? 'text-mg-success' : 'text-mg-text-3')}>
        {active ? '启用' : '停用'}
      </span>
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
      <Button size="sm" variant="outline" onClick={() => onOpenDetail(row.id)} className="h-7 text-xs font-semibold">
        <LuSettings className="w-3.5 h-3.5 mr-1" />
        {canEdit ? '配置' : '查看'}
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
        <h4 className="text-sm font-bold text-mg-text-1">{meta.title}</h4>
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
  canCreate: boolean
  showMember: boolean
  currencySymbol: string
  search: Record<GuardrailScope, string>
  onSearchChange: (scope: GuardrailScope, value: string) => void
  onOpenDetail: (id: string) => void
  onToggle: (args: { id: string; status: 'active' | 'inactive' }) => void
  onDelete: (target: { id: string; name: string }) => void
  onCreate: () => void
}

export function GuardrailSections(props: GuardrailSectionsProps) {
  const {
    guardrails, isLoading, canEdit, canDelete, canCreate, showMember, currencySymbol,
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
        canCreate={canCreate}
        onCreate={onCreate}
      >
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>工作空间总预算</TableHead>
            {showMember && <TableHead>默认个人预算</TableHead>}
            <TableHead>默认 Key 预算</TableHead>
            <TableHead>模型黑名单</TableHead>
            <TableHead>IP 白名单</TableHead>
            <TableHead><PromptInjectionHeaderLabel /></TableHead>
            <TableHead>创建人</TableHead>
            <TableHead>最近更新</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {globalRows.map((row) => (
            <TableRow key={row.id}>
              <TableCell><NameCell row={row} onOpenDetail={onOpenDetail} /></TableCell>
              <TableCell className="text-xs font-semibold text-mg-text-2">
                {formatBudget(currencySymbol, budgetByScope(row, 'guardrail_total'))}
              </TableCell>
              {showMember && (
                <TableCell className="text-xs font-semibold text-mg-text-2">
                  {formatBudget(currencySymbol, budgetByScope(row, 'per_member'))}
                </TableCell>
              )}
              <TableCell className="text-xs font-semibold text-mg-text-2">
                {formatBudget(currencySymbol, budgetByScope(row, 'per_api_key'))}
              </TableCell>
              <TableCell><TagCell values={metadataList(row, 'model_blacklist')} /></TableCell>
              <TableCell><TagCell values={metadataList(row, 'ip_whitelist')} /></TableCell>
              <TableCell className="text-xs font-semibold text-mg-text-2">{PROMPT_INJECTION_LABEL[guardrailPromptInjectionMode(row)]}</TableCell>
              {/* 创建人（PRD §7.2 / #52）：只显姓名，缺失显「—」，绝不回退到 account_id */}
              <TableCell className="text-xs font-semibold text-mg-text-2">
                {row.created_by?.display_name || <span className="font-normal text-mg-text-3">—</span>}
              </TableCell>
              <TableCell className="text-xs text-mg-text-3">{formatDateTime(row.updated_at)}</TableCell>
              <TableCell><StatusCell row={row} canEdit={canEdit.global} onToggle={onToggle} /></TableCell>
              <TableCell className="text-right"><RowActions row={row} canEdit={canEdit.global} canDelete={canDelete.global} onOpenDetail={onOpenDetail} onDelete={onDelete} /></TableCell>
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
          canCreate={canCreate}
          onCreate={onCreate}
        >
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>成员</TableHead>
              <TableHead>预算</TableHead>
              <TableHead>提额到期时间</TableHead>
              <TableHead>最近更新</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell><NameCell row={row} onOpenDetail={onOpenDetail} /></TableCell>
                <TableCell><KindBadge row={row} /></TableCell>
                <TableCell><CountBadge count={memberCount(row)} unit="名成员" /></TableCell>
                <TableCell className="text-xs font-semibold text-mg-text-2">
                  {formatBudget(currencySymbol, primaryBudget(row))}
                </TableCell>
                <TableCell className="text-xs text-mg-text-3">
                  {deriveKind(row) === 'boost'
                    ? (boostExpiry(row) ? formatDateTime(boostExpiry(row)) : '永不过期')
                    : '-'}
                </TableCell>
                <TableCell className="text-xs text-mg-text-3">{formatDateTime(row.updated_at)}</TableCell>
                <TableCell><StatusCell row={row} canEdit={canEdit.member} onToggle={onToggle} /></TableCell>
                <TableCell className="text-right"><RowActions row={row} canEdit={canEdit.member} canDelete={canDelete.member} onOpenDetail={onOpenDetail} onDelete={onDelete} /></TableCell>
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
        canCreate={canCreate}
        onCreate={onCreate}
      >
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>绑定 Key</TableHead>
            <TableHead>预算</TableHead>
            <TableHead>提额到期时间</TableHead>
            <TableHead>模型黑名单</TableHead>
            <TableHead>IP 白名单</TableHead>
            <TableHead><PromptInjectionHeaderLabel /></TableHead>
            <TableHead>最近更新</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keyRows.map((row) => {
            const boost = deriveKind(row) === 'boost'
            return (
              <TableRow key={row.id}>
                <TableCell><NameCell row={row} onOpenDetail={onOpenDetail} /></TableCell>
                <TableCell><KindBadge row={row} /></TableCell>
                <TableCell><CountBadge count={apiKeyCount(row)} unit="个 Key" /></TableCell>
                <TableCell className="text-xs font-semibold text-mg-text-2">
                  {formatBudget(currencySymbol, primaryBudget(row))}
                </TableCell>
                <TableCell className="text-xs text-mg-text-3">
                  {boost ? (boostExpiry(row) ? formatDateTime(boostExpiry(row)) : '永不过期') : '-'}
                </TableCell>
                <TableCell>
                  {boost ? <span className="text-xs text-mg-text-3">不适用</span> : <TagCell values={metadataList(row, 'model_blacklist')} />}
                </TableCell>
                <TableCell>
                  {boost ? <span className="text-xs text-mg-text-3">不适用</span> : <TagCell values={metadataList(row, 'ip_whitelist')} />}
                </TableCell>
                <TableCell className="text-xs font-semibold text-mg-text-2">
                  {boost
                    ? <span className="font-normal text-mg-text-3">不适用</span>
                    : (rawPromptInjectionMode(row)
                        ? PROMPT_INJECTION_LABEL[rawPromptInjectionMode(row)!]
                        : <span className="font-normal text-mg-text-3">{PROMPT_INJECTION_INHERIT_LABEL}</span>)}
                </TableCell>
                <TableCell className="text-xs text-mg-text-3">{formatDateTime(row.updated_at)}</TableCell>
                <TableCell><StatusCell row={row} canEdit={canEdit.key} onToggle={onToggle} /></TableCell>
                <TableCell className="text-right"><RowActions row={row} canEdit={canEdit.key} canDelete={canDelete.key} onOpenDetail={onOpenDetail} onDelete={onDelete} /></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </ScopeSection>
    </div>
  )
}
