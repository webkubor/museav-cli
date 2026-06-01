import React, { useRef, useState, useEffect, useCallback } from 'react'
import { LuX, LuChevronDown } from 'react-icons/lu'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  hint?: string
  suggestions?: string[]
  allowFreeText?: boolean
  validator?: (value: string) => boolean
  className?: string
  tagVariant?: 'brand' | 'mono'
}

export function TagInput({
  value,
  onChange,
  placeholder = '',
  hint,
  suggestions,
  allowFreeText = true,
  validator,
  className,
  tagVariant = 'brand',
}: TagInputProps) {
  const hasSuggestions = suggestions && suggestions.length > 0
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = hasSuggestions
    ? suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase()))
    : []

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || value.includes(trimmed)) return
    if (validator && !validator(trimmed)) return
    onChange([...value, trimmed])
    setInput('')
    setFocusIdx(-1)
    if (!hasSuggestions) setOpen(false)
  }, [value, onChange, validator, hasSuggestions])

  const removeTag = useCallback((tag: string) => {
    onChange(value.filter((v) => v !== tag))
  }, [value, onChange])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (hasSuggestions && focusIdx >= 0 && filtered[focusIdx]) {
        addTag(filtered[focusIdx])
      } else if (allowFreeText && input.trim()) {
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const showDropdown = hasSuggestions && open && filtered.length > 0

  const tagClass = tagVariant === 'mono'
    ? 'bg-mg-fill-0 text-mg-text-0 border-mg-border'
    : 'bg-brand-base/10 text-brand-base border-brand-base/20'

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[38px] px-2.5 py-1.5 rounded-lg border border-mg-border bg-mg-bg-0 cursor-text transition-colors focus-within:border-brand-base"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${tagClass}`}>
            <code className="font-mono">{tag}</code>
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

      {showDropdown && (
        <div className="absolute z-20 mt-1 w-full max-h-[200px] overflow-y-auto rounded-lg border border-mg-border bg-card-bg shadow-lg py-1">
          {filtered.map((item, idx) => (
            <button
              key={item}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(item) }}
              className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer ${
                idx === focusIdx
                  ? 'bg-brand-base/10 text-brand-base'
                  : 'text-mg-text-0 hover:bg-mg-fill-0'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
