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

  const handleItemDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDraggingId(id)
  }, [])

  const handleItemDragEnd = useCallback(() => {
    setDraggingId(null)
    setDragOverId(null)
  }, [])

  const handleItemDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }, [])

  const handleItemDragLeave = useCallback(() => {
    setDragOverId(null)
  }, [])

  const handleItemDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const fromId = e.dataTransfer.getData('text/plain')
    if (!fromId || fromId === targetId) {
      setDraggingId(null)
      setDragOverId(null)
      return
    }
    setItems((prev) => {
      const fromIdx = prev.findIndex((i) => i.id === fromId)
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
  }, [load])

  const pending = items.filter((i) => i.status === 'pending')
  const done = items.filter((i) => i.status === 'done')

  const itemProps = {
    hoverId,
    editingId,
    editingTitle,
    draggingId,
    dragOverId,
    onHover: setHoverId,
    onToggle: handleToggle,
    onDelete: handleDelete,
    onEditStart: handleEditStart,
    onEditChange: setEditingTitle,
    onEditSave: handleEditSave,
    onEditCancel: handleEditCancel,
    onDragStart: handleItemDragStart,
    onDragEnd: handleItemDragEnd,
    onDragOver: handleItemDragOver,
    onDragLeave: handleItemDragLeave,
    onDrop: handleItemDrop,
  }

  return (
    <div style={{ position: 'fixed', right: 0, top: pos.top, transform: 'translateY(-50%)', zIndex: 9999, display: 'flex', alignItems: 'center' }}>
      {/* 侧边 tab */}
      <button
        onMouseDown={handleMouseDown}
        onClick={() => setOpen((v) => !v)}
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          padding: '12px 7px',
          background: 'var(--semi-color-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: open ? '8px 0 0 8px' : '8px',
          cursor: 'grab',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1.5,
          opacity: 0.93,
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
            borderRadius: 10,
            minWidth: 18,
            height: 18,
            lineHeight: '18px',
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 700,
            padding: '0 3px',
          }}>
            {pending.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          width: 400,
          maxHeight: '75vh',
          background: 'var(--semi-color-bg-1)',
          border: '1px solid var(--semi-color-border)',
          borderRadius: '8px 0 0 8px',
          boxShadow: '-6px 0 24px rgba(0,0,0,0.14)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 头部 */}
          <div style={{
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--semi-color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--semi-color-text-0)' }}>需求看板</span>
              {pending.length > 0 && (
                <span style={{
                  fontSize: 11,
                  color: 'var(--semi-color-primary)',
                  background: 'var(--semi-color-primary-light-default)',
                  padding: '1px 8px',
                  borderRadius: 10,
                  fontWeight: 600,
                }}>
                  {pending.length} 待处理
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--semi-color-text-2)', fontSize: 18, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
            >
              ×
            </button>
          </div>

          {/* 录入区 */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--semi-color-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="+ 快速记录需求..."
              style={{
                flex: 1,
                padding: '7px 10px',
                fontSize: 13,
                background: 'var(--semi-color-bg-2)',
                border: '1px solid var(--semi-color-border)',
                borderRadius: 6,
                color: 'var(--semi-color-text-0)',
                outline: 'none',
              }}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Requirement['priority'])}
              style={{
                padding: '7px 6px',
                fontSize: 13,
                background: 'var(--semi-color-bg-2)',
                border: '1px solid var(--semi-color-border)',
                borderRadius: 6,
                color: PRIORITY_COLOR[priority],
                fontWeight: 600,
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
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                background: title.trim() ? 'var(--semi-color-primary)' : 'var(--semi-color-disabled-border)',
                color: title.trim() ? '#fff' : 'var(--semi-color-disabled-text)',
                border: 'none',
                borderRadius: 6,
                cursor: title.trim() ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
              }}
            >
              添加
            </button>
          </div>

          {/* 列表 */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {items.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: 13 }}>
                暂无需求条目
              </div>
            )}

            {pending.length > 0 && (
              <div>
                <div style={{ padding: '8px 14px 4px', fontSize: 11, color: 'var(--semi-color-text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  待处理 · {pending.length}
                </div>
                {pending.map((item) => (
                  <ReqItem key={item.id} item={item} {...itemProps} />
                ))}
              </div>
            )}

            {done.length > 0 && (
              <div style={{ marginTop: pending.length > 0 ? 6 : 0 }}>
                <div style={{ padding: '8px 14px 4px', fontSize: 11, color: 'var(--semi-color-text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  已完成 · {done.length}
                </div>
                {done.map((item) => (
                  <ReqItem key={item.id} item={item} {...itemProps} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface SharedItemProps {
  hoverId: string | null
  editingId: string | null
  editingTitle: string
  draggingId: string | null
  dragOverId: string | null
  onHover: (id: string | null) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEditStart: (id: string, title: string) => void
  onEditChange: (title: string) => void
  onEditSave: (id: string) => void
  onEditCancel: () => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, id: string) => void
}

interface ReqItemProps extends SharedItemProps {
  item: Requirement
}

function ReqItem({
  item,
  hoverId, editingId, editingTitle, draggingId, dragOverId,
  onHover, onToggle, onDelete,
  onEditStart, onEditChange, onEditSave, onEditCancel,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}: ReqItemProps) {
  const editRef = useRef<HTMLInputElement>(null)
  const hovered = hoverId === item.id
  const isEditing = editingId === item.id
  const isDragging = draggingId === item.id
  const isDragOver = dragOverId === item.id

  useEffect(() => {
    if (isEditing) setTimeout(() => editRef.current?.focus(), 10)
  }, [isEditing])

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, item.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, item.id)}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: '9px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: isDragOver
          ? 'var(--semi-color-primary-light-default)'
          : hovered
          ? 'var(--semi-color-bg-2)'
          : 'transparent',
        opacity: isDragging ? 0.35 : 1,
        borderTop: isDragOver ? '2px solid var(--semi-color-primary)' : '2px solid transparent',
        transition: 'background 0.1s, opacity 0.15s',
      }}
    >
      {/* 拖拽把手 */}
      <span
        style={{
          flexShrink: 0,
          fontSize: 15,
          color: hovered ? 'var(--semi-color-text-2)' : 'transparent',
          cursor: 'grab',
          lineHeight: '20px',
          marginTop: 0,
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
          width: 18,
          height: 18,
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
        {item.status === 'done' && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
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
              fontSize: 13,
              padding: '2px 6px',
              border: '1px solid var(--semi-color-primary)',
              borderRadius: 4,
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
              fontSize: 13,
              color: item.status === 'done' ? 'var(--semi-color-text-2)' : 'var(--semi-color-text-0)',
              textDecoration: item.status === 'done' ? 'line-through' : 'none',
              wordBreak: 'break-all',
              display: 'block',
              lineHeight: 1.55,
            }}
          >
            {item.title}
          </span>
        )}
      </div>

      {/* 优先级 + 删除 */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
        <span style={{ fontSize: 11, color: PRIORITY_COLOR[item.priority], fontWeight: 700 }}>
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
              fontSize: 15,
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
