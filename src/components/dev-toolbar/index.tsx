import { useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { PlatformConfig } from '@/services/platform'
import { Switch } from '@/components/ui/Switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import { cn } from '@/lib/utils'
import { useLangStore } from '@/store/use-brand-store'
import { useDevStore } from '@/store/use-dev-store'
import { useAuthStore } from '@/store/auth'
import {
  applyBrandTheme,
  applyTheme,
  getSavedBrandTheme,
  saveBrandTheme,
  saveTheme,
  type BrandThemeConfig,
} from '@/lib/theme'
import type { Market, Lang } from '@/lib/market'

const BRAND_THEME_PRESETS = [
  { label: '默认', value: 'default', color: 'linear-gradient(135deg, #6743fd 0 50%, #1DC39B 50% 100%)' },
  { label: '紫', value: '#6743fd', color: '#6743fd' },
  { label: '绿', value: '#1DC39B', color: '#1DC39B' },
  { label: '蓝', value: '#2563eb', color: '#2563eb' },
  { label: '青', value: '#0891b2', color: '#0891b2' },
  { label: '玫', value: '#e11d48', color: '#e11d48' },
] as const

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim()
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`
  return null
}

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

function ThemeColorPanel({
  value,
  onChange,
}: {
  value: BrandThemeConfig
  onChange: (value: BrandThemeConfig) => void
}) {
  const activeColor = value.mode === 'custom' && value.base ? value.base : ''
  const [draftColor, setDraftColor] = useState(activeColor || '#6743fd')

  const selectPreset = (presetValue: string, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onChange(presetValue === 'default' ? { mode: 'default' } : { mode: 'custom', base: presetValue })
  }

  const selectCustomColor = (event: ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation()
    setDraftColor(event.target.value)
    onChange({ mode: 'custom', base: event.target.value })
  }

  const editCustomColor = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    setDraftColor(nextValue)
    const normalized = normalizeHexColor(nextValue)
    if (normalized) {
      onChange({ mode: 'custom', base: normalized })
    }
  }

  return (
    <div className="space-y-3 p-2">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand-base">主题色</p>
        <p className="mt-0.5 text-[10px] font-medium text-mg-text-2">
          覆盖全局 brand token，方便验证后台主题配置
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {BRAND_THEME_PRESETS.map((preset) => {
          const isActive =
            preset.value === 'default'
              ? value.mode === 'default'
              : value.mode === 'custom' && value.base?.toLowerCase() === preset.value.toLowerCase()

          return (
            <button
              key={preset.value}
              type="button"
              onClick={(event) => selectPreset(preset.value, event)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors',
                isActive
                  ? 'border-brand-base bg-brand-selected-bg text-brand-base'
                  : 'border-mg-border bg-mg-bg-0 text-mg-text-1 hover:border-brand-mid hover:text-mg-text-0'
              )}
            >
              <span
                className="h-3 w-3 rounded-full border border-white/40 shadow-sm"
                style={{ background: preset.color }}
              />
              {preset.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-mg-border bg-mg-bg-0 px-2.5 py-2">
        <label htmlFor="dev-brand-theme-color" className="text-[11px] font-semibold text-mg-text-1">
          自定义
        </label>
        <div className="flex min-w-0 items-center gap-2">
          <input
            id="dev-brand-theme-color"
            type="text"
            value={draftColor}
            onChange={editCustomColor}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="#6743fd"
            spellCheck={false}
            className="h-7 w-[92px] rounded-lg border border-mg-border bg-mg-fill-0 px-2 font-mono text-[11px] font-semibold text-mg-text-0 outline-none transition-colors focus:border-brand-base focus:ring-2 focus:ring-brand-glow"
          />
          <input
            type="color"
            value={normalizeHexColor(draftColor) || activeColor || '#6743fd'}
            onChange={selectCustomColor}
            onClick={(event) => event.stopPropagation()}
            className="h-6 w-8 cursor-pointer rounded-md border border-mg-border bg-transparent p-0"
            aria-label="自定义主题色"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 开发者工具栏（仅 DEV 环境，悬浮底部居中）。
 * 功能：切换国内/海外 UI、切换语言、切换主题色。
 */
export function DevToolbar() {
  const { i18n } = useTranslation()
  const market = useLangStore((s) => s.market)
  const lang = useLangStore((s) => s.lang)
  const setMarket = useLangStore((s) => s.setMarket)
  const setLang = useLangStore((s) => s.setLang)
  const qc = useQueryClient()
  const showPlatformConfig = useDevStore((s) => s.showPlatformConfig)
  const setShowPlatformConfig = useDevStore((s) => s.setShowPlatformConfig)
  const accountId = useAuthStore((s) => s.account?.account_id)

  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    document.body.getAttribute('theme-mode') === 'dark' ? 'dark' : 'light'
  )
  const [brandTheme, setBrandTheme] = useState<BrandThemeConfig>(() => getSavedBrandTheme())

  const switchTheme = (t: 'light' | 'dark') => {
    setThemeMode(t)
    saveTheme(t, accountId)
    applyTheme(t)
  }

  const switchBrandTheme = (config: BrandThemeConfig) => {
    setBrandTheme(config)
    saveBrandTheme(config)
    applyBrandTheme(config)
  }

  const switchMarket = (m: Market) => {
    setMarket(m)
    document.documentElement.dataset.market = m
    switchBrandTheme({ mode: 'default' })
    // 本地 dev：测试后端只有一套（platform-config 固定），override 业务真源缓存，
    // 让所有读 platform-config 的业务 UI（useSite / useCurrency / 发票等）跟随本地市场切换。
    qc.setQueryData<PlatformConfig>(['platform-config'], (old) =>
      old
        ? {
            ...old,
            site: m === 'domestic' ? 'china' : 'international',
            settlement_currency: m === 'domestic' ? 'CNY' : 'USD',
          }
        : old
    )
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
        <span className="text-[11px] font-semibold text-mg-text-2">开发者菜单</span>
        <Switch checked={showPlatformConfig} onChange={setShowPlatformConfig} />
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-mg-fill-0 px-3 py-1 text-[11px] font-bold text-mg-text-1 transition-colors hover:text-mg-text-0"
          >
            <span
              className="h-2.5 w-2.5 rounded-full border border-white/40"
              style={{ background: brandTheme.mode === 'custom' ? brandTheme.base : 'var(--brand-base)' }}
            />
            主题色
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="w-[280px] p-0">
          <ThemeColorPanel
            key={`${brandTheme.mode}:${brandTheme.base ?? ''}`}
            value={brandTheme}
            onChange={switchBrandTheme}
          />
        </DropdownMenuContent>
      </DropdownMenu>
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
