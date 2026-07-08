/**
 * 统一复制按钮 —— 全站「复制到剪贴板」交互的唯一真源
 * 收口 useCopy + 反馈 + toast，禁止各页面再手写复制图标/按钮。
 *
 * 场景约定（DESIGN.md · Components）：
 * - variant="icon"（默认）：行内 / 字段行 / ID / 链接旁的紧凑复制，一个图标搞定
 * - variant="labeled"：独立强调的复制 CTA（如新建 Key 横幅、收银台付款码），走 Button 基础件
 */
import { LuCheck, LuCopy } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { useCopy } from '@/hooks/use-copy'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'

type CopyVariant = 'icon' | 'labeled'
type CopySize = 'sm' | 'md'

export interface CopyButtonProps {
  /** 要复制的文本；为空时按钮 disabled */
  value: string
  /** icon=紧凑图标钮（默认）；labeled=带文字的强调按钮 */
  variant?: CopyVariant
  /** 尺寸：icon 变体控制方框/图标大小，labeled 变体透传给 Button */
  size?: CopySize
  /** labeled 变体的文字，默认「复制」 */
  label?: string
  /** 复制成功后文字，默认「已复制」（labeled 变体用） */
  copiedLabel?: string
  /** labeled 变体底色，默认 outline */
  buttonVariant?: 'brand' | 'outline' | 'secondary' | 'ghost'
  /** 成功 toast 文案；传 false 则不弹 toast，只切图标反馈 */
  toast?: string | false
  /** 复制成功回调 */
  onCopied?: () => void
  disabled?: boolean
  className?: string
  /** icon 变体的无障碍标签，默认「复制」 */
  'aria-label'?: string
}

const ICON_BOX: Record<CopySize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
}
const ICON_SIZE: Record<CopySize, number> = { sm: 14, md: 15 }

/** 全站统一的复制按钮。 */
export function CopyButton({
  value,
  variant = 'icon',
  size = 'sm',
  label = '复制',
  copiedLabel = '已复制',
  buttonVariant = 'outline',
  toast = '已复制到剪贴板',
  onCopied,
  disabled,
  className,
  'aria-label': ariaLabel,
}: CopyButtonProps) {
  const { copy, copied } = useCopy()
  const isDisabled = disabled || !value

  const handleCopy = async () => {
    if (!value) {
      appToast.error('暂无可复制内容')
      return
    }
    const ok = await copy(value)
    if (!ok) {
      appToast.error('复制失败，请手动复制')
      return
    }
    if (toast) appToast.success(toast)
    onCopied?.()
  }

  if (variant === 'labeled') {
    return (
      <Button
        variant={copied ? 'outline' : buttonVariant}
        size="sm"
        onClick={handleCopy}
        disabled={isDisabled}
        icon={copied ? <LuCheck size={ICON_SIZE[size]} /> : <LuCopy size={ICON_SIZE[size]} />}
        className={cn('shrink-0', className)}
      >
        {copied ? copiedLabel : label}
      </Button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={isDisabled}
      aria-label={ariaLabel ?? label}
      title={copied ? copiedLabel : (ariaLabel ?? label)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm text-mg-text-3 transition-colors',
        'hover:bg-brand-base/10 hover:text-brand-base',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow',
        'disabled:cursor-not-allowed disabled:opacity-50',
        ICON_BOX[size],
        className
      )}
    >
      {copied ? (
        <LuCheck size={ICON_SIZE[size]} className="text-mg-success" />
      ) : (
        <LuCopy size={ICON_SIZE[size]} />
      )}
    </button>
  )
}
