import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { LuX, LuChevronDown } from 'react-icons/lu'

/** 选项型用法：tag 的真实值是稳定 id，界面展示 label。避免按 name 反查导致重名时绑错对象。 */
export interface TagOption {
  value: string
  label: string
  /** 不可再被选入（仍保留在列表里以便已选项能解析出 label），如已停用的 Key */
  disabled?: boolean
}

interface TagInputProps {
  /** 受控值：选项模式下为各 option.value（id），自由文本/字符串建议模式下即原始字符串 */
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  hint?: string
  /** 字符串建议模式：候选即最终值（如模型名） */
  suggestions?: string[]
  /** 选项模式：value 为 id、label 为展示名。传了它就按 id 工作，重名也不会绑错 */
  options?: TagOption[]
  allowFreeText?: boolean
  validator?: (value: string) => boolean
  onValidationError?: (value: string) => void
  /** 批量分隔符（如 /[\s,;，；]+/）：提交时按其把一段文本拆成多个 tag——粘贴一串邮箱的场景 */
  splitPattern?: RegExp
  className?: string
  tagVariant?: 'brand' | 'mono'
  disabled?: boolean
  /** 锁定的 tag：始终以 chip 展示、不可移除（无 × 按钮），如创建空间时的负责人 */
  lockedValues?: string[]
  /** 锁定 chip 上展示的小标签文案（如「负责人」）；不传则仅隐藏移除按钮 */
  lockedBadge?: string
}

export function TagInput({
  value,
  onChange,
  placeholder = '',
  hint,
  suggestions,
  options,
  allowFreeText = true,
  validator,
  onValidationError,
  splitPattern,
  className,
  tagVariant = 'brand',
  disabled = false,
  lockedValues,
  lockedBadge,
}: TagInputProps) {
  const isLocked = useCallback((v: string) => Boolean(lockedValues?.includes(v)), [lockedValues])
  const optionMode = Array.isArray(options)
  // 选项模式禁用自由文本：只能从候选里选既有 id，避免把随手输入当成 id 提交
  const freeText = allowFreeText && !optionMode
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputBoxRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  // Position the options menu via a fixed-position portal so it is never
  // clipped by a scrollable/overflow-hidden ancestor (e.g. the guardrail
  // drawer body). Recomputed on open + on scroll/resize.
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null)

  // 已选 chip 的展示文案：选项模式按 id 查 label（查不到回退原值），否则值即文案
  const labelOf = useCallback(
    (v: string) => (optionMode ? options!.find((o) => o.value === v)?.label ?? v : v),
    [optionMode, options],
  )

  // 候选池统一成 {value,label}：选项模式取未禁用的 options，否则把字符串建议升格
  const pool: TagOption[] = optionMode
    ? options!.filter((o) => !o.disabled)
    : (suggestions ?? []).map((s) => ({ value: s, label: s }))
  const hasSuggestions = pool.length > 0

  const filtered = pool.filter(
    (o) => o.value != null && !value.includes(o.value) && o.label.toLowerCase().includes(input.toLowerCase()),
  )

  // 统一按「值」提交：选项模式传 option.value(id)，自由文本模式传输入文本本身。
  // 有 splitPattern 时先按分隔符拆成多段（粘贴一串邮箱），逐段校验入列，非法段回调后跳过。
  const addTag = useCallback((tag: string) => {
    if (disabled) return
    const pieces = (splitPattern ? tag.split(splitPattern) : [tag]).map((p) => p.trim()).filter(Boolean)
    if (pieces.length === 0) return
    const next = [...value]
    let rejected = 0
    for (const piece of pieces) {
      if (next.includes(piece)) continue
      if (validator && !validator(piece)) {
        onValidationError?.(piece)
        rejected += 1
        continue
      }
      next.push(piece)
    }
    if (next.length !== value.length) onChange(next)
    // 全部被校验拒绝时保留输入原文，让用户就地改错（与旧单段行为一致）
    if (!(rejected > 0 && next.length === value.length)) setInput('')
    setFocusIdx(-1)
    if (!hasSuggestions) setOpen(false)
  }, [disabled, value, onChange, validator, onValidationError, splitPattern, hasSuggestions])

  const removeTag = useCallback((tag: string) => {
    if (disabled || isLocked(tag)) return
    onChange(value.filter((v) => v !== tag))
  }, [disabled, isLocked, value, onChange])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (hasSuggestions && focusIdx >= 0 && filtered[focusIdx]) {
        addTag(filtered[focusIdx].value)
      } else if (freeText && input.trim()) {
        addTag(input)
      }
      return
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      // 从末尾往前删第一个可删（非锁定）的 tag，锁定项（如负责人）跳过
      const lastRemovable = [...value].reverse().find((v) => !isLocked(v))
      if (lastRemovable) removeTag(lastRemovable)
      return
    }
    if (hasSuggestions) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)) }
    }
    if (e.key === 'Escape') setOpen(false)
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node
      // The menu is portaled outside containerRef, so also exempt dropdownRef.
      if (
        containerRef.current && !containerRef.current.contains(t) &&
        (!dropdownRef.current || !dropdownRef.current.contains(t))
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const showDropdown = !disabled && hasSuggestions && open && filtered.length > 0

  // Track the input's viewport rect so the fixed-position portal menu lines up,
  // and follows scroll/resize while open.
  useLayoutEffect(() => {
    // 关闭时不重置 menuPos：渲染处已由 showDropdown 同时把关，旧值不会被画出来；
    // 重新打开时本 effect 会在绘制前先 update() 取到新位置
    if (!showDropdown) return
    const update = () => {
      const r = (inputBoxRef.current ?? containerRef.current)?.getBoundingClientRect()
      if (r) {
        const maxWidth = window.innerWidth - r.left - 8
        setMenuPos({ left: r.left, top: r.bottom + 2, width: Math.min(r.width, maxWidth) })
      }
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [showDropdown, filtered.length])

  // 需求方#211：下拉 portal 到 document.body,当它开在 modal 抽屉/弹窗(Radix Dialog/SideSheet)内时,
  // Radix 的 react-remove-scroll 在 document 上拦截滚轮、只放行弹窗自身子树 → 本下拉(在白名单外)原生
  // 滚轮被吞、无法滚动(程序化 scrollTop 不受影响,故 bug 只在真实滚轮时出现)。这里加非被动 wheel 监听,
  // 手动接管滚动,绕过滚动锁;不在弹窗内时同样正常(preventDefault 防与页面双滚)。
  useEffect(() => {
    if (!showDropdown) return
    const el = dropdownRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      el.scrollTop += e.deltaY
      e.preventDefault()
      e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [showDropdown, menuPos])

  const tagClass = tagVariant === 'mono'
    ? 'bg-mg-fill-0 text-mg-text-1 border-mg-border'
    : 'bg-brand-base/10 text-brand-base border-brand-base/20'

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div
        ref={inputBoxRef}
        className={`flex flex-wrap items-center gap-1.5 min-h-[var(--mg-control-h-md)] px-[var(--mg-control-pad-x-xs)] py-1.5 rounded-lg border border-mg-border bg-mg-bg-0 transition-colors focus-within:border-brand-base ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-text'}`}
        onClick={() => { if (!disabled) inputRef.current?.focus() }}
      >
        {value.map((tag) => {
          const locked = isLocked(tag)
          return (
            <span key={tag} className={`inline-flex items-center gap-1 px-[var(--mg-control-pad-x-xs)] py-0.5 rounded-md mg-compact-badge border ${tagClass}`}>
              <code className="font-mono">{labelOf(tag)}</code>
              {locked ? (
                lockedBadge && <span className="shrink-0 whitespace-nowrap font-semibold not-italic opacity-80">{lockedBadge}</span>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                  className="hover:text-[var(--mg-danger-text)] transition-colors cursor-pointer"
                >
                  <LuX size={10} />
                </button>
              )}
            </span>
          )
        })}
        <div className="flex-1 min-w-[80px] flex items-center">
          <input
            ref={inputRef}
            disabled={disabled}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (hasSuggestions) { setOpen(true); setFocusIdx(-1) }
            }}
            onFocus={() => { if (hasSuggestions) setOpen(true) }}
            onBlur={() => {
              // Commit pending free-text on blur so a value typed but not
              // Enter-committed isn't silently dropped when the user clicks
              // Save (e.g. IP whitelist). Scoped to pure free-text inputs;
              // suggestion-backed inputs still require explicit selection so
              // half-typed queries don't get committed as junk tags.
              if (freeText && !hasSuggestions && input.trim()) addTag(input)
            }}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 bg-transparent mg-text-body text-mg-text-1 outline-none placeholder:text-mg-text-3/60 min-w-0 font-mono"
          />
          {hasSuggestions && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => { setOpen((o) => !o); inputRef.current?.focus() }}
              className="shrink-0 p-0.5 text-mg-text-3 hover:text-mg-text-1 transition-colors cursor-pointer"
            >
              <LuChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {hint && <p className="mg-text-caption text-mg-text-3 mt-1.5">{hint}</p>}

      {/* Portaled to document.body so position:fixed is relative to the viewport,
          not to any transformed ancestor (e.g. the Dialog's translate-x/y-[-50%]).
          Uses the blocking layer because suggestions can open inside a modal. */}
      {showDropdown && menuPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', left: menuPos.left, top: menuPos.top, width: menuPos.width }}
          className="z-[var(--mg-z-blocking)] pointer-events-auto max-h-[240px] overflow-y-auto rounded-lg mg-float py-1"
        >
          {filtered.map((item, idx) => (
            <button
              key={item.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(item.value) }}
              className={`block w-full text-left px-[var(--mg-menu-item-px)] py-1.5 mg-text-code transition-colors cursor-pointer ${
                idx === focusIdx
                  ? 'bg-brand-base/10 text-brand-base'
                  : 'text-mg-text-1 hover:bg-mg-fill-0'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
