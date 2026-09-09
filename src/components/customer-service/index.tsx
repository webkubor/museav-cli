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
      <div style={{
        maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser ? 'var(--mg-fill-1)' : 'var(--mg-fill-0)',
        color: 'var(--mg-text-1)',
        fontSize: 13,
        lineHeight: '1.6',
        wordBreak: 'break-word',
        whiteSpace: isUser ? 'pre-wrap' : undefined,
        border: isUser ? '1px solid var(--mg-fill-1)' : '1px solid var(--mg-border)',
        opacity: msg.isError ? 0.7 : 1,
      }}>
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
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: 'var(--mg-fill-2)',
          opacity: 0.6,
          animation: `cs-bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
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
        style={{
          position: 'fixed',
          right: 24 - pos.x,
          bottom: 24 - pos.y,
          zIndex: 1000,
          width: 52,
          height: 52,
          borderRadius: '50%',
          // 浮层必须实底：--mg-bg-0 已并入玻璃（半透明），悬浮层用 --mg-bg-2（需求方#529/#559）
          background: 'var(--mg-bg-2)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          userSelect: 'none',
          transition: 'box-shadow 0.2s',
          border: '1px solid var(--mg-border)',
        }}
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

      {/* Chat window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 88,
          width: 380,
          height: 560,
          zIndex: 999,
          borderRadius: 20,
          // 聊天窗悬浮在页面内容上，玻璃 bg-0 会把下层内容透出来叠字（需求方#559），改实底 bg-2
          background: 'var(--mg-bg-2)',
          border: '1px solid var(--mg-border)',
          boxShadow: '0 20px 60px -10px rgba(15,23,42,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--mg-fill-0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--mg-bg-1)',
          }}>
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
              <span style={{
                fontSize: 10, color: 'var(--mg-text-3)',
                padding: '2px 8px', borderRadius: 100,
                background: conversationId ? 'var(--mg-fill-0)' : 'var(--mg-primary-light)',
                border: `1px solid ${conversationId ? 'var(--mg-border)' : 'var(--mg-primary)'}`,
              }}>
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
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--mg-fill-0)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--mg-fill-0)',
              border: '1px solid var(--mg-border)',
              borderRadius: 12,
              padding: '8px 12px',
            }}>
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={isLoading ? t('common.customerService.placeholderLoading') : t('common.customerService.placeholder')}
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  resize: 'none', fontSize: 13, lineHeight: '1.5', color: 'var(--mg-text-1)',
                  maxHeight: 100, overflowY: 'auto', fontFamily: 'inherit',
                  padding: 0, margin: 0,
                }}
              />
              <button
                onClick={isLoading ? stopMessage : handleSend}
                disabled={!isLoading && !inputValue.trim()}
                aria-label={isLoading ? t('common.customerService.stop') : t('common.customerService.send')}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: isLoading || inputValue.trim() ? 'var(--brand-base)' : 'var(--mg-fill-1)',
                  color: isLoading || inputValue.trim() ? '#ffffff' : 'var(--mg-text-3)',
                  cursor: isLoading || inputValue.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.2s',
                }}
              >
                {isLoading ? <LuSquare size={13} /> : <LuSendHorizontal size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
