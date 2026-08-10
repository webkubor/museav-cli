import * as React from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export interface ProgressBarMilestone {
  value: number
  label: string
  subLabel?: string
}

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  min?: number
  variant?: "brand" | "rainbow" | "emerald" | "amber" | "blue"
  size?: "xs" | "sm" | "md" | "lg"
  showGlow?: boolean
  /** 填充条上叠一层流光扫过（"流动感"），复用全局 shimmer-slide keyframe */
  flow?: boolean
  showLabel?: boolean
  labelPosition?: "top" | "bottom" | "right" | "none"
  formatLabel?: (val: number, max: number) => React.ReactNode
  milestones?: ProgressBarMilestone[]
  milestoneLayout?: "top" | "bottom"
}

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      className,
      value,
      max = 100,
      min = 0,
      variant = "brand",
      size = "md",
      showGlow = true,
      flow = false,
      showLabel = false,
      labelPosition = "none",
      formatLabel,
      milestones,
      milestoneLayout = "bottom",
      ...props
    },
    ref
  ) => {
    const { t } = useTranslation()
    // 限制范围在 [min, max]
    const clampedValue = Math.max(min, Math.min(max, value))
    const totalRange = max - min
    const percentage = totalRange > 0 ? (clampedValue - min) / totalRange : 0
    const percentString = `${(percentage * 100).toFixed(1)}%`

    // 大小变体
    const sizeClasses = {
      xs: "h-1",
      sm: "h-2",
      md: "h-3",
      lg: "h-4.5",
    }

    // 填充渐变色和发光配置
    const variantStyles = {
      brand: {
        bar: "bg-gradient-to-r from-[var(--brand-base)] to-[var(--brand-mid)]",
        glow: "shadow-[0_0_12px_var(--brand-glow)]",
        text: "text-[var(--brand-base)]",
        badge: "bg-[var(--brand-base)]/10 text-[var(--brand-base)] border-[var(--brand-base)]/20"
      },
      rainbow: {
        bar: "bg-gradient-to-r from-[#4285f4] via-[#9b72cb] via-[#d96570] to-[#f4af42]",
        glow: "shadow-[0_0_15px_rgba(155,114,203,0.6)]",
        text: "text-[var(--brand-base)]",
        badge: "bg-[var(--brand-base)]/10 text-[var(--brand-base)] border-[var(--brand-base)]/20"
      },
      emerald: {
        bar: "bg-gradient-to-r from-emerald-500 to-teal-400",
        glow: "shadow-[0_0_12px_rgba(16,185,129,0.6)]",
        text: "text-mg-success",
        badge: "bg-mg-success/10 text-mg-success border-mg-success/20"
      },
      amber: {
        bar: "bg-gradient-to-r from-amber-500 to-orange-400",
        glow: "shadow-[0_0_12px_rgba(245,158,11,0.6)]",
        text: "text-mg-warning",
        badge: "bg-mg-warning/10 text-mg-warning border-mg-warning/20"
      },
      blue: {
        bar: "bg-gradient-to-r from-blue-500 to-indigo-400",
        glow: "shadow-[0_0_12px_rgba(59,130,246,0.6)]",
        text: "text-blue-500",
        badge: "bg-blue-500/10 text-blue-500 border-blue-500/20"
      },
    }

    const currentStyle = variantStyles[variant]

    // 默认的进度标签格式化
    const renderDefaultLabel = () => {
      if (formatLabel) return formatLabel(clampedValue, max)
      return `${clampedValue} / ${max}`
    }

    return (
      <div
        ref={ref}
        className={cn("w-full flex flex-col gap-2.5 select-none", className)}
        {...props}
      >
        {/* 上方标签 */}
        {showLabel && labelPosition === "top" && (
          <div className="flex justify-between items-center mg-text-caption font-semibold">
            <span className="text-[var(--mg-text-3)]">{t('common.progress.current')}</span>
            <span className={cn("font-mono", currentStyle.text)}>
              {renderDefaultLabel()} ({percentString})
            </span>
          </div>
        )}

        {/* 档位里程碑在上方 */}
        {milestones && milestones.length > 0 && milestoneLayout === "top" && (
          <div className="relative w-full h-[var(--mg-progress-milestone-h)] mb-1">
            {milestones.map((ms, idx) => {
              const msPercent = totalRange > 0 ? (ms.value - min) / totalRange : 0
              const isReached = clampedValue >= ms.value
              return (
                <div
                  key={idx}
                  className="absolute transform -translate-x-1/2 flex flex-col items-center text-center transition-all duration-300"
                  style={{ left: `${msPercent * 100}%` }}
                >
                  <span
                    className={cn(
                      "mg-compact-badge tracking-tight block whitespace-nowrap",
                      isReached ? currentStyle.text : "text-[var(--mg-text-3)]"
                    )}
                  >
                    {ms.label}
                  </span>
                  {ms.subLabel && (
                    <span className="mg-text-caption text-[var(--mg-text-3)] scale-90 whitespace-nowrap block mt-0.5 font-medium">
                      {ms.subLabel}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 主进度条轨道容器 */}
        <div className="relative flex items-center w-full">
          {/* 进度条轨道 */}
          <div
            className={cn(
              "w-full rounded-full bg-[var(--mg-fill-0)] border border-[var(--mg-border)]/40 overflow-hidden relative shadow-inner",
              sizeClasses[size]
            )}
          >
            {/* 填充进度 */}
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out relative",
                currentStyle.bar
              )}
              style={{ width: percentString }}
            >
              {/* 流光扫过（"流动感"）：复用全局 shimmer-slide keyframe，只叠在已填充部分 */}
              {flow && percentage > 0 && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    backgroundImage:
                      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer-slide 2s ease-in-out infinite',
                  }}
                />
              )}
              {/* 进度条前端的高光指示器 (Glow Thumb) */}
              {showGlow && percentage > 0 && percentage < 1 && (
                <div
                  className={cn(
                    "absolute right-0 top-0 bottom-0 w-1.5 rounded-full bg-white opacity-95",
                    currentStyle.glow
                  )}
                />
              )}
            </div>
          </div>

          {/* 进度条上的断点指示圈 */}
          {milestones && milestones.length > 0 && (
            <div className="absolute inset-0 pointer-events-none flex items-center">
              {milestones.map((ms, idx) => {
                const msPercent = totalRange > 0 ? (ms.value - min) / totalRange : 0
                const isReached = clampedValue >= ms.value
                return (
                  <div
                    key={idx}
                    className="absolute transform -translate-x-1/2 flex items-center justify-center"
                    style={{ left: `${msPercent * 100}%` }}
                  >
                    <div
                      className={cn(
                        "rounded-full border transition-all duration-300",
                        size === "xs" || size === "sm" ? "w-2 h-2 border-[1.5px]" : "w-3.5 h-3.5 border-2",
                        isReached
                          ? cn("bg-white border-none shadow-md", currentStyle.glow)
                          : "bg-[var(--mg-bg-0)] border-[var(--mg-border)]"
                      )}
                    >
                      {/* 内芯点，已达成时发光，未达成时显示弱灰色 */}
                      <div
                        className={cn(
                          "rounded-full w-full h-full scale-[0.45] transition-all duration-300",
                          isReached
                            ? currentStyle.bar
                            : "bg-[var(--mg-text-3)]/30"
                        )}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 右侧标签 */}
          {showLabel && labelPosition === "right" && (
            <div
              className={cn(
                "ml-3 shrink-0 mg-text-code font-bold tracking-tight px-[var(--mg-control-px-xs)] py-0.5 rounded-md border",
                currentStyle.badge
              )}
            >
              {renderDefaultLabel()}
            </div>
          )}
        </div>

        {/* 档位里程碑在下方 */}
        {milestones && milestones.length > 0 && milestoneLayout === "bottom" && (
          <div className="relative w-full h-[var(--mg-progress-milestone-h)] mt-1">
            {milestones.map((ms, idx) => {
              const msPercent = totalRange > 0 ? (ms.value - min) / totalRange : 0
              const isReached = clampedValue >= ms.value
              return (
                <div
                  key={idx}
                  className="absolute transform -translate-x-1/2 flex flex-col items-center text-center transition-all duration-300"
                  style={{ left: `${msPercent * 100}%` }}
                >
                  <span
                    className={cn(
                      "mg-compact-badge tracking-tight block whitespace-nowrap",
                      isReached ? currentStyle.text : "text-[var(--mg-text-3)]"
                    )}
                  >
                    {ms.label}
                  </span>
                  {ms.subLabel && (
                    <span className="mg-text-caption text-[var(--mg-text-3)] scale-90 whitespace-nowrap block mt-0.5 font-medium">
                      {ms.subLabel}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 下方标签 */}
        {showLabel && labelPosition === "bottom" && (
          <div className="flex justify-between items-center mg-text-caption font-semibold mt-0.5">
            <span className="text-[var(--mg-text-3)]">{t('common.progress.usage')}</span>
            <span className={cn("font-mono", currentStyle.text)}>
              {renderDefaultLabel()} ({percentString})
            </span>
          </div>
        )}
      </div>
    )
  }
)

ProgressBar.displayName = "ProgressBar"
