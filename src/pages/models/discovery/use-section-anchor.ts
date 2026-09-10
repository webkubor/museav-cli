import { useEffect } from 'react'

import { trackEvent } from '@/lib/track'

/**
 * 模型发现页的区块锚点（qa#726 / TC-DISC-102）。
 *
 * 三件事：滚到某区块时把它的 id 同步进 URL hash、上报一次 `model_discovery_section_view`、
 * 带 hash 进页面时定位过去。
 *
 * 判「当前区块」用的是 rootMargin 把视口压成顶部一条窄带（`-12% 0px -80% 0px`），
 * 谁的顶部先进这条带谁就是当前区块 —— 直接比 intersectionRatio 在这里没用：
 * 完整榜单比视口高，永远只露一部分，ratio 反而低于旁边的小卡片。
 */

/** 区块 DOM id ≡ URL hash ≡ 埋点 section 值，三者共用同一份常量，别各写各的。 */
export const DISCOVERY_SECTIONS = [
  'model-discovery-overview',
  'model-discovery-specialty-rank',
  'model-discovery-multi-dim',
  'model-discovery-full-ranking',
  'model-discovery-agent-rank',
] as const

export type DiscoverySectionId = (typeof DISCOVERY_SECTIONS)[number]

export function useSectionAnchor(ready: boolean) {
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return

    // 带 hash 进来先定位。区块是异步渲染出来的，等一帧再找，否则 getElementById 拿到 null。
    const initial = decodeURIComponent(window.location.hash.replace(/^#/, ''))
    let locateTimer = 0
    if ((DISCOVERY_SECTIONS as readonly string[]).includes(initial)) {
      locateTimer = window.setTimeout(() => {
        document.getElementById(initial)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 120)
    }

    // 连续停留不重复上报：只记「上一个报过的」，离开再回来算新的一次到达。
    let lastReported = ''
    let frame = 0

    // 判定「当前区块」＝越过判定线的最后一个区块。
    // 用几何量而不是 IntersectionObserver：完整榜单比视口还高，观察器口径下它和下一个
    // 区块会同时 intersecting，取谁都错一半（实测 hash 会滞后一个区块）；而「谁的顶
    // 越过了线」在任何区块高度下都唯一。
    const sync = () => {
      const line = window.scrollY + window.innerHeight * 0.25
      // 触底时最后一个区块可能整个还在线下方、永远选不中，这时直接认最后一个存在的。
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8

      let current = ''
      for (const id of DISCOVERY_SECTIONS) {
        const el = document.getElementById(id)
        if (!el) continue // 区块按模态条件渲染，缺席是正常的
        if (atBottom || el.getBoundingClientRect().top + window.scrollY <= line) current = id
      }
      if (!current || current === lastReported) return
      lastReported = current

      // replaceState 而不是改 location.hash：后者会往历史里塞一条，用户按返回得连按十几次
      // 才退得出这个页面；也不能用 pushState，同理。
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${current}`,
      )
      trackEvent('model_discovery_section_view', { section: current })
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        sync()
      })
    }

    sync() // 首屏也算一次到达，别等用户滚了才有 hash
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      if (locateTimer) window.clearTimeout(locateTimer)
    }
  }, [ready])
}
