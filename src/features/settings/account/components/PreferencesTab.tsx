import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { getPreferences, updatePreferences } from '@/services/preferences'
import { appToast } from '@/lib/app-toast'
import { useLangStore } from '@/store/use-brand-store'
import { useAuthStore } from '@/store/auth'
import { useMarket } from '@/hooks/useMarket'
import { applyTheme, getSavedTheme, getUserTheme, saveTheme, type Theme } from '@/lib/theme'
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

const THEME_ICONS: Record<Theme, ReactNode> = {
  light: <LuSun size={13} />,
  dark: <LuMoon size={13} />,
  system: <LuMonitor size={13} />,
}

function toI18nLang(language: PreferenceLanguage): Lang {
  return LANGUAGE_OPTIONS.find((item) => item.value === language)?.i18nLang ?? 'zh'
}

/**
 * 界面语言的唯一真源是 i18n 当前语言（由 getInitialLang 决定：本地显式偏好 > 域名市场默认）。
 * 选择器必须回显它，不能回显后端 preferences.ui.language——后端该字段恒返回 zh-CN，
 * 无法区分「用户选了中文」与「没设过的默认值」，国际站会出现「英文界面高亮简体中文」
 * （shared/modelgo_prd#370）。后端补上「未设置」语义后才能作为跨设备真源接回来，见 qa#589。
 */
function toPreferenceLanguage(i18nLang: string): PreferenceLanguage {
  return i18nLang.startsWith('zh') ? 'zh-CN' : 'en-US'
}

function formatTimeZoneTitle(timeZone: string, locale: string): string {
  return `${timeZone} (${formatTimeZoneOffset(timeZone, locale)})`
}

export function PreferencesTab() {
  const { t, i18n: i18nInstance } = useTranslation()
  const queryClient = useQueryClient()
  const setGlobalLang = useLangStore((state) => state.setLang)
  const account = useAuthStore((state) => state.account)
  // 国外(global)控制台不给主题选择，写死深色，界面里不展示这个配置项（lib/theme.ts 同步锁定渲染结果）
  const market = useMarket()
  const themeSelectable = market !== 'global'
  // 不用 state 存语言：i18nInstance.language 就是生效值，useTranslation 会在 languageChanged 时重渲染。
  // 多存一份 state 就是多一个会漂移的副本，#370 的根因正是「选择器读副本、界面读真源」。
  const language = toPreferenceLanguage(i18nInstance.language)
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme())
  const [timeZone, setTimeZone] = useState<TimeZonePreference>(() => getSavedTimeZone())
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
    // 刻意不用 preferencesQuery.data.ui.language 回填选择器，理由见 toPreferenceLanguage 注释（qa#589）。
    // 显示时区：后端 ui.timezone（#409）为真源；缺省时回退 localStorage/浏览器。
    // seed 到本地（saveTimeZone）供 format-date 的 resolveTimeZone 全站读取，实现跨设备一致。
    const backendTz = preferencesQuery.data.ui.timezone
    const localTz = account ? getUserTimeZone(account.account_id) : getSavedTimeZone()
    const tz = backendTz && backendTz.length > 0 ? backendTz : localTz
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(['account-preferences'], result)
      // 不拿 result.ui.language 回切界面：语言在点击时已生效，且该字段的「未设置」语义未定（qa#589），
      // 用它回切会在后端返回空串/默认值时把界面刷成非用户选择的语言。
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
      <div className="mg-tile flex flex-col p-6">
        
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

          {/* 语言 Segmented（统一用共享 SegmentedToggle） */}
          <SegmentedToggle
            className="shrink-0 self-start md:self-center"
            ariaLabel={t('account.preferences.languageTitle')}
            value={language}
            onChange={(value) => {
              const lang = toI18nLang(value)
              i18n.changeLanguage(lang)
              setGlobalLang(lang)
            }}
            options={LANGUAGE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.titleKey),
            }))}
          />
        </div>

        {/* 界面主题（Theme）——国外控制台写死深色，不提供选择 */}
        {themeSelectable && (
          <div className="py-5 border-b border-mg-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="max-w-xs">
              <div className="text-[14px] font-bold text-mg-text-1">
                {t('account.preferences.themeTitle')}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-mg-text-3">
                {t('account.preferences.themeDesc')}
              </div>
            </div>

            {/* 主题 Segmented（与语言统一用共享 SegmentedToggle，带图标） */}
            <SegmentedToggle
              className="shrink-0 self-start md:self-center"
              ariaLabel={t('account.preferences.themeTitle')}
              value={theme}
              onChange={(value) => handleThemeChange(value)}
              options={THEME_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.titleKey),
                icon: THEME_ICONS[option.value],
              }))}
            />
          </div>
        )}

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

            {/* 时间预览小面板（内嵌块，用 bg-1 非 fill 凑卡片） */}
            <div className="rounded-md border border-mg-border bg-mg-bg-1 px-3.5 py-2.5 flex items-center justify-between text-xs select-none">
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

      </div>

      <div className="flex justify-end pt-3">
        <Button
          variant="brand"
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="px-6 font-bold"
        >
          {t('account.preferences.save')}
        </Button>
      </div>
    </div>
  )
}
