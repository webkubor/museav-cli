import * as React from 'react'
import { LuMessageSquare, LuEraser, LuSend } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Textarea } from './Textarea'
import { Button } from './Button'

export interface ComposerProps {
  value: string
  onChange: (val: string) => void
  onSend: () => void
  /** 省略时不展示"清空"按钮（如 PRD 要求某些工作台不展示清空入口时留空） */
  onClear?: () => void
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  isStreaming?: boolean
  onStop?: () => void
  activeChip?: React.ReactNode
  note?: string
  className?: string
  clearLabel?: string
  sendLabel?: string
  stopLabel?: string
  /** 语音识别任务没有文本框（PRD §7.1，内容改看是否已上传音频），发送是否可用不能再靠
   *  `value.trim()` 判断——传了这个就用它覆盖默认的"有文本才能发"判断 */
  sendEnabled?: boolean
  /** 语音识别任务用一句静态提示替换掉文本框（PRD App.tsx:18498 逐字对齐） */
  textareaSlot?: React.ReactNode
}

const Composer = React.forwardRef<HTMLTextAreaElement, ComposerProps>(
  (
    {
      value,
      onChange,
      onSend,
      onClear,
      placeholder,
      disabled = false,
      loading = false,
      isStreaming = false,
      onStop,
      activeChip,
      note,
      className,
      clearLabel = '清空',
      sendLabel = '发送',
      stopLabel = '停止',
      sendEnabled,
      textareaSlot,
    },
    ref
  ) => {
    const canSend = sendEnabled ?? Boolean(value.trim())
    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        if (canSend && !loading && !disabled && !isStreaming) {
          onSend()
        }
      }
    }

    return (
      <div className={cn('composer-rainbow-flow rounded-md mg-panel-tight flex flex-col gap-3 relative transition-all duration-300', className)}>
        {/* 输入域：语音识别任务没有文本框，textareaSlot 传了就整个替换掉 */}
        {textareaSlot ?? (
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isStreaming}
            className="min-h-[var(--mg-textarea-min-h)] max-h-[168px] resize-none border-0 bg-transparent p-[var(--mg-space-1)] shadow-none focus:ring-0 focus-visible:ring-0 hover:border-transparent focus:border-transparent mg-text-body w-full outline-none"
          />
        )}

        {/* 底部动作栏 */}
        <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-mg-border/50">
          <div className="min-w-0 flex-1">
            {activeChip ? (
              activeChip
            ) : (
              <div className="inline-flex items-center gap-1.5 min-w-0 text-mg-text-2 mg-compact-badge">
                <LuMessageSquare size={13} className="shrink-0" />
                <span className="truncate">对话测试</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onClear && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={loading || disabled || isStreaming}
                className="rounded-lg cursor-pointer"
              >
                <LuEraser size={14} />
                {clearLabel}
              </Button>
            )}
            {isStreaming && onStop ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={onStop}
                className="rounded-lg cursor-pointer"
              >
                {stopLabel}
              </Button>
            ) : (
              <Button
                variant="brand"
                size="sm"
                onClick={onSend}
                loading={loading}
                disabled={!canSend || disabled}
                className="rounded-lg cursor-pointer"
              >
                {!loading && <LuSend size={14} className="mr-1" />}
                {sendLabel}
              </Button>
            )}
          </div>
        </div>

        {/* 底部备注提示 */}
        {note && (
          <p className="margin-0 mt-1 text-center mg-compact-badge text-mg-text-3/80 tracking-wide select-none">
            {note}
          </p>
        )}
      </div>
    )
  }
)

Composer.displayName = 'Composer'

export { Composer }
