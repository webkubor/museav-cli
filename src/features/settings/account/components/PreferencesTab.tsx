import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { getPreferences, updatePreferences } from '@/services/preferences'
import { appToast } from '@/lib/app-toast'
import { useLangStore } from '@/store/use-brand-store'
import { useAuthStore } from '@/store/auth'
import { applyTheme, getSavedTheme, getUserTheme, saveTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { LuSun, LuMoon, LuMonitor } from 'react-icons/lu'
import {
  BROWSER_TIME_ZONE,
  COMMON_TIME_ZONES,
  formatTimeZoneOffset,
  getBrowserTimeZone,
  getSavedTimeZone,
  getUserTimeZone,
  resolveTimeZone,
  saveTimeZone,
  type TimeZonePreference,
} from '@/lib/timezone'
import type { Preferences } from '@/types'
import type { Lang } from '@/lib/market'

type PreferenceLanguage = Preferences['ui']['language']

const LANGUAGE_OPTIONS: Array<{
  value: PreferenceLanguage
  i18nLang: Lang
  titleKey: string
  descKey: string
}> = [
  {
    value: 'zh-CN',
    i18nLang: 'zh',
    titleKey: 'account.preferences.languageZh',
    descKey: 'account.preferences.languageZhDesc',
  },
  {
    value: 'en-US',
    i18nLang: 'en',
    titleKey: 'account.preferences.languageEn',
    descKey: 'account.preferences.languageEnDesc',
  },
]

const THEME_OPTIONS: Array<{
  value: Theme
  titleKey: string
  descKey: string
}> = [
  {
    value: 'light',
    titleKey: 'common.themeLight',
    descKey: 'account.preferences.themeLightDesc',
  },
  {
    value: 'dark',
    titleKey: 'common.themeDark',
    descKey: 'account.preferences.themeDarkDesc',
  },
  {
    value: 'system',
    titleKey: 'common.themeSystem',
    descKey: 'account.preferences.themeSystemDesc',
  },
]

function toI18nLang(language: PreferenceLanguage): Lang {
  return LANGUAGE_OPTIONS.find((item) => item.value === language)?.i18nLang ?? 'zh'
}

function formatTimeZoneTitle(timeZone: string, locale: string): string {
  return `${timeZone} (${formatTimeZoneOffset(timeZone, locale)})`
}

export function PreferencesTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const setGlobalLang = useLangStore((state) => state.setLang)
  const account = useAuthStore((state) => state.account)
  const [language, setLanguage] = useState<PreferenceLanguage>('zh-CN')
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme())
  const [timeZone, setTimeZone] = useState<TimeZonePreference>(() => getSavedTimeZone())
  const [lowBalanceAlertsEnabled, setLowBalanceAlertsEnabled] = useState(true)
  const locale = i18n.language || 'zh-CN'
  const browserTimeZone = getBrowserTimeZone()
  const concreteTimeZones = [
    browserTimeZone,
    ...COMMON_TIME_ZONES.filter((item) => item !== browserTimeZone),
  ]
  const resolvedTimeZone = resolveTimeZone(timeZone)
  const previewTime = new Date().toLocaleString(locale, {
    timeZone: resolvedTimeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const preferencesQuery = useQuery({
    queryKey: ['account-preferences'],
    queryFn: getPreferences,
  })

  useEffect(() => {
    if (!preferencesQuery.data) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguage(preferencesQuery.data.ui.language)
    setLowBalanceAlertsEnabled(preferencesQuery.data.notifications.low_balance_alerts_enabled)
    // 显示时区：后端 ui.timezone（#409）为真源；缺省时回退 localStorage/浏览器。
    // seed 到本地（saveTimeZone）供 format-date 的 resolveTimeZone 全站读取，实现跨设备一致。
    const backendTz = preferencesQuery.data.ui.timezone
    const localTz = account ? getUserTimeZone(account.account_id) : getSavedTimeZone()
    const tz = backendTz && backendTz.length > 0 ? backendTz : localTz
    setTimeZone(tz)
    saveTimeZone(tz, account?.account_id)
  }, [preferencesQuery.data, account])

  useEffect(() => {
    if (!account) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(getUserTheme(account.account_id))
  }, [account])

  function handleThemeChange(value: string) {
    const nextTheme = value as Theme
    setTheme(nextTheme)
    saveTheme(nextTheme, account?.account_id)
    applyTheme(nextTheme)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePreferences({
        // timezone 一并入库（#409）；后端未上线该字段时按未知字段忽略，本地仍 saveTimeZone 兜底
        ui: { language, timezone: timeZone },
        notifications: { low_balance_alerts_enabled: lowBalanceAlertsEnabled },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(['account-preferences'], result)
      const nextLang = toI18nLang(result.ui.language)
      setGlobalLang(nextLang)
      i18n.changeLanguage(nextLang)
      saveTheme(theme, account?.account_id)
      applyTheme(theme)
      saveTimeZone(timeZone, account?.account_id)
      appToast.success(t('account.preferences.saveSuccess'))
    },
    onError: (error) => {
      appToast.requestError(error, t('account.preferences.saveError'))
    },
  })

  if (preferencesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-mg-text-2">
        <div className="w-4 h-4 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
        {t('common.loading')}
      </div>
    )
  }

  if (preferencesQuery.isError) {
    return (
      <div className="py-8 text-sm text-mg-danger">
        {t('account.preferences.loadError')}
      </div>
    )
  }

  return (
    <div className="flex max-w-[620px] flex-col gap-2 pt-2 animate-in fade-in duration-300">
      <div className="bg-mg-bg-0 border border-mg-border/60 rounded-lg p-6 shadow-sm flex flex-col">
        
        {/* 界面语言（Language） */}
        <div className="pb-5 border-b border-mg-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="max-w-xs">
            <div className="text-[14px] font-bold text-mg-text-1">
              {t('account.preferences.languageTitle')}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-mg-text-3">
              {t('account.preferences.languageDesc')}
            </div>
          </div>

          {/* 语言 Segmented 控制器 */}
          <div className="flex bg-mg-fill-0/30 p-1 rounded-md border border-mg-border/40 shrink-0 self-start md:self-center">
            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = language === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setLanguage(option.value)
                    const lang = toI18nLang(option.value)
                    i18n.changeLanguage(lang)
                    setGlobalLang(lang)
                  }}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 cursor-pointer select-none active:scale-[0.96]",
                    isSelected
                      ? "bg-mg-fill-0 text-brand-base shadow-sm font-black border border-mg-border/30"
                      : "text-mg-text-3 hover:text-mg-text-1"
                  )}
                >
                  {t(option.titleKey)}
                </button>
              )
            })}
          </div>
        </div>

        {/* 界面主题（Theme） */}
        <div className="py-5 border-b border-mg-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="max-w-xs">
            <div className="text-[14px] font-bold text-mg-text-1">
              {t('account.preferences.themeTitle')}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-mg-text-3">
              {t('account.preferences.themeDesc')}
            </div>
          </div>

          {/* 主题选择卡片并排 */}
          <div className="grid grid-cols-3 gap-2 shrink-0 w-full md:w-auto">
            {THEME_OPTIONS.map((option) => {
              const isSelected = theme === option.value
              const themeIcons: Record<string, React.ReactNode> = {
                light: <LuSun size={13} />,
                dark: <LuMoon size={13} />,
                system: <LuMonitor size={13} />,
              }
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleThemeChange(option.value)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold border cursor-pointer select-none transition-all active:scale-[0.96]",
                    isSelected
                      ? "bg-brand-selected-bg text-brand-base border-brand-base/40 shadow-sm shadow-brand-glow/5"
                      : "bg-mg-fill-0/30 text-mg-text-3 border-mg-border/50 hover:bg-mg-fill-0/50 hover:text-mg-text-1 hover:translate-y-[-1px]"
                  )}
                >
                  {themeIcons[option.value]}
                  <span>{t(option.titleKey)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 显示时区（Time Zone） */}
        <div className="py-5 border-b border-mg-border/40 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="max-w-xs">
            <div className="text-[14px] font-bold text-mg-text-1">
              {t('account.preferences.timeZoneTitle')}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-mg-text-3">
              {t('account.preferences.timeZoneDesc', { timezone: browserTimeZone })}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 w-full md:max-w-xs shrink-0">
            <Select
              value={timeZone}
              onChange={(value) => setTimeZone(value as TimeZonePreference)}
              disabled={saveMutation.isPending}
              className="w-full bg-mg-fill-0/30 font-medium"
            >
              <Select.Option value={BROWSER_TIME_ZONE}>
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span className="text-[13px] font-bold text-mg-text-1">
                    {t('account.preferences.timeZoneBrowser')}
                  </span>
                  <span className="text-xs text-mg-text-3 leading-none">
                    {t('account.preferences.timeZoneBrowserDesc', { timezone: formatTimeZoneTitle(browserTimeZone, locale) })}
                  </span>
                </div>
              </Select.Option>
              {concreteTimeZones.map((item) => (
                <Select.Option key={item} value={item}>
                  <div className="flex flex-col gap-0.5 py-0.5">
                    <span className="text-[13px] font-bold text-mg-text-1">
                      {formatTimeZoneTitle(item, locale)}
                    </span>
                    <span className="text-xs text-mg-text-3 leading-none">
                      {t('account.preferences.timeZoneFixedDesc')}
                    </span>
                  </div>
                </Select.Option>
              ))}
            </Select>

            {/* 高端时间预览小面板：磨砂质感和科技绿点 */}
            <div className="rounded-md border border-mg-border/40 bg-mg-fill-0/40 px-3.5 py-2.5 flex items-center justify-between text-xs select-none">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0 animate-pulse" />
                <span className="text-mg-text-3 uppercase text-xs font-bold tracking-wider truncate" title={resolvedTimeZone}>
                  {resolvedTimeZone.split('/').pop()?.replace(/_/g, ' ') || 'Local'}
                </span>
              </div>
              <div className="font-mono text-brand-base font-bold tabular-nums tracking-wide">
                {previewTime.split(' ').pop()}
              </div>
            </div>
          </div>
        </div>

        {/* 低余额提醒（Low Balance Alerts） */}
        <div className="py-5 flex items-center justify-between gap-5">
          <div className="max-w-xs">
            <div className="text-[14px] font-bold text-mg-text-1">
              {t('account.preferences.lowBalanceTitle')}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-mg-text-3">
              {t('account.preferences.lowBalanceDesc')}
            </div>
          </div>
          <Switch
            checked={lowBalanceAlertsEnabled}
            disabled={saveMutation.isPending}
            onCheckedChange={setLowBalanceAlertsEnabled}
          />
        </div>

      </div>

      <div className="pt-3">
        <Button
          variant="brand"
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="rounded-md px-6 h-10 font-bold active:scale-[0.97] transition-all"
        >
          {t('account.preferences.save')}
        </Button>
      </div>
    </div>
  )
}
