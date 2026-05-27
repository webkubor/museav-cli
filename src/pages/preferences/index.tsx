import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Select, Toast } from '@douyinfe/semi-ui'
import { IconSun, IconMoon } from '@douyinfe/semi-icons'
import { getPreferences, updatePreferences } from '@/services/preferences'
import { applyTheme, getUserTheme, saveTheme, type Theme } from '@/lib/theme'
import { useAuthStore } from '@/store/auth'

const TIMEZONES = [
  { value: 'Asia/Shanghai', label: 'UTC+8 上海' },
  { value: 'Asia/Hong_Kong', label: 'UTC+8 香港' },
  { value: 'Asia/Singapore', label: 'UTC+8 新加坡' },
  { value: 'Asia/Tokyo', label: 'UTC+9 东京' },
  { value: 'Asia/Seoul', label: 'UTC+9 首尔' },
  { value: 'Europe/London', label: 'UTC+0 伦敦' },
  { value: 'Europe/Paris', label: 'UTC+1 巴黎' },
  { value: 'Europe/Berlin', label: 'UTC+1 柏林' },
  { value: 'America/New_York', label: 'UTC-5 纽约' },
  { value: 'America/Chicago', label: 'UTC-6 芝加哥' },
  { value: 'America/Los_Angeles', label: 'UTC-8 洛杉矶' },
  { value: 'UTC', label: 'UTC' },
]

const cardStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '20px',
  backgroundColor: '#f8fafc',
  marginBottom: '16px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: '#0f172a',
  marginBottom: '4px',
}

const hintStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  marginBottom: '14px',
}

export default function PreferencesPage() {
  const qc = useQueryClient()
  const { account } = useAuthStore()
  const [currentTheme, setCurrentTheme] = useState<Theme>('light')

  useEffect(() => {
    const t = account ? getUserTheme(account.account_id) : 'light'
    setCurrentTheme(t)
  }, [account])

  const prefsQuery = useQuery({
    queryKey: ['account', 'preferences'],
    queryFn: getPreferences,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const update = useMutation({
    mutationFn: updatePreferences,
    onSuccess: () => {
      Toast.success('偏好已保存')
      qc.invalidateQueries({ queryKey: ['account', 'preferences'] })
    },
    onError: () => Toast.error('保存失败，请重试'),
  })

  const prefs = prefsQuery.data

  function handleTheme(theme: Theme) {
    setCurrentTheme(theme)
    saveTheme(theme, account?.account_id)
    applyTheme(theme)
    Toast.success(`主题已切换`)
  }

  const themeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: '浅色', icon: <IconSun /> },
    { value: 'dark', label: '深色', icon: <IconMoon /> },
    { value: 'system', label: '跟随系统', icon: <span style={{ fontSize: '13px' }}>💻</span> },
  ]

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', marginBottom: '24px' }}>
        偏好设置
      </h2>

      <div style={{ maxWidth: '520px' }}>
        {/* 主题 */}
        <div style={cardStyle}>
          <p style={labelStyle}>主题</p>
          <p style={hintStyle}>选择界面显示模式</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {themeOptions.map((opt) => (
              <Button
                key={opt.value}
                icon={opt.icon}
                theme={currentTheme === opt.value ? 'solid' : 'light'}
                type={currentTheme === opt.value ? 'primary' : 'tertiary'}
                onClick={() => handleTheme(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 语言 */}
        <div style={cardStyle}>
          <p style={labelStyle}>界面语言</p>
          <p style={hintStyle}>选择控制台显示语言</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['zh', 'en'] as const).map((lang) => (
              <Button
                key={lang}
                theme={prefs?.ui.language === lang ? 'solid' : 'light'}
                type={prefs?.ui.language === lang ? 'primary' : 'tertiary'}
                disabled={update.isPending || !prefs}
                onClick={() => update.mutate({ ui: { language: lang } })}
              >
                {lang === 'zh' ? '中文' : 'English'}
              </Button>
            ))}
          </div>
        </div>

        {/* 时区 */}
        <div style={cardStyle}>
          <p style={labelStyle}>时区</p>
          <p style={hintStyle}>用于日志和账单时间展示</p>
          <Select
            value={prefs?.ui.timezone ?? 'Asia/Shanghai'}
            onChange={(val) => update.mutate({ ui: { timezone: val as string } })}
            disabled={!prefs || update.isPending}
            style={{ width: '240px' }}
          >
            {TIMEZONES.map((tz) => (
              <Select.Option key={tz.value} value={tz.value}>
                {tz.label}
              </Select.Option>
            ))}
          </Select>
        </div>

        {/* 低余额提醒 */}
        <div style={cardStyle}>
          <p style={labelStyle}>低余额提醒</p>
          <p style={hintStyle}>余额不足时通过邮件通知</p>
          <Button
            theme={prefs?.notifications.low_balance_alerts_enabled ? 'solid' : 'light'}
            type={prefs?.notifications.low_balance_alerts_enabled ? 'primary' : 'tertiary'}
            disabled={!prefs || update.isPending}
            onClick={() =>
              update.mutate({
                notifications: {
                  low_balance_alerts_enabled: !prefs?.notifications.low_balance_alerts_enabled,
                },
              })
            }
          >
            {prefs?.notifications.low_balance_alerts_enabled ? '已开启' : '已关闭'}
          </Button>
        </div>
      </div>
    </div>
  )
}
