import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { PlatformConfig } from '@/services/platform'
import { Switch } from '@/components/ui/Switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/DropdownMenu'
import { cn } from '@/lib/utils'
import { useLangStore } from '@/store/use-brand-store'
import { useDevStore } from '@/store/use-dev-store'
import { applyBrandTheme, saveBrandTheme } from '@/lib/theme'
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
 * 只保留切换国内/海外、语言——市场切换一把带动 logo / 品牌 / 主题色（主题色按 data-market 走 CSS）。
 * 主题色挑选与深浅切换已移除：dev 不再手动覆盖，主题色完全由市场驱动。
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

  const switchMarket = (m: Market) => {
    setMarket(m)
    document.documentElement.dataset.market = m
    // 重置品牌主题为 default，让主题色回到由 data-market 驱动（domestic=indigo / global=emerald）
    applyBrandTheme({ mode: 'default' })
    saveBrandTheme({ mode: 'default' })
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
      <div className="h-4 w-px bg-mg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full bg-mg-fill-0 px-3 py-1 text-[11px] font-bold text-mg-text-1 transition-colors hover:text-mg-text-0"
          >
            链接
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-48">
          <DropdownMenuItem asChild>
            <a href="https://cloud.umami.is/share/LG5OU5ibCRxc2w3j" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
              📊 埋点数据
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="https://test.modelgo.com" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
              🌐 测试官网
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="https://modelgo-docs-cn.pages.dev" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
              📖 测试文档
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="https://admin.test.modelgo.com" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
              🛠 测试后台
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
