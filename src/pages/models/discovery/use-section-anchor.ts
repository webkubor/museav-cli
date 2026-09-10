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
    if (!('IntersectionObserver' in window)) return

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

    const observer = new IntersectionObserver(
      (entries) => {
        const arrived = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (!arrived) return

        const id = arrived.target.id
        if (!id || id === lastReported) return
        lastReported = id

        // replaceState 而不是改 location.hash：后者会往历史里塞一条，用户按返回得连按十几次
        // 才退得出这个页面；也不能用 pushState，同理。
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`)
        trackEvent('model_discovery_section_view', { section: id })
      },
      { rootMargin: '-12% 0px -80% 0px', threshold: 0 },
    )

    const observed = DISCOVERY_SECTIONS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    )
    observed.forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
      if (locateTimer) window.clearTimeout(locateTimer)
    }
  }, [ready])
}
