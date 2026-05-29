import { cn } from "@/lib/utils"

/**
 * 现代高颜值 Skeleton 占位加载骨架组件
 * 职责：提供高度流畅的脉冲呼吸式加载骨架占位
 */

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-mg-fill-1/60 dark:bg-mg-fill-1/30", className)}
      {...props}
    />
  )
}

export { Skeleton }
