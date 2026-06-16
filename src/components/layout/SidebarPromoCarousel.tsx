/**
 * 侧边栏底部「免费模型」推荐小卡轮播
 * - 动态：从模型目录拉取免费模型，每个免费模型一张卡（不再写死）
 * - 自动轮播（悬停暂停）、圆点指示、点击进 Playground 免费体验该模型
 * - 侧边栏折叠 / 无免费模型时不渲染
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LuArrowRight } from 'react-icons/lu'
import { listModels } from '@/services/catalog'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import type { CatalogModelItem } from '@/types'

const ROTATE_MS = 5000
const MAX_CARDS = 8

/** 免费模型：标签含 free，或输入/输出最低价均为 0。 */
function isFreeModel(m: CatalogModelItem): boolean {
  const tags = (m.tags ?? []).map((t) => t.toLowerCase())
  if (tags.includes('free')) return true
  const inp = Number.parseFloat(m.pricing?.input_per_1m ?? '')
  const out = Number.parseFloat(m.pricing?.output_per_1m ?? '')
  return (!Number.isFinite(inp) || inp <= 0) && (!Number.isFinite(out) || out <= 0)
}

export function SidebarPromoCarousel({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data } = useQuery({
    queryKey: ['sidebar-free-models'],
    queryFn: () => listModels({ page_size: 100 }),
    enabled: !collapsed,
    staleTime: 10 * 60_000,
  })

  const freeModels = useMemo(
    () => (data?.items ?? []).filter(isFreeModel).slice(0, MAX_CARDS),
    [data?.items],
  )
  const count = freeModels.length

  useEffect(() => {
    if (collapsed || paused || count <= 1) return
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [collapsed, paused, count])

  if (collapsed || count === 0) return null

  // 渲染期 clamp，避免 count 变化后 index 越界（不在 effect 里 setState）
  const activeIndex = Math.min(index, count - 1)
  const model = freeModels[activeIndex]
  const goExperience = () =>
    navigate('/models/playground', { state: { selectedModelId: model.model_id } })

  return (
    <div className="px-3 pb-2.5">
      <button
        type="button"
        onClick={goExperience}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        title={`免费体验 ${model.display_name}`}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-left shadow-md transition-transform duration-200 hover:-translate-y-0.5 cursor-pointer"
        style={{ background: 'linear-gradient(135deg, var(--brand-base), var(--brand-deep))' }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <ModelIcon
            model={{ display_name: model.display_name, vendor: model.provider || model.vendor }}
            size={24}
            rounded="rounded-lg"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="inline-flex w-fit items-center rounded-full bg-white/22 px-1.5 text-[9px] font-extrabold leading-[15px] text-white">
            限时免费
          </span>
          <span className="truncate text-[13px] font-bold leading-tight text-white" title={model.display_name}>
            {model.display_name}
          </span>
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-200 group-hover:translate-x-0.5">
          <LuArrowRight size={13} />
        </span>
      </button>

      {count > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {freeModels.map((m, i) => (
            <button
              key={m.id}
              type="button"
              aria-label={`切换到 ${m.display_name}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'w-4 bg-brand-base' : 'w-1.5 bg-mg-border hover:bg-mg-text-3'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
