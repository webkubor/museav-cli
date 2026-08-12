/**
 * 成员头像：有 avatar_url 显示图片，否则首字母圆圈（accent 色）。
 * 工作空间成员表 / 企业成员表复用，保证两处视觉统一。
 */
export function MemberAvatar({
  account,
  accent = 'emerald',
}: {
  account: { avatar_url?: string | null; display_name?: string | null }
  accent?: 'brand' | 'emerald'
}) {
  if (account.avatar_url) {
    return <img src={account.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
  }
  const bg = accent === 'emerald' ? 'bg-[var(--mg-avatar-success-bg)]' : 'bg-brand-base'
  return (
    <div className={`w-7 h-7 rounded-full ${bg} text-white text-xs font-bold flex items-center justify-center shrink-0 uppercase`}>
      {account.display_name?.[0] ?? '?'}
    </div>
  )
}
