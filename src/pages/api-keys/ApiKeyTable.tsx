/**
 * API Key 列表表格（PRD v1.0.3）：名称 / 类型 / 负责人 / 安全护栏 / 状态 / 本期消费·限额 / 最近调用 / 到期时间 / 操作
 * 行点击开详情抽屉；治理动作（停用/启用）行内直达，轮转/删除在抽屉。
 */
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { LuCopy, LuKeyRound, LuLoaderCircle, LuShieldCheck } from 'react-icons/lu'
import { formatDateTime } from '@/lib/format-date'
import { formatMoney } from '@/lib/utils'
import type { ApiKeyItem } from '@/types'
import {
  KEY_TYPE_LABEL,
  STATUS_LABEL,
  deriveKeyType,
  responsibleOf,
  periodSpendOf,
  lastCalledOf,
  isExpiringSoon,
  cap,
} from './derive'

/** key 是否已过期：瞬时点比较（expires_at 为带 Z 的 UTC ISO）。放组件外避免 render 期调 Date.now。 */
function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

const PERIOD_LABEL: Record<string, string> = { hour: '小时', day: '日', week: '周', month: '月' }

/** 限额副标：「¥800 / 每月」或「不限额」 */
function limitLabel(item: ApiKeyItem): string {
  const l = item.limit
  if (!l || !l.amount || Number(l.amount) <= 0) return '不限额'
  const unit = PERIOD_LABEL[l.period_unit] ?? l.period_unit
  const per = l.period_length && l.period_length > 1 ? `每 ${l.period_length} ${unit}` : `每${unit}`
  return `${l.currency} ${formatMoney(l.amount, '')} / ${per}`
}

const STATUS_MAP = {
  active: { label: STATUS_LABEL.active, variant: 'success' as const, dot: true },
  disabled: { label: STATUS_LABEL.disabled, variant: 'outline' as const },
  expired: { label: STATUS_LABEL.expired, variant: 'warning' as const },
  limit_reached: { label: STATUS_LABEL.limit_reached, variant: 'warning' as const },
  revoked: { label: STATUS_LABEL.revoked, variant: 'danger' as const },
}

const KEY_TYPE_CLASS: Record<string, string> = {
  personal: 'bg-mg-fill-0 border-mg-border text-mg-text-2',
  member: 'bg-brand-base/10 border-brand-base/25 text-brand-base',
  service: 'bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400',
}

type Props = {
  isLoading: boolean
  items: ApiKeyItem[]
  canRevoke: boolean
  canManage: boolean
  onRevoke: (target: { id: string; name: string }) => void
  onEditGuardrail: (item: ApiKeyItem) => void
  onOpenDetail: (item: ApiKeyItem) => void
  onToggleStatus: (item: ApiKeyItem) => void
  /** 复制完整明文（#298）：父组件调 reveal → 剪贴板 */
  onCopyKey: (item: ApiKeyItem) => void
  /** 正在 reveal 的 key id（行内 loading） */
  copyingKeyId: string | null
}

export function ApiKeyTable({
  isLoading,
  items,
  canRevoke,
  canManage,
  onRevoke,
  onEditGuardrail,
  onOpenDetail,
  onToggleStatus,
  onCopyKey,
  copyingKeyId,
}: Props) {
  const { t } = useTranslation()
  const colSpan = 9

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('apiKeys.table.name')}</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>负责人</TableHead>
          <TableHead>
            <span className="inline-flex items-center gap-1">
              <LuShieldCheck className="w-3.5 h-3.5 text-green-500" />
              安全护栏
            </span>
          </TableHead>
          <TableHead>{t('apiKeys.table.status')}</TableHead>
          <TableHead>本期消费 / 限额</TableHead>
          <TableHead>最近调用</TableHead>
          <TableHead>{t('apiKeys.table.expiresAt')}</TableHead>
          <TableHead className="text-right">{t('apiKeys.table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center py-10 text-mg-text-3">{t('common.loading')}</TableCell>
          </TableRow>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<LuKeyRound />}
            title={t('apiKeys.table.noData')}
            colSpan={colSpan}
          />
        ) : (
          items.map((record) => {
            const guardrailNames = (record.guardrails ?? []).map((g) => g.name).filter(Boolean)
            const keyType = deriveKeyType(record)
            const responsible = responsibleOf(record)
            const creatorDiffers =
              record.owner?.account_id &&
              responsible.account_id &&
              record.owner.account_id !== responsible.account_id
            const periodSpend = periodSpendOf(record)
            const lastCalled = lastCalledOf(record)
            const isDisabled = record.status === 'disabled'
            const canToggle = isDisabled
              ? cap(record.can_enable, canManage)
              : cap(record.can_disable, canManage)
            const copyDisabledReason =
              record.status !== 'active'
                ? t('apiKeys.table.copyUnavailableInactive')
                : record.revealable
                  ? null
                  : t('apiKeys.table.copyUnavailableLegacy')
            return (
              <TableRow
                key={record.api_key_id}
                className="cursor-pointer"
                onClick={() => onOpenDetail(record)}
              >
                <TableCell>
                  <div className="font-semibold text-mg-text-1 text-[13.5px]">{record.name}</div>
                  {/* #298：名称下方掩码 + 复制完整明文按钮 */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-mg-text-3 tracking-tight">{record.masked}</span>
                    <button
                      type="button"
                      aria-label={copyDisabledReason ?? t('apiKeys.table.copy')}
                      title={copyDisabledReason ?? t('apiKeys.table.copy')}
                      disabled={copyDisabledReason !== null || copyingKeyId !== null}
                      onClick={(e) => { e.stopPropagation(); onCopyKey(record) }}
                      className="p-0.5 text-mg-text-3 hover:text-brand-base transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-mg-text-3"
                    >
                      {copyingKeyId === record.api_key_id ? (
                        <LuLoaderCircle className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LuCopy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${KEY_TYPE_CLASS[keyType]}`}>
                    {KEY_TYPE_LABEL[keyType]}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-semibold text-mg-text-1">
                    {responsible.display_name || responsible.email || '—'}
                  </div>
                  {creatorDiffers && (
                    <div className="text-[11px] text-mg-text-3">
                      创建人 {record.owner.display_name || record.owner.email}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {guardrailNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {guardrailNames.slice(0, 3).map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-500/10 border border-green-500/25 text-green-600"
                        >
                          <LuShieldCheck className="w-3 h-3 shrink-0" />
                          {name}
                        </span>
                      ))}
                      {guardrailNames.length > 3 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-mg-fill-0 border border-mg-border text-mg-text-3">
                          +{guardrailNames.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-mg-text-3 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={record.status} statusMap={STATUS_MAP} fallback={record.status} />
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs text-mg-text-1 tabular-nums">
                    {periodSpend?.amount
                      ? `${periodSpend.currency} ${formatMoney(periodSpend.amount, '')}`
                      : <span className="text-mg-text-3">—</span>}
                  </div>
                  <div className="text-[11px] text-mg-text-3">{limitLabel(record)}</div>
                </TableCell>
                <TableCell className="text-xs text-mg-text-2">
                  {lastCalled ? formatDateTime(lastCalled) : <span className="text-mg-text-3">尚未调用</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {!record.expires_at ? (
                    <span className="text-mg-text-3">{t('apiKeys.table.neverExpires')}</span>
                  ) : isExpired(record.expires_at) ? (
                    <span className="inline-flex items-center gap-1.5 text-mg-danger font-semibold">
                      {formatDateTime(record.expires_at)}
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-mg-danger/10 border border-mg-danger/20">
                        {t('apiKeys.table.expired')}
                      </span>
                    </span>
                  ) : (
                    <span className={isExpiringSoon(record) ? 'text-mg-warning font-semibold' : 'text-mg-text-2'}>
                      {formatDateTime(record.expires_at)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-4 text-xs font-bold">
                    <button
                      onClick={() => onOpenDetail(record)}
                      className="text-brand-base hover:text-brand-deep transition-colors cursor-pointer"
                    >
                      详情
                    </button>
                    {record.status !== 'revoked' && canToggle && (
                      <button
                        onClick={() => onToggleStatus(record)}
                        className="text-mg-text-2 hover:text-mg-text-1 transition-colors cursor-pointer"
                      >
                        {isDisabled ? '启用' : '停用'}
                      </button>
                    )}
                    <button
                      onClick={() => onEditGuardrail(record)}
                      className="text-mg-text-2 hover:text-mg-text-1 transition-colors cursor-pointer"
                    >
                      编辑
                    </button>
                    {canRevoke && (
                      <button
                        onClick={() => onRevoke({ id: record.api_key_id, name: record.name })}
                        className="text-mg-danger hover:text-mg-danger/80 transition-colors cursor-pointer"
                      >
                        {t('apiKeys.table.revoke')}
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
