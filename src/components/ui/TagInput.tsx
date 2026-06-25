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
  className?: string
  tagVariant?: 'brand' | 'mono'
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
  className,
  tagVariant = 'brand',
}: TagInputProps) {
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

  // 统一按「值」提交：选项模式传 option.value(id)，自由文本模式传输入文本本身
  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || value.includes(trimmed)) return
    if (validator && !validator(trimmed)) {
      onValidationError?.(trimmed)
      return
    }
    onChange([...value, trimmed])
    setInput('')
    setFocusIdx(-1)
    if (!hasSuggestions) setOpen(false)
  }, [value, onChange, validator, onValidationError, hasSuggestions])

  const removeTag = useCallback((tag: string) => {
    onChange(value.filter((v) => v !== tag))
  }, [value, onChange])

  function handleKeyDown(e: React.KeyboardEvent) {
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
      removeTag(value[value.length - 1])
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

  const showDropdown = hasSuggestions && open && filtered.length > 0

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

  const tagClass = tagVariant === 'mono'
    ? 'bg-mg-fill-0 text-mg-text-0 border-mg-border'
    : 'bg-brand-base/10 text-brand-base border-brand-base/20'

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div
        ref={inputBoxRef}
        className="flex flex-wrap items-center gap-1.5 min-h-[38px] px-2.5 py-1.5 rounded-lg border border-mg-border bg-mg-bg-0 cursor-text transition-colors focus-within:border-brand-base"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${tagClass}`}>
            <code className="font-mono">{labelOf(tag)}</code>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
              className="hover:text-rose-500 transition-colors cursor-pointer"
            >
              <LuX size={10} />
            </button>
          </span>
        ))}
        <div className="flex-1 min-w-[80px] flex items-center">
          <input
            ref={inputRef}
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
            className="flex-1 bg-transparent text-sm text-mg-text-0 outline-none placeholder:text-mg-text-2/60 min-w-0 font-mono"
          />
          {hasSuggestions && (
            <button
              type="button"
              onClick={() => { setOpen((o) => !o); inputRef.current?.focus() }}
              className="shrink-0 p-0.5 text-mg-text-2 hover:text-mg-text-0 transition-colors cursor-pointer"
            >
              <LuChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {hint && <p className="text-[10px] text-mg-text-2 mt-1.5">{hint}</p>}

      {/* Portaled to document.body so position:fixed is relative to the viewport,
          not to any transformed ancestor (e.g. the Dialog's translate-x/y-[-50%]).
          z-index 10000 sits above the modal (z-50 = 50). */}
      {showDropdown && menuPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', left: menuPos.left, top: menuPos.top, width: menuPos.width, zIndex: 10000, pointerEvents: 'auto' }}
          className="max-h-[240px] overflow-y-auto rounded-lg border border-mg-border bg-card-bg shadow-lg py-1"
        >
          {filtered.map((item, idx) => (
            <button
              key={item.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(item.value) }}
              className={`block w-full text-left px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer ${
                idx === focusIdx
                  ? 'bg-brand-base/10 text-brand-base'
                  : 'text-mg-text-0 hover:bg-mg-fill-0'
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
