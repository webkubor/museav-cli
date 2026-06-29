/**
 * 品牌锁定区（logo + wordmark）—— 全站唯一来源。
 * 按 data-market 渲染：海外 Model(实色)+Go(渐变)，国内 词元(实色)+共生(渐变)，
 * 均带漂浮光晕 logo + 脉冲点。任何头部/页脚/落地页需要"ModelGo 品牌字"时直接复用本组件，
 * 不要再各处内联，避免风格漂移。样式见 src/styles/brand.css（已全局 import）。
 */
import { useLangStore } from '@/store/use-brand-store'
import { useSiteLogo } from '@/config/brand-assets'
import { cn } from '@/lib/utils'

interface BrandProps {
  /** logo 像素尺寸，默认 32 */
  logoSize?: number
  /** wordmark 字号 className，默认 text-base */
  textClassName?: string
  /** 容器额外 className */
  className?: string
}

export function Brand({ logoSize = 32, textClassName = 'text-base', className }: BrandProps) {
  const market = useLangStore((s) => s.market)
  const siteLogo = useSiteLogo()

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="brand-logo-premium shrink-0" style={{ width: logoSize, height: logoSize }}>
        <img src={siteLogo} alt="ModelGo" className="block w-auto object-contain" style={{ height: logoSize }} />
      </span>
      {market === 'global' ? (
        <span className={cn('brand-wordmark brand-wordmark-global', textClassName)}>
          <span className="brand-wordmark-global-base">Model</span>
          <span className="brand-wordmark-global-go">Go</span>
          <span className="brand-wordmark-pulse" aria-hidden />
        </span>
      ) : (
        <span className={cn('brand-wordmark brand-wordmark-domestic', textClassName)}>
          <span className="brand-wordmark-domestic-base">词元</span>
          <span className="brand-wordmark-domestic-accent">共生</span>
          <span className="brand-wordmark-pulse" aria-hidden />
        </span>
      )}
    </div>
  )
}
