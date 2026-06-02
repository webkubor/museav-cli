import { useState, useEffect, useRef, useCallback } from 'react'
import type { Requirement } from '../../../scripts/dev-requirements-plugin'
import { formatDate, formatDateTime } from '@/lib/format-date'

const API = '/dev/requirements'
const GITLAB_ISSUE_URL = 'https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues'

const PRIORITY_LABEL: Record<Requirement['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const PRIORITY_COLOR: Record<Requirement['priority'], string> = {
  high: 'var(--mg-danger)',
  medium: 'var(--mg-warning)',
  low: 'var(--mg-text-2)',
}

const GL_STATUS_COLOR: Record<string, string> = {
  '已认领': '#6366f1',
  '进行中': '#f59e0b',
  '待验证': '#3b82f6',
  '已完成': '#22c55e',
}

async function post(body: object) {
  return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

const POS_KEY = 'dev-requirements-pos'
const SIZE_KEY = 'dev-requirements-size'
const ONLY_PENDING_KEY = 'dev-requirements-only-pending'

function loadSize(): { w: number; h: number } {
  try {
    const s = localStorage.getItem(SIZE_KEY)
    if (s) return JSON.parse(s) as { w: number; h: number }
  } catch {}
  return { w: 480, h: 520 }
}

function loadPos(): { top: number; right: number } {
  try {
    const s = localStorage.getItem(POS_KEY)
    if (s) return JSON.parse(s) as { top: number; right: number }
  } catch {}
  return { top: window.innerHeight / 2, right: 0 }
}

export function DevRequirements() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Requirement[]>([])
  const [onlyPending, setOnlyPending] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONLY_PENDING_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [title, setTitle] = useState('')
  const [gitlabIid, setGitlabIid] = useState('')
  const [priority, setPriority] = useState<Requirement['priority']>('medium')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>(loadPos)
  const [syncing, setSyncing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>(loadSize)
  const [maximized, setMaximized] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelDragging = useRef(false)
  const panelDragMoved = useRef(false)
  const dragStartY = useRef(0)
  const dragStartX = useRef(0)
  const dragStartTop = useRef(0)
  const dragStartRight = useRef(0)
  const resizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartY = useRef(0)
  const resizeStartW = useRef(0)
  const resizeStartH = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    panelDragging.current = true
    panelDragMoved.current = false
    dragStartY.current = e.clientY
    dragStartX.current = e.clientX
    dragStartTop.current = pos.top
    dragStartRight.current = pos.right
    e.preventDefault()
  }, [pos.top])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panelDragging.current) return
      const dy = e.clientY - dragStartY.current
      const dx = e.clientX - dragStartX.current
      if (Math.abs(dy) > 4 || Math.abs(dx) > 4) panelDragMoved.current = true
      const newTop = Math.max(40, Math.min(window.innerHeight - 40, dragStartTop.current + dy))
      const newRight = Math.max(0, Math.min(window.innerWidth - 60, dragStartRight.current - dx))
      setPos({ top: newTop, right: newRight })
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

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizing.current = true
    resizeStartX.current = e.clientX
    resizeStartY.current = e.clientY
    resizeStartW.current = size.w
    resizeStartH.current = size.h
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return
      // panel is on the right side: drag left = grow width
      const dw = resizeStartX.current - ev.clientX
      const dh = ev.clientY - resizeStartY.current
      const newW = Math.max(320, Math.min(800, resizeStartW.current + dw))
      const newH = Math.max(260, Math.min(window.innerHeight * 0.9, resizeStartH.current + dh))
      setSize({ w: newW, h: newH })
    }
    const onUp = () => {
      if (!resizing.current) return
      resizing.current = false
      setSize((s) => {
        try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)) } catch {}
        return s
      })
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [size.w, size.h])

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
    const iid = gitlabIid.trim() ? parseInt(gitlabIid.trim(), 10) : undefined
    const optimistic: Requirement = {
      id: `pending-${Date.now()}`,
      title: trimmed,
      priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
      gitlabIid: iid && !isNaN(iid) ? iid : undefined,
    }
    setItems((prev) => [...prev, optimistic])
    setTitle('')
    setGitlabIid('')
    post({ action: 'add', title: trimmed, priority, gitlabIid: optimistic.gitlabIid }).then(load).catch(() => {})
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
    onClaim: handleClaim,
    onPush: handlePush,
    onFinish: handleFinish,
  }

  function handleExport() {
    const now = formatDateTime(new Date().toISOString())
    const fmt = (r: Requirement) => {
      const pri = PRIORITY_LABEL[r.priority]
      const date = r.createdAt ? formatDate(r.createdAt) : ''
      const note = r.note ? `\n  > ${r.note}` : ''
      const check = r.status === 'done' ? '[x]' : '[ ]'
      return `- ${check} [${pri}] ${r.title}${date ? '  ·  ' + date : ''}${note}`
    }
    const lines = [
      '# 需求看板',
      '',
      `> 导出时间：${now}`,
      '',
      `## 待处理 (${pending.length})`,
      ...(pending.length ? pending.map(fmt) : ['_暂无_']),
      '',
      `## 已完成 (${done.length})`,
      ...(done.length ? done.map(fmt) : ['_暂无_']),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `requirements-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function handleSync() {
    setSyncing(true)
    post({ action: 'sync' })
      .then((r) => r.json())
      .then((data: Requirement[]) => { if (Array.isArray(data)) setItems(data) })
      .catch(() => {})
      .finally(() => setSyncing(false))
  }

  function handleClaim(id: string) {
    post({ action: 'claim', id })
      .then(() => load())
      .catch(() => {})
  }

  function handlePush(id: string) {
    post({ action: 'push', id })
      .then(() => load())
      .catch(() => {})
  }

  function handleFinish(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'done' as const } : i)))
    post({ action: 'finish', id }).then(load).catch(() => load())
  }

    const panelW = maximized ? window.innerWidth * 0.9 : size.w
  const panelH = maximized ? window.innerHeight * 0.9 : size.h

  return (
    <div style={{
      position: 'fixed',
      right: maximized ? '5%' : pos.right,
      top: maximized ? '5%' : pos.top,
      transform: maximized ? 'none' : 'translateY(-50%)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
    }}>
      {/* 收起状态：侧边小 tab */}
      {!open && (
        <button
          onMouseDown={handleMouseDown}
          onClick={() => { if (!panelDragMoved.current) setOpen(true) }}
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            padding: '14px 8px',
            background: 'var(--mg-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'grab',
            fontSize: 15,
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
          title="点击展开 · 拖拽移动"
        >
          <span style={{
            writingMode: 'horizontal-tb',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            marginBottom: 6,
            opacity: 0.7,
          }}>
            {[0,1,2].map(i => (
              <span key={i} style={{ display: 'block', width: 14, height: 2, background: '#fff', borderRadius: 2 }} />
            ))}
          </span>
          <span>需</span>
          <span>求</span>
          {pending.length > 0 && (
            <span style={{
              writingMode: 'horizontal-tb',
              background: 'var(--mg-danger)',
              borderRadius: 10,
              minWidth: 20,
              height: 20,
              lineHeight: '20px',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 700,
              padding: '0 4px',
              marginTop: 4,
            }}>
              {pending.length}
            </span>
          )}
        </button>
      )}

      {open && (
        <div style={{
          width: panelW,
          height: panelH,
          background: 'var(--mg-bg-1)',
          border: '1px solid var(--mg-border)',
          borderRadius: maximized ? '12px' : '8px 0 0 8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* 顶栏：拖拽区 + 标题 + 操作按钮 */}
          <div
            onMouseDown={handleMouseDown}
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--mg-border)',
              display: 'flex',
              alignItems: 'center',
              cursor: 'grab',
              userSelect: 'none',
              gap: 10,
              background: 'var(--mg-bg-2)',
            }}
          >
            {/* grip */}
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, opacity: 0.45, flexShrink: 0 }}>
              {[0,1,2].map(i => (
                <span key={i} style={{ display: 'block', width: 18, height: 2, background: 'var(--mg-text-0)', borderRadius: 2 }} />
              ))}
            </span>

            {/* 标题 */}
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--mg-text-0)', flex: 1 }}>
              需求看板
            </span>
            {pending.length > 0 && (
              <span style={{
                fontSize: 13,
                color: 'var(--mg-primary)',
                background: 'var(--mg-primary-light)',
                padding: '2px 10px',
                borderRadius: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {pending.length} 待处理
              </span>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onMouseDown={e => e.stopPropagation()}>
              {/* 同步 GitLab */}
              <button
                onClick={handleSync}
                disabled={syncing}
                title="从 GitLab 同步"
                style={{
                  background: 'none', border: 'none', cursor: syncing ? 'wait' : 'pointer',
                  color: syncing ? 'var(--mg-primary)' : 'var(--mg-text-2)', fontSize: 13, lineHeight: 1,
                  padding: '4px 6px', borderRadius: 4, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 3,
                  opacity: syncing ? 0.6 : 1,
                }}
              >
                <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
                {syncing ? '同步中' : '同步'}
              </button>
              {/* 导出 */}
              <button
                onClick={handleExport}
                title="导出 Markdown"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--mg-text-2)', fontSize: 15, lineHeight: 1,
                  padding: '4px 6px', borderRadius: 4,
                  display: 'flex', alignItems: 'center',
                }}
              >
                ↓
              </button>
              {/* 放大 / 还原 */}
              <button
                onClick={() => setMaximized(v => !v)}
                title={maximized ? '还原' : '最大化'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--mg-text-2)', fontSize: 16, lineHeight: 1,
                  padding: '4px 6px', borderRadius: 4,
                  display: 'flex', alignItems: 'center',
                }}
              >
                {maximized ? '⊡' : '⊞'}
              </button>
              {/* 收起 */}
              <button
                onClick={() => { setOpen(false); setMaximized(false) }}
                title="收起"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--mg-text-2)', fontSize: 20, lineHeight: 1,
                  padding: '2px 4px', borderRadius: 4,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* 录入区 */}
          <div style={{ padding: '14px 14px', borderBottom: '1px solid var(--mg-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="+ 快速记录需求..."
              style={{
                flex: 1,
                padding: '10px 14px',
                fontSize: 16,
                background: 'var(--mg-bg-2)',
                border: '1px solid var(--mg-border)',
                borderRadius: 6,
                color: 'var(--mg-text-0)',
                outline: 'none',
              }}
            />
            <input
              value={gitlabIid}
              onChange={(e) => setGitlabIid(e.target.value.replace(/\D/g, ''))}
              placeholder="#"
              title="GitLab Issue ID（选填）"
              style={{
                width: 60,
                padding: '10px 6px',
                fontSize: 15,
                fontFamily: 'monospace',
                fontWeight: 600,
                background: 'var(--mg-bg-2)',
                border: '1px solid var(--mg-border)',
                borderRadius: 6,
                color: gitlabIid ? 'var(--mg-primary)' : 'var(--mg-text-2)',
                outline: 'none',
                textAlign: 'center',
                flexShrink: 0,
              }}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Requirement['priority'])}
              style={{
                padding: '10px 6px',
                fontSize: 16,
                background: 'var(--mg-bg-2)',
                border: '1px solid var(--mg-border)',
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
                padding: '10px 20px',
                fontSize: 16,
                fontWeight: 600,
                background: title.trim() ? 'var(--mg-primary)' : 'var(--mg-disabled-border)',
                color: title.trim() ? '#fff' : 'var(--mg-disabled-text)',
                border: 'none',
                borderRadius: 6,
                cursor: title.trim() ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
              }}
            >
              添加
            </button>
          </div>

          {/* 状态分类过滤条 */}
          <div style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--mg-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--mg-bg-2)',
          }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setOnlyPending(false)
                  try { localStorage.setItem(ONLY_PENDING_KEY, 'false') } catch {}
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: !onlyPending ? 'var(--mg-primary)' : 'var(--mg-text-2)',
                  fontWeight: !onlyPending ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 4,
                  backgroundColor: !onlyPending ? 'var(--mg-primary-light)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                全部 ({items.length})
              </button>
              <button
                onClick={() => {
                  setOnlyPending(true)
                  try { localStorage.setItem(ONLY_PENDING_KEY, 'true') } catch {}
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: onlyPending ? 'var(--mg-primary)' : 'var(--mg-text-2)',
                  fontWeight: onlyPending ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 4,
                  backgroundColor: onlyPending ? 'var(--mg-primary-light)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                未完成 ({pending.length})
              </button>
            </div>
            
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              fontSize: 14,
              color: 'var(--mg-text-2)',
              userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => {
                  const next = e.target.checked
                  setOnlyPending(next)
                  try { localStorage.setItem(ONLY_PENDING_KEY, String(next)) } catch {}
                }}
                style={{ cursor: 'pointer', accentColor: 'var(--mg-primary)', width: 15, height: 15 }}
              />
              <span>只看未完成</span>
            </label>
          </div>

          {/* 列表 */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {items.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--mg-text-2)', fontSize: 15 }}>
                暂无需求条目
              </div>
            )}

            {pending.length > 0 && (
              <div>
                <div style={{ padding: '8px 14px 4px', fontSize: 13, color: 'var(--mg-text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  待处理 · {pending.length}
                </div>
                {pending.map((item) => (
                  <ReqItem key={item.id} item={item} {...itemProps} />
                ))}
              </div>
            )}

            {done.length > 0 && !onlyPending && (
              <div style={{ marginTop: pending.length > 0 ? 6 : 0 }}>
                <div style={{ padding: '8px 14px 4px', fontSize: 13, color: 'var(--mg-text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  已完成 · {done.length}
                </div>
                {done.map((item) => (
                  <ReqItem key={item.id} item={item} {...itemProps} />
                ))}
              </div>
            )}
          </div>

          {/* 缩放把手：左下角 */}
          <div
            onMouseDown={handleResizeMouseDown}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 20,
              height: 20,
              cursor: 'sw-resize',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-start',
              padding: '3px',
              userSelect: 'none',
            }}
            title="拖拽缩放"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 9L9 1M5 9L9 5M1 5L5 1" stroke="var(--mg-text-3)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
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
  onClaim: (id: string) => void
  onPush: (id: string) => void
  onFinish: (id: string) => void
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
  onClaim, onPush, onFinish,
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
      onDragOver={(e) => onDragOver(e, item.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, item.id)}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: isDragOver
          ? 'var(--mg-primary-light)'
          : hovered
          ? 'var(--mg-bg-2)'
          : 'transparent',
        opacity: isDragging ? 0.35 : 1,
        borderTop: isDragOver ? '2px solid var(--mg-primary)' : '2px solid transparent',
        transition: 'background 0.1s, opacity 0.15s',
      }}
    >
      {/* 拖拽把手 */}
      <span
        draggable={!isEditing}
        onDragStart={(e) => { e.stopPropagation(); onDragStart(e, item.id) }}
        onDragEnd={(e) => { e.stopPropagation(); onDragEnd() }}
        style={{
          flexShrink: 0,
          fontSize: 18,
          color: hovered ? 'var(--mg-text-1)' : 'var(--mg-text-3)',
          cursor: 'grab',
          lineHeight: '22px',
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
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: `2px solid ${item.status === 'done' ? 'var(--mg-success)' : 'var(--mg-border)'}`,
          background: item.status === 'done' ? 'var(--mg-success)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
          padding: 0,
        }}
      >
        {item.status === 'done' && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
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
              fontSize: 16,
              padding: '4px 8px',
              border: '1px solid var(--mg-primary)',
              borderRadius: 4,
              background: 'var(--mg-bg-0)',
              color: 'var(--mg-text-0)',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => onEditStart(item.id, item.title)}
            title="双击编辑"
            style={{
              fontSize: 16,
              color: item.status === 'done' ? 'var(--mg-text-2)' : 'var(--mg-text-0)',
              textDecoration: item.status === 'done' ? 'line-through' : 'none',
              wordBreak: 'break-all',
              display: 'block',
              lineHeight: 1.6,
            }}
          >
            {item.title}
          </span>
        )}
      </div>

      {/* GitLab + 状态 + 负责人 + 认领 + 优先级 + 删除 */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {/* GitLab issue link */}
        {item.gitlabIid && (
          <a
            href={`${GITLAB_ISSUE_URL}/${item.gitlabIid}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`GitLab #${item.gitlabIid}`}
            style={{
              fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
              color: 'var(--mg-primary)', background: 'var(--mg-primary-light)',
              padding: '2px 8px', borderRadius: 4, textDecoration: 'none', lineHeight: '18px',
            }}
          >
            #{item.gitlabIid}
          </a>
        )}
        {/* GitLab 状态标签 */}
        {item.gitlabLabels?.filter((l) => GL_STATUS_COLOR[l]).map((label) => (
          <span key={label} style={{
            fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 3, lineHeight: '16px',
            color: GL_STATUS_COLOR[label], background: `${GL_STATUS_COLOR[label]}18`,
            border: `1px solid ${GL_STATUS_COLOR[label]}30`,
          }}>
            {label}
          </span>
        ))}
        {/* 负责人 */}
        {item.assignee && (
          <span style={{ fontSize: 12, color: 'var(--mg-text-2)', fontWeight: 600 }}>
            @{item.assignee}
          </span>
        )}
        {/* 认领 / 推送 / 完成 */}
        {hovered && !isEditing && item.status !== 'done' && (
          <>
            {item.gitlabIid ? (
              !item.assignee || item.assignee !== 'webkubor' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onClaim(item.id) }}
                  title="认领此任务（分配给我 + 标记已认领）"
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
                    color: '#fff', background: 'var(--mg-primary)', border: 'none',
                    cursor: 'pointer', lineHeight: '18px',
                  }}
                >
                  认领
                </button>
              ) : null
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onPush(item.id) }}
                title="推送到 GitLab 并认领"
                style={{
                  fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
                  color: 'var(--mg-primary)', background: 'var(--mg-primary-light)',
                  border: `1px solid var(--mg-primary)`, cursor: 'pointer', lineHeight: '16px',
                }}
              >
                推送
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onFinish(item.id) }}
              title="标记完成（同步关闭 GitLab Issue）"
              style={{
                fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
                color: '#fff', background: '#22c55e', border: 'none',
                cursor: 'pointer', lineHeight: '18px',
              }}
            >
              完成
            </button>
          </>
        )}
        <span style={{ fontSize: 13, color: PRIORITY_COLOR[item.priority], fontWeight: 700 }}>
          {PRIORITY_LABEL[item.priority]}
        </span>
        {hovered && !isEditing && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
            title="删除"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mg-text-2)', fontSize: 18, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
