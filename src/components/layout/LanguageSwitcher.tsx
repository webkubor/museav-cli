import { LuGlobe, LuCheck } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { useLangStore } from '@/store/use-brand-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import { cn } from '@/lib/utils'
import type { Lang } from '@/lib/market'

const LANGUAGE_OPTIONS: Array<{ lang: Lang; label: string }> = [
  { lang: 'zh', label: '简体中文' },
  { lang: 'en', label: 'English' },
]

/**
 * 顶栏语言切换：地球图标直达，不必深入 设置→账号→偏好设置 才能换语言（原入口仍保留，
 * 供时区等完整偏好一并配置）。提示文案固定中英双语，切语言前也认得出这颗图标。
 */
export function LanguageSwitcher() {
  const { i18n: i18nInstance } = useTranslation()
  const setGlobalLang = useLangStore((s) => s.setLang)
  const currentLang: Lang = i18nInstance.language.startsWith('zh') ? 'zh' : 'en'

  function handleSelect(lang: Lang) {
    if (lang === currentLang) return
    i18n.changeLanguage(lang)
    setGlobalLang(lang)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="切换语言 / Switch language"
          aria-label="切换语言 / Switch language"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-mg-text-2 transition-colors duration-200 hover:bg-mg-fill-0/50 hover:text-mg-text-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/40"
        >
          <LuGlobe size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        {LANGUAGE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.lang}
            onSelect={() => handleSelect(option.lang)}
            className={cn(option.lang === currentLang && 'text-brand-base bg-brand-base/[0.08]')}
          >
            <span className="flex-1">{option.label}</span>
            {option.lang === currentLang && <LuCheck size={14} className="text-brand-base" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
