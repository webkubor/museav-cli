import { useEffect } from 'react'

import { trackEvent } from '@/lib/track'

/**
 * 模型发现页的区块锚点（qa#726 / TC-DISC-102）。
 *
 * 四件事：滚到某区块时把它的 id 同步进 URL hash、上报一次 `model_discovery_section_view`
 * （字段 `section_key` + `trigger_type`，见下）、
 * 带 hash 进页面时定位过去、**hash 落不到区块时回退 `#overview` 并留痕**（PRD §13.3）。
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

/** 兜底落点：任何 hash 落不到区块都回这里（PRD §13.3）。 */
const OVERVIEW_SECTION: DiscoverySectionId = 'model-discovery-overview'

/**
 * 回退原因。两个取值**必须分得开**（prd#1003）：下游要据此区分「用户乱输 / 外链过期」
 * 和「产品结构问题——该区块在当前模态下根本不出」，后者是要去改产品的信号，前者不是。
 */
type RouteFallbackReason =
  /** hash 不在 DISCOVERY_SECTIONS 白名单里 */
  | 'invalid_hash'
  /** hash 合法，但当前模态不渲染这个区块（如图像模态下的 #model-discovery-agent-rank） */
  | 'section_unavailable'

export function useSectionAnchor(ready: boolean) {
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return

    /** 回退到概览：改 hash + 定位 + 留痕，三件一起做，别只做其中一件。 */
    const fallbackToOverview = (requestedHash: string, reason: RouteFallbackReason) => {
      // 同样用 replaceState：回退不该在历史里留一条，否则用户按返回又回到坏 hash
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${OVERVIEW_SECTION}`,
      )
      document.getElementById(OVERVIEW_SECTION)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.setTimeout(() => sync('anchor'), 500)
      trackEvent('model_discovery_section_route_fallback', {
        requested_hash: requestedHash,
        fallback_reason: reason,
      })
    }

    /**
     * 校验一个 hash 能不能落地，落不了就回退。
     * 判据分两层，缺一层就会漏掉 prd#1003 的第 ② 发：白名单只能拦住拼错的 hash，
     * 「合法但当前模态不渲染」得靠 getElementById 实际探一下 DOM。
     */
    const resolveHash = (raw: string) => {
      const hash = decodeURIComponent(raw.replace(/^#/, ''))
      if (!hash) return
      if (!(DISCOVERY_SECTIONS as readonly string[]).includes(hash)) {
        fallbackToOverview(hash, 'invalid_hash')
        return
      }
      const el = document.getElementById(hash)
      if (!el) {
        fallbackToOverview(hash, 'section_unavailable')
        return
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // 带 hash 直达：这一次到达不是滚出来的，标 anchor。scrollIntoView 是平滑动画，
      // 等它落定再同步，否则 sync 读到的还是滚动前的位置、会把上一个区块当成当前区块。
      window.setTimeout(() => sync('anchor'), 500)
    }

    // 带 hash 进来先定位。区块是异步渲染出来的，等一帧再找，否则 getElementById 拿到 null
    // ——这个延迟对回退同样关键：太早探 DOM 会把「还没渲染」误判成「当前模态不展示」。
    let locateTimer = 0
    if (window.location.hash) {
      const initialHash = window.location.hash
      locateTimer = window.setTimeout(() => resolveHash(initialHash), 120)
    }

    // 运行时被改 hash（外链、手输地址栏、切模态后旧 hash 失效）也要走同一套校验。
    // 自己改 hash 走的是 replaceState，不触发 hashchange，不会和这里打架。
    const onHashChange = () => resolveHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)

    // 连续停留不重复上报：只记「上一个报过的」，离开再回来算新的一次到达。
    let lastReported = ''

    // 判定「当前区块」＝越过判定线的最后一个区块。
    // 用几何量而不是 IntersectionObserver：完整榜单比视口还高，观察器口径下它和下一个
    // 区块会同时 intersecting，取谁都错一半（实测 hash 会滞后一个区块）；而「谁的顶
    // 越过了线」在任何区块高度下都唯一。
    /**
     * `trigger_type`（PRD §13.3，prd#1007）：区分「用户滚过来的」和「带 hash 直接落过来的」。
     * 下游按它拆分自然浏览与外链直达，混在一起会把外链流量算成页内浏览深度。
     */
    const sync = (triggerType: 'scroll' | 'anchor' = 'scroll') => {
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
      // 字段名是 section_key，不是 section（PRD / TestMgr 用例口径，prd#1007 缺口二）
      trackEvent('model_discovery_section_view', { section_key: current, trigger_type: triggerType })
    }

    sync() // 首屏也算一次到达，别等用户滚了才有 hash

    // 🔴 用定时轮询判「当前区块」，不挂 scroll 监听 + rAF（prd#1007 复验分歧的根因）：
    // 页面被后台化/遮挡时 Chrome 暂停渲染管线，rAF 回调与 scroll 事件都不再派发——
    // 上一版 onScroll 里 `frame` 置位后 rAF 永不执行，后续 scroll 全部早退，
    // scroll-spy 从落地起冻结（QA r7 取证 A/B：hash 恒定/恒空 + section_view 0 条，
    // 而走 setTimeout 的 anchor 路径同环境仍是通的）。定时器在后台页照样触发
    // （最多被钳到 1s/次），300ms 一次 5 个 getBoundingClientRect 的成本可忽略。
    const pollTimer = window.setInterval(() => sync(), 300)

    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.clearInterval(pollTimer)
      if (locateTimer) window.clearTimeout(locateTimer)
    }
  }, [ready])
}
