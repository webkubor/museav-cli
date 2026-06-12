import { useMemo } from 'react'

import { buildCode128B } from '@/lib/code128'
import { cn } from '@/lib/utils'

interface OrderBarcodeProps {
  value: string
  compact?: boolean
  className?: string
}

export function OrderBarcode({ value, compact = false, className }: OrderBarcodeProps) {
  const barcode = useMemo(() => {
    try {
      return buildCode128B(value)
    } catch {
      return null
    }
  }, [value])

  const orderNo = value.trim()
  const height = compact ? 42 : 52

  return (
    <div
      className={cn('flex flex-col items-center gap-1 pt-1', className)}
      data-testid="order-barcode"
      data-barcode-value={barcode?.value ?? orderNo}
    >
      {barcode ? (
        <svg
          role="img"
          aria-label={`Order number barcode ${barcode.value}`}
          viewBox={`0 0 ${barcode.width} ${height}`}
          preserveAspectRatio="none"
          className={cn(
            'w-full rounded-md border border-mg-border bg-white px-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9)]',
            compact ? 'h-10 max-w-[190px]' : 'h-12 max-w-[240px]'
          )}
        >
          <rect x="0" y="0" width={barcode.width} height={height} fill="#fff" />
          {barcode.bars.map((bar, index) => (
            <rect
              key={`${bar.x}-${bar.width}-${index}`}
              x={bar.x}
              y="5"
              width={bar.width}
              height={height - 10}
              fill="#111827"
              shapeRendering="crispEdges"
            />
          ))}
        </svg>
      ) : (
        <div
          role="img"
          aria-label={`Order number ${orderNo}`}
          className={cn(
            'flex w-full items-center justify-center rounded-md border border-mg-border bg-white px-2 font-mono text-[10px] font-bold text-[#111827]',
            compact ? 'h-10 max-w-[190px]' : 'h-12 max-w-[240px]'
          )}
        >
          {orderNo}
        </div>
      )}
      <span className="max-w-full select-all truncate text-center font-mono text-[8px] font-semibold tracking-widest text-mg-text-3">
        {barcode?.value ?? orderNo}
      </span>
    </div>
  )
}
