import { useState, useEffect, useRef, useCallback } from 'react'
import type { Requirement } from '../../../scripts/dev-requirements-plugin'

const API = '/dev/requirements'

const PRIORITY_LABEL: Record<Requirement['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const PRIORITY_COLOR: Record<Requirement['priority'], string> = {
  high: 'var(--semi-color-danger)',
  medium: 'var(--semi-color-warning)',
  low: 'var(--semi-color-text-2)',
}

async function post(body: object) {
  return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

const POS_KEY = 'dev-requirements-pos'

function loadPos(): { top: number } {
  try {
    const s = localStorage.getItem(POS_KEY)
    if (s) return JSON.parse(s) as { top: number }
  } catch {}
  return { top: window.innerHeight / 2 }
}

export function DevRequirements() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Requirement[]>([])
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Requirement['priority']>('medium')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number }>(loadPos)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartTop = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStartY.current = e.clientY
    dragStartTop.current = pos.top
    e.preventDefault()
  }, [pos.top])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dy = e.clientY - dragStartY.current
      const newTop = Math.max(40, Math.min(window.innerHeight - 40, dragStartTop.current + dy))
      setPos({ top: newTop })
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      setPos((p) => {
        try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch {}
        return p
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const load = useCallback(() => {
    fetch(API)
      .then((r) => r.json())
      .then((data: Requirement[]) => setItems(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (open) {
      load()
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, load])

  const handleAdd = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    const optimistic: Requirement = {
      id: `pending-${Date.now()}`,
      title: trimmed,
      priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    setItems((prev) => [...prev, optimistic])
    setTitle('')
    post({ action: 'add', title: trimmed, priority }).then(load).catch(() => {})
  }

  const handleToggle = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: item.status === 'done' ? 'pending' : 'done' } : item
      )
    )
    post({ action: 'toggle', id }).catch(() => load())
  }

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
    post({ action: 'delete', id }).catch(() => load())
  }

  const pending = items.filter((i) => i.status === 'pending')
  const done = items.filter((i) => i.status === 'done')

  return (
    <div style={{ position: 'fixed', right: 0, top: pos.top, transform: 'translateY(-50%)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 0 }}>
      {/* 侧边 tab */}
      <button
        onMouseDown={handleMouseDown}
        onClick={() => setOpen((v) => !v)}
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          padding: '10px 6px',
          background: 'var(--semi-color-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: open ? '6px 0 0 6px' : '6px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 1,
          opacity: 0.92,
          lineHeight: 1.4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          userSelect: 'none',
        }}
        title="需求变更面板（拖拽调整位置）"
      >
        <span>需</span>
        <span>求</span>
        {pending.length > 0 && (
          <span style={{
            writingMode: 'horizontal-tb',
            background: 'var(--semi-color-danger)',
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            lineHeight: '16px',
            textAlign: 'center',
            fontSize: 10,
            fontWeight: 700,
            padding: '0 2px',
          }}>
            {pending.length}
          </span>
        )}
      </button>

      {/* 面板主体 */}
      {open && (
        <div style={{
          width: 320,
          maxHeight: '70vh',
          background: 'var(--semi-color-bg-1)',
          border: '1px solid var(--semi-color-border)',
          borderRadius: '6px 0 0 6px',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 头部 */}
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: '1px solid var(--semi-color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--semi-color-text-0)' }}>
              需求变更 ({items.length})
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--semi-color-text-2)', fontSize: 16, lineHeight: 1, padding: 2 }}
            >
              ×
            </button>
          </div>

          {/* 录入区 */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--semi-color-border)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="记录需求变更..."
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: 12,
                background: 'var(--semi-color-bg-2)',
                border: '1px solid var(--semi-color-border)',
                borderRadius: 4,
                color: 'var(--semi-color-text-0)',
                outline: 'none',
              }}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Requirement['priority'])}
              style={{
                padding: '5px 4px',
                fontSize: 12,
                background: 'var(--semi-color-bg-2)',
                border: '1px solid var(--semi-color-border)',
                borderRadius: 4,
                color: PRIORITY_COLOR[priority],
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={!title.trim()}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 600,
                background: title.trim() ? 'var(--semi-color-primary)' : 'var(--semi-color-disabled-border)',
                color: title.trim() ? '#fff' : 'var(--semi-color-disabled-text)',
                border: 'none',
                borderRadius: 4,
                cursor: title.trim() ? 'pointer' : 'default',
              }}
            >
              +
            </button>
          </div>

          {/* 列表 */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: 12 }}>
                暂无需求，记录第一条吧
              </div>
            )}

            {pending.length > 0 && (
              <div>
                <div style={{ padding: '6px 12px 2px', fontSize: 11, color: 'var(--semi-color-text-2)', fontWeight: 600, letterSpacing: 0.5 }}>
                  待处理 ({pending.length})
                </div>
                {pending.map((item) => (
                  <ReqItem
                    key={item.id}
                    item={item}
                    hovered={hoverId === item.id}
                    onHover={setHoverId}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {done.length > 0 && (
              <div>
                <div style={{ padding: '6px 12px 2px', fontSize: 11, color: 'var(--semi-color-text-2)', fontWeight: 600, letterSpacing: 0.5, marginTop: pending.length > 0 ? 4 : 0 }}>
                  已完成 ({done.length})
                </div>
                {done.map((item) => (
                  <ReqItem
                    key={item.id}
                    item={item}
                    hovered={hoverId === item.id}
                    onHover={setHoverId}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface ReqItemProps {
  item: Requirement
  hovered: boolean
  onHover: (id: string | null) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

function ReqItem({ item, hovered, onHover, onToggle, onDelete }: ReqItemProps) {
  return (
    <div
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: '7px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        background: hovered ? 'var(--semi-color-bg-2)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* 勾选圆圈 */}
      <button
        onClick={() => onToggle(item.id)}
        title={item.status === 'done' ? '标记为待处理' : '标记为已完成'}
        style={{
          flexShrink: 0,
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `2px solid ${item.status === 'done' ? 'var(--semi-color-success)' : 'var(--semi-color-border)'}`,
          background: item.status === 'done' ? 'var(--semi-color-success)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
          padding: 0,
        }}
      >
        {item.status === 'done' && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
      </button>

      {/* 文字区 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 12,
          color: item.status === 'done' ? 'var(--semi-color-text-2)' : 'var(--semi-color-text-0)',
          textDecoration: item.status === 'done' ? 'line-through' : 'none',
          wordBreak: 'break-all',
          display: 'block',
          lineHeight: 1.5,
        }}>
          {item.title}
        </span>
      </div>

      {/* 优先级 + 删除 */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: PRIORITY_COLOR[item.priority], fontWeight: 600 }}>
          {PRIORITY_LABEL[item.priority]}
        </span>
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
            title="删除"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--semi-color-text-2)',
              fontSize: 13,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
