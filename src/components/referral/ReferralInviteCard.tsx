/**
 * 推荐计划邀请链接卡片
 * 路由：/referral、/settings/account
 * API 来源：GET /tenants/:tenantId/referral/overview
 */

import { LuArrowRight, LuBadgePercent, LuCheck, LuLink, LuShare2, LuTicketPercent } from 'react-icons/lu'
import { CopyButton } from '@/components/ui/CopyButton'

const DEFAULT_RULES_HREF = '#referral-rules'

interface ReferralInviteCardProps {
  inviteLink: string
  inviteCode: string
  inviteLinkLabel?: string
  inviteCodeLabel?: string
  inviteHint?: string
  copySuccess?: string
  copyCodeSuccess?: string
  realtimeLabel?: string
  balanceLabel?: string
  rulesLinkLabel?: string
  rulesHref?: string
  compact?: boolean
}

/** 展示并复制推荐计划专属邀请信息。 */
export function ReferralInviteCard({
  inviteLink,
  inviteCode,
  inviteLinkLabel = '我的专属邀请链接',
  inviteCodeLabel = '邀请码',
  inviteHint = '分享链接给好友，好友注册并消费后您可获得返佣奖励',
  copySuccess = '邀请链接已复制',
  copyCodeSuccess = '邀请码已复制',
  realtimeLabel = '实时计返佣',
  balanceLabel = '奖励余额可直接抵扣消费',
  rulesLinkLabel = '查看分润规则',
  rulesHref = DEFAULT_RULES_HREF,
  compact = false,
}: ReferralInviteCardProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-mg-border bg-mg-fill-0/40 py-1.5 pl-4 pr-1.5">
        <LuLink size={14} className="shrink-0 text-brand-base" />
        <span className="min-w-0 flex-1 truncate text-xs font-mono text-mg-text-2" title={inviteLink}>
          {inviteLink || '—'}
        </span>
        <CopyButton value={inviteLink} aria-label="复制邀请链接" toast={copySuccess} />
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-mg-border bg-card-bg p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brand-base/35 via-brand-base/10 to-transparent" />
      <div className="relative flex h-full flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand-base/15 bg-brand-base/10 text-brand-base">
              <LuLink size={17} />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-bold text-mg-text-1">{inviteLinkLabel}</p>
              <p className="max-w-[52ch] text-xs leading-relaxed text-mg-text-3">{inviteHint}</p>
            </div>
          </div>

          <div className="inline-flex max-w-full shrink-0 items-center gap-2 self-start rounded-full border border-mg-border bg-mg-fill-0/55 px-3 py-1 text-xs">
            <LuTicketPercent size={13} className="shrink-0 text-brand-base" />
            <span className="shrink-0 text-mg-text-3">{inviteCodeLabel}</span>
            <span className="min-w-0 max-w-[9rem] truncate font-mono font-bold tracking-wider text-mg-text-1">
              {inviteCode || '—'}
            </span>
            <CopyButton
              value={inviteCode}
              aria-label={`复制${inviteCodeLabel}`}
              toast={copyCodeSuccess}
              className="-mr-1"
            />
          </div>
        </div>

        <div className="flex min-h-[54px] flex-col gap-2 rounded-md border border-mg-border bg-mg-fill-0 p-2 transition-colors hover:border-brand-base/35 focus-within:border-brand-base/45 sm:flex-row sm:items-center sm:gap-0 sm:p-0">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1 sm:px-4 sm:py-3">
            <LuShare2 size={15} className="shrink-0 text-brand-base" />
            <span className="truncate font-mono text-[13px] font-medium text-mg-text-1" title={inviteLink}>
              {inviteLink || '—'}
            </span>
          </div>
          <CopyButton
            value={inviteLink}
            aria-label="复制邀请链接"
            toast={copySuccess}
            size="md"
            className="mb-1 mr-1 self-end sm:m-1.5 sm:self-auto"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-mg-border bg-mg-fill-0/45 px-2.5 py-1 text-xs font-semibold text-mg-text-2">
              <LuBadgePercent size={12} className="text-brand-base" />
              {realtimeLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-mg-border bg-mg-fill-0/45 px-2.5 py-1 text-xs font-semibold text-mg-text-2">
              <LuCheck size={12} className="text-brand-base" />
              {balanceLabel}
            </span>
          </div>
          <a
            href={rulesHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-base transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow"
          >
            {rulesLinkLabel}
            <LuArrowRight size={13} />
          </a>
        </div>
      </div>
    </div>
  )
}
