/**
 * 卡片的「API 协议」标签行：单行展示，最多两个，超出收成「+N」（悬停/聚焦列出其余）。
 *
 * 为什么要折叠（2026-08-27 实测）：协议是闭集 39 项、一个模型常挂 3~4 个，标签又是
 * 全称（OpenAI Chat Completions 148px、Anthropic Messages 120px），而卡片里这一行
 * 实测只有 268~440px。线上 35 张卡有 32 张是 2~3 行 —— 三连常见组合合计 390px，
 * 在 322px 的容器里必然折行，把卡片的信息节奏撑散（可体验任务行刚治过同一个病）。
 *
 * 上限 2 是需求方口径，但不能只按条数：卡片宽随断点在 268~440px 之间跳，
 * 268px 档连「两个 + 「+1」」都放不下。所以宽度与上限取更严的那个，由
 * fitCount(cap) 一次算完（「+N」的宽度必须进账，否则临界宽度仍溢出）。
 *
 * 被折叠的协议点不到（可见标签点击=反查筛选），这是折叠的固有代价：完整清单在
 * 详情页协议区与侧栏筛选里，气泡也会念出名字，卡片这一行的定位是速览。
 *
 * 宽度折叠与「+N」气泡的公共实现在 features/models/components/tag-fit.ts +
 * TagOverflowChip.tsx（与可体验任务共用同一套）。样式在 catalog-grid-card.css。
 */
import { useTranslation } from 'react-i18next'
import { TagOverflowChip } from '@/features/models/components/TagOverflowChip'
import { splitByFit, useTagFit } from '@/features/models/components/tag-fit'
import { protocolLabel, sortProtocols } from '@/features/models/model-format'

/** 需求方口径：这一行最多露两个，其余进「+N」 */
const PROTOCOL_CAP = 2
/** 与 .mg-mcard-protocols 的 gap 对齐的兜底值（真值从容器 column-gap 读） */
const PROTOCOL_GAP = 5

export function CardProtocolTags({
  protocols,
  isZh,
  labelMap,
  onPick,
}: {
  protocols: readonly string[]
  isZh: boolean
  labelMap?: Record<string, string>
  onPick?: (protocol: string) => void
}) {
  const { t } = useTranslation()
  const sorted = sortProtocols(protocols)
  const labels = sorted.map((p) => protocolLabel(p, isZh, labelMap))
  const { ref, fitted } = useTagFit<HTMLDivElement>(labels, { gap: PROTOCOL_GAP, cap: PROTOCOL_CAP })
  if (sorted.length === 0) return null

  // 折叠按标签算（宽度是标签的），点击要回传的是 code，按同一个下标取回
  const { visible, hidden } = splitByFit(labels, fitted)
  return (
    <div
      ref={ref}
      className="mg-mcard-protocols is-fit"
      aria-label={t('modelsCatalog.sidebar.apiProtocolAria')}
    >
      {visible.map((label, i) => (
        <button
          key={sorted[i]}
          type="button"
          className={`mg-proto is-${sorted[i]}`}
          title={t('modelsCatalog.sidebar.filterTitle', { label })}
          onClick={(e) => { e.stopPropagation(); onPick?.(sorted[i]) }}
          disabled={!onPick}
        >
          {label}
        </button>
      ))}
      {hidden.length > 0 && <TagOverflowChip hidden={hidden} className="mg-proto mg-proto-more" />}
    </div>
  )
}
