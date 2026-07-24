/**
 * API Key 列表表格（PRD v1.0.3）：名称 / 类型 / 负责人 / 安全护栏 / 状态 / 本期消费·限额 / 最近调用 / 到期时间 / 操作
 * 行点击开详情抽屉；治理动作（停用/启用）行内直达，轮转/删除在抽屉。
 */
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { TruncatedText } from '@/components/ui/TruncatedText'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { LuCopy, LuFilterX, LuKeyRound, LuLoaderCircle, LuPlus, LuShieldCheck } from 'react-icons/lu'
import { formatDateTime } from '@/lib/format-date'
import { formatMoney } from '@/lib/utils'
import type { ApiKeyItem, ApiKeyType } from '@/types'
import {
  KEY_TYPE_LABEL,
  STATUS_LABEL,
  deriveKeyType,
  responsibleOf,
  periodSpendOf,
  lastCalledOf,
  isExpiringSoon,
  cap,
  formatLimit,
  type ApiKeyAction,
} from './derive'

/** key 是否已过期：瞬时点比较（expires_at 为带 Z 的 UTC ISO）。放组件外避免 render 期调 Date.now。 */
function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

const STATUS_MAP = {
  active: { label: STATUS_LABEL.active, variant: 'success' as const, dot: true },
  rotation_required: { label: STATUS_LABEL.rotation_required, variant: 'info' as const },
  limited: { label: STATUS_LABEL.limited, variant: 'warning' as const },
  expired: { label: STATUS_LABEL.expired, variant: 'warning' as const },
  disabled: { label: STATUS_LABEL.disabled, variant: 'outline' as const },
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
  /** 行级动作权限（需求方#68）：按该行 Key 类型 × 动作取权限码 */
  canAction: (type: ApiKeyType, action: ApiKeyAction) => boolean
  canReveal: boolean
  onOpenDetail: (item: ApiKeyItem) => void
  onToggleStatus: (item: ApiKeyItem) => void
  /** 复制完整明文（#298）：父组件调 reveal → 剪贴板 */
  onCopyKey: (item: ApiKeyItem) => void
  /** 正在 reveal 的 key id（行内 loading） */
  copyingKeyId: string | null
  /** 空态分型（PRD §7.4）：当前空间是否有任意 Key（用于区分「无 Key」vs「筛选无结果」） */
  hasKeys: boolean
  /** 是否处于筛选/搜索态 */
  isFiltered: boolean
  /** 是否可创建（无 Key 空态展示创建引导按钮） */
  canCreate: boolean
  /** 可见范围仅限自己（普通 Member，后端只回自己的行）：无 Key 空态显 Member 专属文案（#444） */
  selfScopeOnly: boolean
  /** 无 Key 空态点创建 */
  onCreate: () => void
  /** 筛选无结果空态点清空筛选 */
  onClearFilters: () => void
}

export function ApiKeyTable({
  isLoading,
  items,
  canAction,
  canReveal,
  onOpenDetail,
  onToggleStatus,
  onCopyKey,
  copyingKeyId,
  hasKeys,
  isFiltered,
  canCreate,
  selfScopeOnly,
  onCreate,
  onClearFilters,
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
          {/* normal-case 覆盖表头 mg-text-label 的 uppercase，保留「Key」首字母大写而非「KEY」 */}
          <TableHead className="normal-case">Key护栏</TableHead>
          <TableHead>{t('apiKeys.table.status')}</TableHead>
          <TableHead>本期消费 / 限额</TableHead>
          <TableHead>最近调用</TableHead>
          <TableHead>{t('apiKeys.table.expiresAt')}</TableHead>
          <TableHead className="w-32 text-right">{t('apiKeys.table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center py-10 text-mg-text-3">{t('common.loading')}</TableCell>
          </TableRow>
        ) : items.length === 0 ? (
          isFiltered && hasKeys ? (
            <EmptyState
              icon={<LuFilterX />}
              title="没有符合筛选条件的 Key"
              description="试试调整类型、状态、负责人筛选或搜索关键词"
              action={
                <Button variant="outline" size="sm" onClick={onClearFilters}>
                  清空筛选
                </Button>
              }
              colSpan={colSpan}
            />
          ) : selfScopeOnly ? (
            <EmptyState
              icon={<LuKeyRound />}
              title={t('apiKeys.emptySelfScope.title')}
              description={t('apiKeys.emptySelfScope.desc')}
              action={
                canCreate ? (
                  <Button variant="brand" size="sm" onClick={onCreate}>
                    <LuPlus className="w-4 h-4 mr-1.5" />
                    {t('apiKeys.create')}
                  </Button>
                ) : undefined
              }
              colSpan={colSpan}
            />
          ) : (
            <EmptyState
              icon={<LuKeyRound />}
              title="当前工作空间还没有 API Key"
              description="创建第一个 API Key，即可获取运行凭证接入模型调用"
              action={
                canCreate ? (
                  <Button variant="brand" size="sm" onClick={onCreate}>
                    <LuPlus className="w-4 h-4 mr-1.5" />
                    {t('apiKeys.create')}
                  </Button>
                ) : undefined
              }
              colSpan={colSpan}
            />
          )
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
            // qa#516：限额展示以 effective_limit（含护栏 per_api_key 预算，最严）优先
            const effLimit = record.effective_limit ?? record.limit
            const hasLimit = !!effLimit && Number(effLimit.amount) > 0
            const lastCalled = lastCalledOf(record)
            const isDisabled = record.status === 'disabled'
            const canToggle = isDisabled
              ? cap(record.capabilities?.can_enable, canAction(keyType, 'disable'))
              : cap(record.capabilities?.can_disable, canAction(keyType, 'disable'))
            const copyDisabledReason =
              !canReveal
                ? '无查看 API Key 明文权限'
                : record.status !== 'active'
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
                  <TruncatedText text={record.name} maxWidth={200} className="font-semibold text-mg-text-1 text-[13.5px]" />
                  {/* #298：名称下方掩码 + 复制完整明文按钮 */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="font-mono text-xs text-mg-text-3 tracking-tight">{record.masked}</span>
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
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${KEY_TYPE_CLASS[keyType]}`}>
                    {KEY_TYPE_LABEL[keyType]}
                  </span>
                </TableCell>
                <TableCell>
                  <TruncatedText
                    text={responsible.display_name || responsible.email}
                    maxWidth={140}
                    className="text-xs font-semibold text-mg-text-2"
                  />
                  {creatorDiffers && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-mg-text-3">
                      <span className="shrink-0">创建人</span>
                      <TruncatedText
                        text={record.owner.display_name || record.owner.email}
                        maxWidth={110}
                        className="text-xs text-mg-text-3"
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {guardrailNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {guardrailNames.slice(0, 3).map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/10 border border-green-500/25 text-green-600"
                        >
                          <LuShieldCheck className="w-3 h-3 shrink-0" />
                          {name}
                        </span>
                      ))}
                      {guardrailNames.length > 3 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-mg-fill-0 border border-mg-border text-mg-text-3">
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
                  {/* #148：限额直接带「限额」前缀，一眼区分于上方本期消费，无需额外 Hint */}
                  <div className="text-xs text-mg-text-3">{hasLimit ? `限额 ${formatLimit(record)}` : formatLimit(record)}</div>
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
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-mg-danger/10 border border-mg-danger/20">
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
                  <div className="flex justify-end gap-4 whitespace-nowrap text-xs font-bold">
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
