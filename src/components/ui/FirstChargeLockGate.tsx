import React from 'react'
import { LuLock } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { useRechargeStore } from '@/store/use-recharge-store'
import { cn } from '@/lib/utils'

interface FirstChargeLockGateProps {
  /** 是否处于锁定态（未首充时为 true） */
  locked: boolean
  /** 锁定态标题 */
  title?: string
  /** 锁定态描述 */
  desc?: string
  /** 去充值按钮文案 */
  cta?: string
  /** 占位高度样式（默认使用 --mg-empty-min-h） */
  className?: string
  children?: React.ReactNode
}

/**
 * 首充门槛锁定态组件。
 * locked=false 时透传 children；
 * locked=true 时渲染锁定态 UI，并引导用户去充值。
 */
export const FirstChargeLockGate: React.FC<FirstChargeLockGateProps> = ({
  locked,
  title,
  desc,
  cta,
  className,
  children,
}) => {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('common.firstChargeLock.title')
  const resolvedDesc = desc ?? t('common.firstChargeLock.desc')
  const resolvedCta = cta ?? t('common.firstChargeLock.cta')
  const openRecharge = useRechargeStore((s) => s.open)

  if (!locked) return <>{children}</>

  return (
    <div className={cn('relative rounded-lg border border-mg-border bg-card-bg overflow-hidden', className)}>
      {/* 模糊背景内容 */}
      {children && (
        <div className="pointer-events-none select-none blur-[6px] opacity-30 saturate-50">
          {children}
        </div>
      )}

      {/* 锁定态覆盖层 */}
      <div className={cn(
        'flex flex-col items-center justify-center gap-4 text-center min-h-[var(--mg-empty-min-h)] mg-panel-roomy',
        children ? 'absolute inset-0 bg-mg-bg-0/70 backdrop-blur-sm' : ''
      )}>
        <div
          className="w-[var(--mg-control-h-xl)] h-[var(--mg-control-h-xl)] rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--brand-glow)', color: 'var(--brand-base)' }}
        >
          <LuLock size={20} />
        </div>
        <div className="space-y-1.5 max-w-[280px]">
          <p className="font-bold text-mg-text-1 mg-text-body">{resolvedTitle}</p>
          <p className="mg-text-caption text-mg-text-3">{resolvedDesc}</p>
        </div>
        <Button variant="brand" size="sm" onClick={openRecharge}>
          {resolvedCta}
        </Button>
      </div>
    </div>
  )
}
