import { useState, useEffect, useRef } from 'react'
import { Button } from '@douyinfe/semi-ui'
import { LuX, LuSendHorizontal, LuRefreshCw } from 'react-icons/lu'
import { modelGoLogos } from '@/config/brand-assets'
import { getMarket } from '@/lib/market'
import { storageKeys } from '@/lib/storage'
import { useAuthStore } from '@/store/auth'
import { useCsChat } from './use-cs-chat'
import type { Message, ConnectionStatus } from './use-cs-chat'

const market = getMarket()
const logoSrc = modelGoLogos[market]

function formatCsTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  if (isToday) return `今天 ${timeStr}`
  if (isYesterday) return `昨天 ${timeStr}`
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${m}-${d} ${timeStr}`
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  const color = status === 'online' ? '#10b981' : status === 'connecting' ? '#f59e0b' : '#ef4444'
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      backgroundColor: color, marginRight: 5, verticalAlign: 'middle',
      boxShadow: status === 'online' ? '0 0 6px #10b981' : 'none',
    }} />
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
      <div style={{
        maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser ? 'var(--semi-color-fill-1)' : 'var(--semi-color-fill-0)',
        color: 'var(--semi-color-text-0)',
        fontSize: 13,
        lineHeight: '1.6',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        border: isUser ? '1px solid var(--semi-color-fill-1)' : '1px solid var(--semi-color-border)',
        opacity: msg.isError ? 0.7 : 1,
      }}>
        {msg.content || (msg.role === 'agent' ? <span style={{ color: 'var(--semi-color-text-2)', fontStyle: 'italic' }}>思考中…</span> : '')}
      </div>
      <span style={{ fontSize: 10, color: 'var(--semi-color-text-2)', marginTop: 4, padding: '0 4px' }}>
        {formatCsTimestamp(msg.timestamp)}
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
          backgroundColor: 'var(--semi-color-text-2)',
          opacity: 0.6,
          animation: `cs-bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

export function CustomerService() {
  const [isOpen, setIsOpen] = useState(false)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { messages, sendMessage, reconnect, status, isLoading, conversationId } = useCsChat({
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
    setIsOpen((v) => !v)
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
          background: 'var(--semi-color-bg-0)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          userSelect: 'none',
          transition: 'box-shadow 0.2s',
          border: '1px solid var(--semi-color-border)',
        }}
      >
        {isOpen
          ? <LuX style={{ color: 'var(--semi-color-text-1)', fontSize: 20 }} />
          : (
            <div style={{ position: 'relative' }}>
              <img src={logoSrc} alt="CS" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <span style={{
                position: 'absolute', right: -2, bottom: -2,
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: status === 'online' ? '#10b981' : status === 'connecting' ? '#f59e0b' : '#ef4444',
                border: '2px solid var(--semi-color-bg-0)',
              }} />
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
          background: 'var(--semi-color-bg-0)',
          border: '1px solid var(--semi-color-border)',
          boxShadow: '0 20px 60px -10px rgba(15,23,42,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--semi-color-fill-0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--semi-color-bg-1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={logoSrc} alt="Logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>智能客服</p>
                <p style={{ fontSize: 11, color: 'var(--semi-color-text-1)', margin: 0 }}>
                  <StatusDot status={status} />
                  {status === 'online' ? '在线' : status === 'connecting' ? '连接中' : '离线'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {status === 'offline' && (
                <Button size="small" theme="borderless" icon={<LuRefreshCw />} onClick={reconnect} />
              )}
              <span style={{
                fontSize: 10, color: 'var(--semi-color-text-2)',
                padding: '2px 8px', borderRadius: 100,
                background: conversationId ? 'var(--semi-color-fill-0)' : '#eff6ff',
                border: `1px solid ${conversationId ? 'var(--semi-color-border)' : '#bfdbfe'}`,
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
                <p style={{ fontSize: 12, color: 'var(--semi-color-text-2)', textAlign: 'center' }}>
                  有什么我可以帮助你的？
                </p>
              </div>
            )}
            {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            {isLoading && <ThinkingDots />}
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--semi-color-fill-0)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              background: 'var(--semi-color-fill-0)',
              border: '1px solid var(--semi-color-border)',
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
                placeholder={isLoading ? '正在思考中…' : '输入消息，Enter 发送'}
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  resize: 'none', fontSize: 13, lineHeight: '1.5', color: 'var(--semi-color-text-0)',
                  maxHeight: 100, overflowY: 'auto', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: inputValue.trim() && !isLoading ? 'var(--semi-color-text-1)' : 'var(--semi-color-border)',
                  color: inputValue.trim() && !isLoading ? 'var(--semi-color-bg-0)' : 'var(--semi-color-text-2)',
                  cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.2s',
                }}
              >
                <LuSendHorizontal size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
