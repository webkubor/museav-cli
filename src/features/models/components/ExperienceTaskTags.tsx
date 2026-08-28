/**
 * 「可体验任务」标签组（shared/modelgo_prd#872 需求点 10，原型 MarketplaceTaskTags）。
 * 卡片与详情规格条共用：有任务时逐个渲染独立小标签（去重后按任务顺序），
 * 无任务时渲染「暂未开放」纯文本（AC-13 口径不变）。
 *
 * 两种折叠口径，超出部分都收成「+N」，悬停/聚焦冒气泡列出其余：
 *   - `fit`：按容器**实际宽度**算一行能放几个（卡片用这个）
 *   - `max`：写死条数（保留给按条数控制的场景；详情页宽度富余，两个都不传即不折叠）
 *
 * 为什么卡片不能写死条数（2026-08-27）：同一份词表中英宽度差近一倍
 * （「文生视频」58px vs「Text-to-video」88px），而任务列宽随网格列数在 121~209px
 * 之间跳。155px 列宽下英文只放得下 1 个、中文放得下 2 个；121px 时中文两连(131px)
 * 也放不下，209px 时英文两连(194px)反而放得下 —— 任何固定值都会在某个
 * 语言×断点组合下翻车。原先卡片传 max={3} 且恰好 3 个任务时不折叠，视频模型的
 * 三连长标签就各占一行，把等高卡片的贴底规格区撑高三行（线上 Doubao-Seedance-2.0）。
 *
 * 气泡走 portal 挂 body，与 OverflowTip 同一套 token 与理由 —— 规格值嵌在
 * .mg-tile 卡片里，卡片有 overflow 剪裁 + hover transform（transform 会劫持
 * fixed 的包含块），absolute/fixed 内联都会被剪。
 * 样式 .mg-task-tags 在 catalog-grid-card.css（两处规格条都会引到 catalog.css 聚合）。
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { experienceTaskLabel, type ExperienceTaskType } from '@/pages/models/model-experience-data'
import { fitCount, tagWidthMeasurer } from './experience-task-fit'

export function ExperienceTaskTags({
  tasks,
  max,
  fit,
}: {
  tasks: ExperienceTaskType[]
  max?: number
  /** 按容器实际宽度折叠到一行（卡片口径）。量不到宽度时（jsdom / 容器 0 宽）不折叠。 */
  fit?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLSpanElement>(null)
  const [fitted, setFitted] = useState<number | null>(null)
  const labels = [...new Set(tasks.map(experienceTaskLabel))]
  const key = labels.join('|')

  // useLayoutEffect 而非 useEffect：在浏览器绘制前就把条数改对，否则首帧会闪一下
  // 「三个标签堆三行」再收起来。
  useLayoutEffect(() => {
    if (!fit) return
    const el = ref.current
    const sample = el?.querySelector('em')
    if (!el || !sample) return
    const width = tagWidthMeasurer(sample)
    const recompute = () => {
      const avail = el.clientWidth
      // 0 宽 = 还没布局（或 jsdom），此时别算，保持全量展示
      if (avail > 0) setFitted(fitCount(key.split('|'), avail, width))
    }
    recompute()
    // 字体晚加载会改变文本宽度，而容器宽没变、ResizeObserver 不会触发
    void document.fonts?.ready?.then(recompute)
    // 列宽随断点变（121~209px），不重算会在窄档溢出、宽档白留空。
    // 守卫不是防浏览器缺这个 API，是防**没有它的运行环境**（jsdom 就没有）——
    // 少了它顶多不跟随宽度变化，抛出来会把整张卡片打挂。
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit, key])

  if (labels.length === 0) {
    return <span className="mg-metric-value">{t('modelsCatalog.button.comingSoon')}</span>
  }

  // 只在真的超出时折叠：等于 max 时全量展示（折叠成 max-1 + 「+1」反而多占一个位）
  const limit = fit ? fitted : max
  const folded = limit != null && labels.length > limit
  const visible = folded ? labels.slice(0, limit) : labels
  const hidden = folded ? labels.slice(limit) : []
  return (
    <span className={fit ? 'mg-task-tags is-fit' : 'mg-task-tags'} ref={ref}>
      {visible.map((label) => <em key={label}>{label}</em>)}
      {hidden.length > 0 && <TaskOverflowChip hidden={hidden} />}
    </span>
  )
}

/** 「+N」计数标签：悬停/键盘聚焦冒气泡列出被折叠的任务。 */
function TaskOverflowChip({ hidden }: { hidden: string[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const text = hidden.join(t('modelsExperience.listSeparator'))

  const show = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 6 })
  }

  return (
    <span
      ref={ref}
      role="img"
      tabIndex={0}
      aria-label={text}
      className="mg-task-tags-more"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      +{hidden.length}
      {pos && createPortal(
        <span
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
          className="pointer-events-none fixed z-[var(--mg-z-tooltip)] w-max max-w-[300px] -translate-x-1/2 -translate-y-full whitespace-normal rounded-[var(--mg-tooltip-radius)] border border-mg-border bg-mg-bg-3 px-[var(--mg-tooltip-pad-x)] py-[var(--mg-tooltip-pad-y)] text-left mg-text-caption font-medium leading-snug text-mg-text-2 shadow-lg"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
