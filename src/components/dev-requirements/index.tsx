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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartTop = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    panelDragging.current = true
    dragStartY.current = e.clientY
    dragStartTop.current = pos.top
    e.preventDefault()
  }, [pos.top])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panelDragging.current) return
      const dy = e.clientY - dragStartY.current
      const newTop = Math.max(40, Math.min(window.innerHeight - 40, dragStartTop.current + dy))
      setPos({ top: newTop })
    }
    const onUp = () => {
      if (!panelDragging.current) return
      panelDragging.current = false
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

  // ── Inline edit ──────────────────────────────────────────────────────────────
  const handleEditStart = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditingTitle(currentTitle)
  }

  const handleEditSave = (id: string) => {
    const trimmed = editingTitle.trim()
    if (trimmed) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title: trimmed } : i)))
      post({ action: 'update', id, title: trimmed }).catch(() => load())
    }
    setEditingId(null)
  }

  const handleEditCancel = () => setEditingId(null)

  // ── Drag-to-reorder ──────────────────────────────────────────────────────────
  const handleItemDragStart = (id: string) => setDraggingId(id)
  const handleItemDragEnd = () => { setDraggingId(null); setDragOverId(null) }

  const handleItemDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (id !== draggingId) setDragOverId(id)
  }, [draggingId])

  const handleItemDrop = useCallback((targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null)
      setDragOverId(null)
      return
    }
    setItems((prev) => {
      const fromIdx = prev.findIndex((i) => i.id === draggingId)
      const toIdx = prev.findIndex((i) => i.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      post({ action: 'reorder', ids: next.map((i) => i.id) }).catch(() => load())
      return next
    })
    setDraggingId(null)
    setDragOverId(null)
  }, [draggingId, load])

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
          cursor: 'grab',
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
        title="需求看板（拖拽调整上下位置）"
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
              需求看板
              {pending.length > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--semi-color-text-2)', fontWeight: 400 }}>
                  {pending.length} 待处理
                </span>
              )}
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
              placeholder="+ 快速记录需求..."
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
              添加
            </button>
          </div>

          {/* 列表 */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: 12 }}>
                暂无需求条目，快速记录第一条吧
              </div>
            )}

            {pending.length > 0 && (
              <div>
                <div style={{ padding: '6px 12px 2px', fontSize: 11, color: 'var(--semi-color-text-2)', fontWeight: 600, letterSpacing: 0.5 }}>
                  待处理 · {pending.length}
                </div>
                {pending.map((item) => (
                  <ReqItem
                    key={item.id}
                    item={item}
                    hovered={hoverId === item.id}
                    isEditing={editingId === item.id}
                    editingTitle={editingTitle}
                    isDraggingOver={dragOverId === item.id}
                    isDragging={draggingId === item.id}
                    onHover={setHoverId}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEditStart={handleEditStart}
                    onEditChange={setEditingTitle}
                    onEditSave={handleEditSave}
                    onEditCancel={handleEditCancel}
                    onDragStart={handleItemDragStart}
                    onDragEnd={handleItemDragEnd}
                    onDragOver={handleItemDragOver}
                    onDrop={handleItemDrop}
                  />
                ))}
              </div>
            )}

            {done.length > 0 && (
              <div>
                <div style={{ padding: '6px 12px 2px', fontSize: 11, color: 'var(--semi-color-text-2)', fontWeight: 600, letterSpacing: 0.5, marginTop: pending.length > 0 ? 4 : 0 }}>
                  已完成 · {done.length}
                </div>
                {done.map((item) => (
                  <ReqItem
                    key={item.id}
                    item={item}
                    hovered={hoverId === item.id}
                    isEditing={editingId === item.id}
                    editingTitle={editingTitle}
                    isDraggingOver={dragOverId === item.id}
                    isDragging={draggingId === item.id}
                    onHover={setHoverId}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEditStart={handleEditStart}
                    onEditChange={setEditingTitle}
                    onEditSave={handleEditSave}
                    onEditCancel={handleEditCancel}
                    onDragStart={handleItemDragStart}
                    onDragEnd={handleItemDragEnd}
                    onDragOver={handleItemDragOver}
                    onDrop={handleItemDrop}
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
  isEditing: boolean
  editingTitle: string
  isDraggingOver: boolean
  isDragging: boolean
  onHover: (id: string | null) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEditStart: (id: string, title: string) => void
  onEditChange: (title: string) => void
  onEditSave: (id: string) => void
  onEditCancel: () => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDrop: (id: string) => void
}

function ReqItem({
  item, hovered, isEditing, editingTitle, isDraggingOver, isDragging,
  onHover, onToggle, onDelete, onEditStart, onEditChange, onEditSave, onEditCancel,
  onDragStart, onDragEnd, onDragOver, onDrop,
}: ReqItemProps) {
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) setTimeout(() => editRef.current?.focus(), 10)
  }, [isEditing])

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(item.id) }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, item.id)}
      onDrop={(e) => { e.preventDefault(); onDrop(item.id) }}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: '7px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        background: isDraggingOver
          ? 'var(--semi-color-primary-light-default)'
          : hovered
          ? 'var(--semi-color-bg-2)'
          : 'transparent',
        opacity: isDragging ? 0.4 : 1,
        borderTop: isDraggingOver ? '2px solid var(--semi-color-primary)' : '2px solid transparent',
        transition: 'opacity 0.15s, background 0.1s',
      }}
    >
      {/* 拖拽把手 */}
      <span
        style={{
          flexShrink: 0,
          fontSize: 13,
          color: hovered ? 'var(--semi-color-text-3)' : 'transparent',
          cursor: 'grab',
          lineHeight: '16px',
          marginTop: 1,
          userSelect: 'none',
          transition: 'color 0.15s',
        }}
        title="拖拽排序"
      >
        ⠿
      </span>

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
        {isEditing ? (
          <input
            ref={editRef}
            value={editingTitle}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={() => onEditSave(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditSave(item.id)
              if (e.key === 'Escape') onEditCancel()
            }}
            style={{
              width: '100%',
              fontSize: 12,
              padding: '1px 4px',
              border: '1px solid var(--semi-color-primary)',
              borderRadius: 3,
              background: 'var(--semi-color-bg-0)',
              color: 'var(--semi-color-text-0)',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => onEditStart(item.id, item.title)}
            title="双击编辑"
            style={{
              fontSize: 12,
              color: item.status === 'done' ? 'var(--semi-color-text-2)' : 'var(--semi-color-text-0)',
              textDecoration: item.status === 'done' ? 'line-through' : 'none',
              wordBreak: 'break-all',
              display: 'block',
              lineHeight: 1.5,
              cursor: 'text',
            }}
          >
            {item.title}
          </span>
        )}
      </div>

      {/* 优先级 + 删除 */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: PRIORITY_COLOR[item.priority], fontWeight: 600 }}>
          {PRIORITY_LABEL[item.priority]}
        </span>
        {hovered && !isEditing && (
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
