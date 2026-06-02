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
    setLanguage(preferencesQuery.data.ui.language)
    setLowBalanceAlertsEnabled(preferencesQuery.data.notifications.low_balance_alerts_enabled)
  }, [preferencesQuery.data])

  useEffect(() => {
    if (!account) return
    setTheme(getUserTheme(account.account_id))
    setTimeZone(getUserTimeZone(account.account_id))
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
        ui: { language },
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
      <div className="flex items-center gap-2 py-8 text-sm text-mg-text-1">
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
    <div className="flex max-w-[560px] flex-col gap-5 pt-2">
      <div className="rounded-xl border border-mg-border bg-mg-bg-1 p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold text-mg-text-0">
            {t('account.preferences.languageTitle')}
          </div>
          <div className="mt-1 text-xs leading-5 text-mg-text-2">
            {t('account.preferences.languageDesc')}
          </div>
        </div>

        <Select
          value={language}
          onChange={(value) => setLanguage(value as PreferenceLanguage)}
          disabled={saveMutation.isPending}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <Select.Option key={option.value} value={option.value}>
              <div className="flex flex-col gap-1 py-0.5">
                <span className="text-sm font-semibold text-mg-text-0">{t(option.titleKey)}</span>
                <span className="text-xs text-mg-text-2">{t(option.descKey)}</span>
              </div>
            </Select.Option>
          ))}
        </Select>
      </div>

      <div className="rounded-xl border border-mg-border bg-mg-bg-1 p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold text-mg-text-0">
            {t('account.preferences.themeTitle')}
          </div>
          <div className="mt-1 text-xs leading-5 text-mg-text-2">
            {t('account.preferences.themeDesc')}
          </div>
        </div>

        <Select
          value={theme}
          onChange={handleThemeChange}
          disabled={saveMutation.isPending}
        >
          {THEME_OPTIONS.map((option) => (
            <Select.Option key={option.value} value={option.value}>
              <div className="flex flex-col gap-1 py-0.5">
                <span className="text-sm font-semibold text-mg-text-0">{t(option.titleKey)}</span>
                <span className="text-xs text-mg-text-2">{t(option.descKey)}</span>
              </div>
            </Select.Option>
          ))}
        </Select>
      </div>

      <div className="rounded-xl border border-mg-border bg-mg-bg-1 p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold text-mg-text-0">
            {t('account.preferences.timeZoneTitle')}
          </div>
          <div className="mt-1 text-xs leading-5 text-mg-text-2">
            {t('account.preferences.timeZoneDesc', { timezone: browserTimeZone })}
          </div>
        </div>

        <Select
          value={timeZone}
          onChange={(value) => setTimeZone(value as TimeZonePreference)}
          disabled={saveMutation.isPending}
        >
          <Select.Option value={BROWSER_TIME_ZONE}>
            <div className="flex flex-col gap-1 py-0.5">
              <span className="text-sm font-semibold text-mg-text-0">
                {t('account.preferences.timeZoneBrowser')}
              </span>
              <span className="text-xs text-mg-text-2">
                {t('account.preferences.timeZoneBrowserDesc', { timezone: formatTimeZoneTitle(browserTimeZone, locale) })}
              </span>
            </div>
          </Select.Option>
          {concreteTimeZones.map((item) => (
            <Select.Option key={item} value={item}>
              <div className="flex flex-col gap-1 py-0.5">
                <span className="text-sm font-semibold text-mg-text-0">
                  {formatTimeZoneTitle(item, locale)}
                </span>
                <span className="text-xs text-mg-text-2">
                  {t('account.preferences.timeZoneFixedDesc')}
                </span>
              </div>
            </Select.Option>
          ))}
        </Select>
        <div className="mt-3 rounded-lg border border-mg-border/50 bg-mg-fill-0 px-3 py-2 text-xs text-mg-text-2">
          {t('account.preferences.timeZonePreview', { time: previewTime, timezone: resolvedTimeZone })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-5 rounded-xl border border-mg-border bg-mg-bg-1 p-5">
        <div>
          <div className="text-sm font-semibold text-mg-text-0">
            {t('account.preferences.lowBalanceTitle')}
          </div>
          <div className="mt-1 text-xs leading-5 text-mg-text-2">
            {t('account.preferences.lowBalanceDesc')}
          </div>
        </div>
        <Switch
          checked={lowBalanceAlertsEnabled}
          disabled={saveMutation.isPending}
          onCheckedChange={setLowBalanceAlertsEnabled}
        />
      </div>

      <div>
        <Button
          type="primary"
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          style={{ borderRadius: '8px', fontWeight: 700 }}
        >
          {t('account.preferences.save')}
        </Button>
      </div>
    </div>
  )
}
