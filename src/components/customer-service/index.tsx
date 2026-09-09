import { Button } from '@/components/ui/Button'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

import { MarkdownContent } from '@/components/ui/MarkdownContent'
import { LuX, LuSendHorizontal, LuRefreshCw, LuSquare } from 'react-icons/lu'
import { useSiteLogo } from '@/config/brand-assets'
import { storageKeys } from '@/lib/storage'
import { useAuthStore } from '@/store/auth'
import { useCustomerServiceStore } from '@/store/use-customer-service-store'
import { formatChartDate, formatDate, formatShortTime } from '@/lib/format-date'
import { useCsChat } from './use-cs-chat'
import type { Message, ConnectionStatus } from './use-cs-chat'

function formatCsTimestamp(timestamp: number, t: (key: string, options?: Record<string, unknown>) => string) {
  const date = new Date(timestamp)
  const now = new Date()
  const dateIso = date.toISOString()
  const isToday = formatDate(dateIso) === formatDate(now.toISOString())
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = formatDate(dateIso) === formatDate(yesterday.toISOString())
  const timeStr = formatShortTime(dateIso)
  if (isToday) return t('common.customerService.todayAt', { time: timeStr })
  if (isYesterday) return t('common.customerService.yesterdayAt', { time: timeStr })
  return `${formatChartDate(dateIso)} ${timeStr}`
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        'inline-block w-[7px] h-[7px] rounded-full mr-[5px] align-middle',
        status === 'online' ? 'bg-mg-success shadow-[0_0_6px_var(--mg-success)]' : status === 'connecting' ? 'bg-mg-warning' : 'bg-mg-danger',
      )}
    />
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const { t } = useTranslation()
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
      <div
        className={cn(
          'max-w-[80%] px-3.5 py-2.5 text-[13px] leading-relaxed break-words border',
          isUser ? 'bg-mg-fill-1 border-mg-fill-1 whitespace-pre-wrap' : 'bg-mg-fill-0 border-mg-border',
          'text-mg-text-1',
          msg.isError && 'opacity-70',
        )}
        // 气泡的不对称圆角（指向发言方的那个小角）没有对应 token 档位，留内联
        style={{ borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px' }}
      >
        {msg.content
          ? (isUser
            ? msg.content
            : <MarkdownContent>{msg.content}</MarkdownContent>
          )
          : (msg.role === 'agent' ? <span className="italic text-mg-text-3">{t('common.customerService.thinking')}</span> : '')
        }
      </div>
      <span className="mt-1 px-1 text-[10px] text-mg-text-3">
        {formatCsTimestamp(msg.timestamp, t)}
      </span>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px', marginBottom: 16 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-mg-fill-2 opacity-60"
          style={{ animation: `cs-bounce 1.2s ${i * 0.2}s ease-in-out infinite` }}
        />
      ))}
    </div>
  )
}

export function CustomerService() {
  const { t } = useTranslation()
  const isOpen = useCustomerServiceStore((s) => s.isOpen)
  const toggleOpen = useCustomerServiceStore((s) => s.toggle)
  const logoSrc = useSiteLogo()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { messages, sendMessage, stopMessage, reconnect, status, isLoading, conversationId } = useCsChat({
    source: 'console',
    tenantId: activeTenantId,
  })

  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // draggable trigger state
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKeys.csTriggerPos())
      return saved ? JSON.parse(saved) : { x: 0, y: 0 }
    } catch { return { x: 0, y: 0 } }
  })
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const isDragging = useRef(false)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  if (!activeTenantId) return null

  function handleMouseDown(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
    isDragging.current = false

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true
      const newPos = { x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy }
      setPos(newPos)
    }
    function onMouseUp() {
      try { localStorage.setItem(storageKeys.csTriggerPos(), JSON.stringify(pos)) } catch { /* ignore */ }
      dragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function handleTriggerClick() {
    if (isDragging.current) return
    toggleOpen()
  }

  function handleSend() {
    if (!inputValue.trim() || isLoading) return
    sendMessage(inputValue)
    setInputValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <style>{`
        @keyframes cs-bounce {
          0%, 80%, 100% { transform: scale(1); opacity: 0.4; }
          40% { transform: scale(1.4); opacity: 1; }
        }
      `}</style>

      {/* Floating trigger button */}
      <div
        onMouseDown={handleMouseDown}
        onClick={handleTriggerClick}
        // 浮层必须实底：--mg-bg-0 已并入玻璃（半透明），悬浮层用 --mg-bg-2（需求方#529/#559）
        className="fixed z-[1000] w-13 h-13 rounded-full bg-mg-bg-2 border border-mg-border shadow-[0_4px_20px_rgba(0,0,0,0.2)] flex items-center justify-center cursor-grab select-none transition-shadow duration-200"
        // 拖拽后的落点是运行时算出来的坐标，不是设计 token
        style={{ right: 24 - pos.x, bottom: 24 - pos.y }}
      >
        {isOpen
          ? <LuX className="text-mg-text-2" size={20} />
          : (
            <div style={{ position: 'relative' }}>
              <img src={logoSrc} alt="CS" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <span
                className={cn(
                  'absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-mg-bg-2',
                  status === 'online' ? 'bg-mg-success' : status === 'connecting' ? 'bg-mg-warning' : 'bg-mg-danger',
                )}
              />
            </div>
          )
        }
      </div>

      {/* Chat window —— 悬浮在页面内容上，玻璃 bg-0 会把下层内容透出来叠字（需求方#559），改实底 bg-2 */}
      {isOpen && (
        <div className="fixed right-6 bottom-22 w-95 h-140 z-[999] rounded-lg bg-mg-bg-2 border border-mg-border shadow-[0_20px_60px_-10px_rgba(15,23,42,0.2)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-mg-fill-0 bg-mg-bg-1 flex items-center justify-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={logoSrc} alt="Logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <div>
                <p className="m-0 text-[13px] font-bold text-mg-text-1">{t('common.customerService.assistant')}</p>
                <p className="m-0 text-[11px] text-mg-text-2">
                  <StatusDot status={status} />
                  {status === 'online' ? t('common.customerService.online') : status === 'connecting' ? t('common.customerService.connecting') : t('common.customerService.offline')}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {status === 'offline' && (
                <Button size="small"  variant="ghost" icon={<LuRefreshCw />} onClick={reconnect} />
              )}
              <span className={cn(
                'text-[10px] text-mg-text-3 px-2 py-0.5 rounded-full border',
                conversationId ? 'bg-mg-fill-0 border-mg-border' : 'bg-mg-primary-light border-mg-primary',
              )}>
                {conversationId ? 'Resumed' : 'New'}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {messages.length === 0 && (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <img src={logoSrc} alt="" style={{ width: 48, height: 48, opacity: 0.2 }} />
                <p className="text-center text-xs text-mg-text-3">
                  {t('common.customerService.empty')}
                </p>
              </div>
            )}
            {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            {isLoading && <ThinkingDots />}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-mg-fill-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-mg-fill-0 border border-mg-border">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={isLoading ? t('common.customerService.placeholderLoading') : t('common.customerService.placeholder')}
                className="flex-1 border-none outline-none bg-transparent resize-none text-[13px] leading-normal text-mg-text-1 max-h-25 overflow-y-auto font-[inherit] p-0 m-0"
              />
              <Button
                size="small"
                variant={isLoading || inputValue.trim() ? 'brand' : 'secondary'}
                onClick={isLoading ? stopMessage : handleSend}
                disabled={!isLoading && !inputValue.trim()}
                aria-label={isLoading ? t('common.customerService.stop') : t('common.customerService.send')}
                className="w-8 h-8 shrink-0 p-0"
                icon={isLoading ? <LuSquare size={13} /> : <LuSendHorizontal size={14} />}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
