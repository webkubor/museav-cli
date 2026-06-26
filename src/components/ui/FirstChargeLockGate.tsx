import React from 'react'
import { LuLock } from 'react-icons/lu'
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
  title = '首次充值后解锁',
  desc = '完成首次充值（任意金额），立即解锁此功能。',
  cta = '去充值',
  className,
  children,
}) => {
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
          <p className="font-bold text-mg-text-0 mg-text-body">{title}</p>
          <p className="mg-text-caption text-mg-text-2">{desc}</p>
        </div>
        <Button variant="brand" size="sm" onClick={openRecharge}>
          {cta}
        </Button>
      </div>
    </div>
  )
}
