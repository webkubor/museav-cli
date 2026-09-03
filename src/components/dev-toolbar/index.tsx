import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LuWrench } from 'react-icons/lu'
import { Popover } from '@/components/ui/Popover'
import type { PlatformConfig } from '@/services/platform'
import { cn } from '@/lib/utils'
import { useLangStore } from '@/store/use-brand-store'
import { applyBrandTheme, applyTheme, getSavedTheme, resolveTheme, saveBrandTheme, saveTheme } from '@/lib/theme'
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
            'px-2.5 py-1 rounded-full text-xs font-bold transition-colors',
            value === o.v ? 'bg-brand-base text-white' : 'text-mg-text-3 hover:text-mg-text-1'
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

/**
 * 开发者工具栏（仅 DEV 环境，顶栏内一枚扳手图标，点开才展开面板）。
 * 切换国内/海外、语言——市场切换一把带动 logo / 品牌 / 主题色（主题色按 data-market 走 CSS）。
 * 另含黑/白主题快速切换，方便本地调样式。
 * 「开发菜单」跳转平台配置调试页（原侧栏「开发者菜单」移入此处，不侵入业务侧栏）。
 */
export function DevToolbar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const market = useLangStore((s) => s.market)
  const lang = useLangStore((s) => s.lang)
  const setMarket = useLangStore((s) => s.setMarket)
  const setLang = useLangStore((s) => s.setLang)
  const qc = useQueryClient()
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => resolveTheme(getSavedTheme()))

  const switchMarket = (m: Market) => {
    setMarket(m)
    document.documentElement.dataset.market = m
    // 重置品牌主题为 default，让主题色回到由 data-market 驱动（china=indigo / global=emerald）
    applyBrandTheme({ mode: 'default' })
    saveBrandTheme({ mode: 'default' })
    // 本地 dev：测试后端只有一套（platform-config 固定），override 业务真源缓存，
    // 让所有读 platform-config 的业务 UI（useSite / useCurrency / 发票等）跟随本地市场切换。
    qc.setQueryData<PlatformConfig>(['platform-config'], (old) =>
      old
        ? {
            ...old,
            site: m, // market 即 site（'china' | 'global'），无转换
            settlement_currency: m === 'china' ? 'CNY' : 'USD',
          }
        : old
    )
  }

  const switchLang = (l: Lang) => {
    setLang(l)
    i18n.changeLanguage(l)
  }

  const switchTheme = (next: 'light' | 'dark') => {
    setThemeState(next)
    applyTheme(next)
    saveTheme(next)
  }

  const panel = (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <Seg
        value={theme}
        options={[
          { v: 'light', l: t('common.devToolbar.light') },
          { v: 'dark', l: t('common.devToolbar.dark') },
        ]}
        onChange={switchTheme}
      />
      <div className="h-4 w-px bg-mg-border" />
      <Seg
        value={market}
        options={[
          { v: 'china', l: t('common.devToolbar.china') },
          { v: 'global', l: t('common.devToolbar.global') },
        ]}
        onChange={switchMarket}
      />
      <Seg
        value={lang}
        options={[
          { v: 'zh', l: t('common.devToolbar.zh') },
          { v: 'en', l: t('common.devToolbar.en') },
        ]}
        onChange={switchLang}
      />
      <div className="h-4 w-px bg-mg-border" />
      <button
        type="button"
        onClick={() => navigate('/dev-config')}
        className="whitespace-nowrap rounded-full bg-mg-fill-0 px-3 py-1 text-xs font-bold text-mg-text-2 transition-colors hover:text-mg-text-1"
      >
        {t('common.devToolbar.menu')}
      </button>
    </div>
  )

  /* 只在顶栏占一枚 36px 图标，展开的面板走 Popover 浮层。
     历史：先是 fixed 吸底盖住页面图表 → 挪右下角又和智能助手悬浮球撞 → 平铺进顶栏后
     宽 378px，在 lg~1230px 区间把「快速接入」挤到只剩 39px、文字全没（2026-09-03 实测）。
     开发工具不该跟产品内容抢横向空间，收成图标后无论多窄都只占一枚按钮。 */
  return (
    <div className="hidden lg:block w-9 shrink-0 select-none">
      <Popover
        position="bottom"
        content={panel}
        trigger={
          <button
            type="button"
            title={t('common.devToolbar.title')}
            aria-label={t('common.devToolbar.title')}
            className="inline-flex h-8 w-9 items-center justify-center rounded-full border border-mg-border text-mg-text-3 transition-colors hover:text-mg-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/40"
          >
            <LuWrench size={14} />
          </button>
        }
      />
    </div>
  )
}
