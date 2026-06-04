import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/Switch'
import { cn } from '@/lib/utils'
import { useLangStore } from '@/store/use-brand-store'
import { useDevStore } from '@/store/use-dev-store'
import { useAuthStore } from '@/store/auth'
import { applyTheme, saveTheme } from '@/lib/theme'
import type { Market, Lang } from '@/lib/market'

interface SegOption<T extends string> {
  v: T
  l: string
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: SegOption<T>[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-full bg-mg-fill-0 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors',
            value === o.v ? 'bg-brand-base text-white' : 'text-mg-text-2 hover:text-mg-text-0'
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

/**
 * 开发者工具栏（仅 DEV 环境，悬浮底部居中）。
 * 功能：开关需求看板、切换国内/海外 UI、切换语言。
 */
export function DevToolbar() {
  const { i18n } = useTranslation()
  const market = useLangStore((s) => s.market)
  const lang = useLangStore((s) => s.lang)
  const setMarket = useLangStore((s) => s.setMarket)
  const setLang = useLangStore((s) => s.setLang)
  const showRequirements = useDevStore((s) => s.showRequirements)
  const setShowRequirements = useDevStore((s) => s.setShowRequirements)
  const mockMemberCount = useDevStore((s) => s.mockMemberCount)
  const setMockMemberCount = useDevStore((s) => s.setMockMemberCount)
  const mockGuardrailCount = useDevStore((s) => s.mockGuardrailCount)
  const setMockGuardrailCount = useDevStore((s) => s.setMockGuardrailCount)
  const accountId = useAuthStore((s) => s.account?.account_id)
  const qc = useQueryClient()

  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    document.body.getAttribute('theme-mode') === 'dark' ? 'dark' : 'light'
  )

  const switchTheme = (t: 'light' | 'dark') => {
    setThemeMode(t)
    saveTheme(t, accountId)
    applyTheme(t)
  }

  const changeMockMembers = (n: number) => {
    setMockMemberCount(n)
    qc.invalidateQueries({ queryKey: ['tenant-members'] })
  }

  const changeMockGuardrails = (n: number) => {
    setMockGuardrailCount(n)
    qc.invalidateQueries({ queryKey: ['guardrails'] })
    qc.removeQueries({ queryKey: ['guardrail-detail'] })
  }

  const switchMarket = (m: Market) => {
    setMarket(m)
    // data-market 驱动品牌色/Logo，需手动同步到 <html>
    document.documentElement.dataset.market = m
  }

  const switchLang = (l: Lang) => {
    setLang(l)
    i18n.changeLanguage(l)
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[2000] flex items-center gap-3 px-4 py-2 rounded-full bg-mg-bg-0/95 backdrop-blur border border-mg-border shadow-lg shadow-black/5 select-none">
      <span className="text-[10px] font-bold text-brand-base tracking-widest uppercase">DEV</span>
      <div className="h-4 w-px bg-mg-border" />
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-mg-text-2">需求看板</span>
        <Switch checked={showRequirements} onChange={setShowRequirements} />
      </div>
      <div className="h-4 w-px bg-mg-border" />
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-mg-text-2">组织人数</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => changeMockMembers(mockMemberCount - 5)}
            className="w-5 h-5 rounded-full bg-mg-fill-0 text-mg-text-1 hover:text-mg-text-0 text-xs font-bold leading-none flex items-center justify-center"
          >
            −
          </button>
          <span className="text-[11px] font-bold text-mg-text-0 w-6 text-center tabular-nums">{mockMemberCount}</span>
          <button
            type="button"
            onClick={() => changeMockMembers(mockMemberCount + 5)}
            className="w-5 h-5 rounded-full bg-mg-fill-0 text-mg-text-1 hover:text-mg-text-0 text-xs font-bold leading-none flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
      <div className="h-4 w-px bg-mg-border" />
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-mg-text-2">安全护栏</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => changeMockGuardrails(mockGuardrailCount - 1)}
            className="w-5 h-5 rounded-full bg-mg-fill-0 text-mg-text-1 hover:text-mg-text-0 text-xs font-bold leading-none flex items-center justify-center"
          >
            −
          </button>
          <span className="text-[11px] font-bold text-mg-text-0 w-6 text-center tabular-nums">{mockGuardrailCount}</span>
          <button
            type="button"
            onClick={() => changeMockGuardrails(mockGuardrailCount + 1)}
            className="w-5 h-5 rounded-full bg-mg-fill-0 text-mg-text-1 hover:text-mg-text-0 text-xs font-bold leading-none flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
      <div className="h-4 w-px bg-mg-border" />
      <Seg
        value={market}
        options={[
          { v: 'domestic', l: '国内' },
          { v: 'global', l: '海外' },
        ]}
        onChange={switchMarket}
      />
      <Seg
        value={lang}
        options={[
          { v: 'zh', l: '中' },
          { v: 'en', l: 'EN' },
        ]}
        onChange={switchLang}
      />
      <Seg
        value={themeMode}
        options={[
          { v: 'light', l: '浅' },
          { v: 'dark', l: '深' },
        ]}
        onChange={switchTheme}
      />
    </div>
  )
}
