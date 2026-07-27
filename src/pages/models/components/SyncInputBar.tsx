import * as React from 'react'
import { useRef } from 'react'
import { LuPaperclip, LuSend, LuImage, LuMusic, LuVideo, LuX } from 'react-icons/lu'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import '../styles/sync-input-bar.css'

type AttachmentType = 'image' | 'audio' | 'video'

interface SupportedAttachmentType {
  type: AttachmentType
  supportedModelCount: number
  totalModelCount: number
}

interface SyncAttachment {
  name: string
  type: string
  url?: string
}

/**
 * 同步输入区（PRD §7.4/§7.5）
 * 唯一共享输入框：所有对比列读取同一份文本草稿；共用附件入口、预估费用与发送按钮。
 * 每轮最多保留一个附件；只展示本次预估费用，不展示账户余额。
 */
export interface SyncInputBarProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  isStreaming: boolean
  onStop: () => void
  estimatedCost: string
  supportedAttachmentTypes: Array<SupportedAttachmentType>
  attachment: SyncAttachment | null
  onAttach: (file: File) => void
  onRemoveAttachment: () => void
  className?: string
}

const ATTACHMENT_ACCEPT: Record<AttachmentType, string> = {
  image: 'image/png,image/jpeg,image/webp',
  audio: 'audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/webm',
  video: 'video/mp4,video/webm,video/quicktime',
}

const ATTACHMENT_ICON: Record<AttachmentType, React.ReactNode> = {
  image: <LuImage size={13} />,
  audio: <LuMusic size={13} />,
  video: <LuVideo size={13} />,
}

export function SyncInputBar({
  value,
  onChange,
  onSend,
  isStreaming,
  onStop,
  estimatedCost,
  supportedAttachmentTypes,
  attachment,
  onAttach,
  onRemoveAttachment,
  className,
}: SyncInputBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const acceptAttr = supportedAttachmentTypes.map((t) => ATTACHMENT_ACCEPT[t.type]).join(',')
  const canAttach = !isStreaming && !attachment && supportedAttachmentTypes.length > 0

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (value.trim() && !isStreaming) {
        onSend()
      }
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onAttach(file)
    event.target.value = ''
  }

  return (
    <div className={cn('sync-input-bar rounded-md flex flex-col gap-3', className)}>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入 Prompt，Enter 发送，Shift+Enter 换行..."
        disabled={isStreaming}
        className="sync-input-bar__textarea"
      />

      {attachment && (
        <div className="sync-input-bar__attachment">
          <span className="sync-input-bar__attachment-name" title={attachment.name}>
            {attachment.name}
          </span>
          <button
            type="button"
            onClick={onRemoveAttachment}
            className="sync-input-bar__attachment-remove"
            aria-label="移除附件"
          >
            <LuX size={12} />
          </button>
        </div>
      )}

      <div className="sync-input-bar__footer">
        <div className="sync-input-bar__types">
          <button
            type="button"
            className="sync-input-bar__attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canAttach}
            title="添加附件"
            aria-label="添加附件"
          >
            <LuPaperclip size={14} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            className="hidden"
            onChange={handleFileChange}
          />
          {supportedAttachmentTypes.map((item) => (
            <span key={item.type} className="sync-input-bar__type-chip">
              {ATTACHMENT_ICON[item.type]}
              {item.supportedModelCount < item.totalModelCount && (
                <span className="sync-input-bar__type-hint">
                  {item.supportedModelCount} 个模型支持
                </span>
              )}
            </span>
          ))}
        </div>

        <div className="sync-input-bar__actions">
          <span className="sync-input-bar__cost">本次预估费用 {estimatedCost}</span>
          {isStreaming ? (
            <Button variant="destructive" size="sm" onClick={onStop} className="rounded-lg">
              停止
            </Button>
          ) : (
            <Button
              variant="brand"
              size="sm"
              onClick={onSend}
              disabled={!value.trim()}
              className="rounded-lg"
            >
              <LuSend size={14} />
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SyncInputBar
