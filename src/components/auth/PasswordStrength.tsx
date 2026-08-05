import { LuShieldAlert, LuShield, LuShieldCheck } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface Props { password: string }

type Level = 0 | 1 | 2 | 3 | 4

function getLevel(password: string): Level {
  if (!password) return 0
  
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return 1
  if (score === 3 || score === 4) return 2
  if (score === 5) return 3
  return 4
}

const LEVELS = {
  1: {
    labelKey: 'account.auth.passwordStrength.weak',
    activeBars: 1,
    activeClass: 'bg-rose-500 dark:bg-rose-500/90 shadow-[0_0_8px_rgba(244,63,94,0.3)]',
    colorClass: 'text-rose-600 dark:text-rose-400',
    icon: <LuShieldAlert size={12} className="shrink-0" />,
  },
  2: {
    labelKey: 'account.auth.passwordStrength.medium',
    activeBars: 2,
    activeClass: 'bg-amber-500 dark:bg-amber-500/90 shadow-[0_0_8px_rgba(245,158,11,0.3)]',
    colorClass: 'text-amber-600 dark:text-amber-400',
    icon: <LuShield size={12} className="shrink-0" />,
  },
  3: {
    labelKey: 'account.auth.passwordStrength.strong',
    activeBars: 3,
    activeClass: 'bg-emerald-500 dark:bg-emerald-500/90 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    icon: <LuShieldCheck size={12} className="shrink-0" />,
  },
  4: {
    labelKey: 'account.auth.passwordStrength.excellent',
    activeBars: 4,
    activeClass: 'bg-indigo-500 dark:bg-indigo-500/90 shadow-[0_0_8px_rgba(99,102,241,0.4)]',
    colorClass: 'text-indigo-600 dark:text-indigo-400',
    icon: <LuShieldCheck size={12} className="shrink-0 animate-pulse" />,
  },
} as const

export function PasswordStrength({ password }: Props) {
  const { t } = useTranslation('account')
  const level = getLevel(password)
  if (!password || level === 0) return null
  const config = LEVELS[level]

  return (
    <div className="flex flex-col gap-2 mt-2.5 select-none animate-in fade-in slide-in-from-top-1 duration-300">
      {/* 进度条指示器 */}
      <div className="flex items-center gap-1.5 w-full">
        {[1, 2, 3, 4].map((bar) => (
          <div
            key={bar}
            className={cn(
              "h-[4.5px] flex-1 rounded-full transition-all duration-500 ease-out",
              bar <= config.activeBars 
                ? config.activeClass 
                : "bg-slate-200/90 dark:bg-slate-800"
            )}
          />
        ))}
      </div>
      
      {/* 强度文字与盾牌图标 */}
      <div className={cn("flex items-center gap-1 text-xs font-bold mt-0.5 transition-all duration-300", config.colorClass)}>
        {config.icon}
        <span>{t(config.labelKey)}</span>
      </div>
    </div>
  )
}
