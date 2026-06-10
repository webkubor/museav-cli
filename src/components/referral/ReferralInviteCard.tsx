import { useState } from 'react'
import { LuLink, LuCopy, LuCheck } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'

interface ReferralInviteCardProps {
  inviteLink: string
  inviteCode: string
  inviteLinkLabel?: string
  inviteCodeLabel?: string
  inviteHint?: string
  copySuccess?: string
  compact?: boolean
}

export function ReferralInviteCard({
  inviteLink,
  inviteCode,
  inviteLinkLabel = '我的专属邀请链接',
  inviteCodeLabel = '邀请码',
  inviteHint = '分享链接给好友，好友注册并消费后您可获得返佣奖励',
  copySuccess = '邀请链接已复制',
  compact = false,
}: ReferralInviteCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink)
    appToast.success(copySuccess)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-mg-border bg-mg-fill-0/40 px-4 py-2.5">
          <LuLink size={14} className="shrink-0 text-brand-base" />
          <span className="truncate text-xs font-mono text-mg-text-1">{inviteLink || '—'}</span>
        </div>
        <Button
          variant={copied ? 'outline' : 'brand'}
          size="sm"
          onClick={handleCopy}
          className="shrink-0 rounded-xl px-4"
        >
          {copied ? <LuCheck size={13} className="mr-1" /> : <LuCopy size={13} className="mr-1" />}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-mg-border bg-card-bg p-5 space-y-3 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-gradient-to-br from-brand-base via-transparent to-transparent" />
      <div className="relative space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-base/10 border border-brand-base/15 flex items-center justify-center text-brand-base">
            <LuLink size={16} />
          </div>
          <p className="text-sm font-bold text-mg-text-0">{inviteLinkLabel}</p>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 min-w-0 flex items-center rounded-xl border border-mg-border bg-mg-fill-0/40 px-4 py-3">
            <span className="truncate text-xs font-mono text-mg-text-1">{inviteLink || '—'}</span>
          </div>
          <Button
            variant={copied ? 'outline' : 'brand'}
            size="sm"
            onClick={handleCopy}
            className="shrink-0 rounded-xl px-5"
          >
            {copied ? <LuCheck size={13} className="mr-1.5" /> : <LuCopy size={13} className="mr-1.5" />}
            {copied ? '已复制' : '复制链接'}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-mg-text-2">{inviteCodeLabel}</span>
          <span className="rounded-lg border border-mg-border bg-mg-fill-0/60 px-3 py-1 text-xs font-mono text-mg-text-0 tracking-widest font-bold">
            {inviteCode || '—'}
          </span>
        </div>

        <p className="text-xs text-mg-text-2 leading-relaxed">{inviteHint}</p>
      </div>
    </div>
  )
}
