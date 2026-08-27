/**
 * 小标签「按可用宽度折叠成一行 + 「+N」」的公共实现。
 * 两处在用：卡片的可体验任务（.mg-task-tags）、卡片的 API 协议（.mg-mcard-protocols）。
 *
 * 单独成文件有两个理由：
 *   1. react-refresh 要求组件文件只导出组件，在组件文件里导出这些纯函数会报错；
 *   2. 这段逻辑在浏览器里验不了 —— 面板隐藏时页面不合成、ResizeObserver 回调根本
 *      不投递（2026-08-27 实测，连 observe 的首次回调都没有），jsdom 又不做布局。
 *      只能靠单测钉住，所以必须是可独立导入的纯函数。
 */
import { useLayoutEffect, useRef, useState } from 'react'

/**
 * 量单个标签的渲染宽度。用 canvas 量文本，而不是「先全量渲染再收起」的两趟 DOM 测量：
 * 后者要在 useLayoutEffect 里多跑一次布局，一屏 35 张卡同时做不划算。
 *
 * 字号/内距/边框都从**真实渲染出来的标签**上读，不写死 —— 换皮肤或改字号自动跟上。
 * 边框必须算进去：可体验任务是无边框的 <em>，API 协议是 1px 描边的 <button>，
 * 左右各 1px、单个标签就差 2px，三连标签攒够一次误判。
 * （实测与 DOM 逐项吻合：文生图 47 / Text-to-video 88 / OpenAI Chat Completions 148）
 */
export function tagWidthMeasurer(sample: HTMLElement): (text: string) => number {
  const cs = getComputedStyle(sample)
  const fontSize = num(cs.fontSize, 11)
  const chromeX =
    num(cs.paddingLeft, 7) + num(cs.paddingRight, 7) +
    num(cs.borderLeftWidth, 0) + num(cs.borderRightWidth, 0)
  const ctx = document.createElement('canvas').getContext('2d')
  // 无 canvas（jsdom）时按字宽估算。必须分中西文：CJK 一字约 1em、拉丁约 0.55em，
  // 一律按 0.6em 会把中文标签算窄近一半（「视频生视频」估 47px、实测 69px），
  // 折叠就会算成放得下、照样溢出。分开算后与实测吻合：4 字 58px、5 字 69px。
  if (!ctx) {
    const cjk = /[⺀-鿿豈-﫿＀-￯]/
    return (text) => {
      let w = chromeX
      for (const ch of text) w += cjk.test(ch) ? fontSize : fontSize * 0.55
      return w
    }
  }
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  return (text) => ctx.measureText(text).width + chromeX
}

/**
 * 一行能放几个标签。放不下时留出「+N」自己的宽度，且至少保留 1 个
 * （只剩一个「+3」没有信息量）。
 *
 * `cap` 是产品口径的条数上限（协议行按需求方口径最多 2 个），与宽度取更严的那个。
 * 上限不能算完再 Math.min —— 那样「+N」的宽度没进账，卡在临界宽度上仍会溢出。
 *
 * 极窄档下留下的这 1 个也可能放不下（协议容器 268px 时 148 + 5 + 「+1」27 = 180 还行，
 * 任务列 121px 时英文标签 92 + 「+N」28 就顶满了），那时由 CSS 的 is-fit + text-overflow
 * 让它自己省略，仍然只占一行。
 */
export function fitCount(
  labels: string[],
  avail: number,
  width: (t: string) => number,
  { gap, cap = Number.POSITIVE_INFINITY }: { gap: number; cap?: number },
): number {
  const total = labels.length
  const run = (n: number) =>
    labels.slice(0, n).reduce((sum, l, i) => sum + (i ? gap : 0) + width(l), 0)
  // 不超上限且全部放得下 → 不折叠、不出「+N」
  if (total <= cap && run(total) <= avail) return total
  // 到这里必然要出「+N」，所以每一档都得把它的宽度算进去
  for (let k = Math.min(cap, total - 1); k >= 1; k--) {
    if (run(k) + gap + width(`+${total - k}`) <= avail) return k
  }
  return 1
}

/**
 * 折叠条数的接线：首帧之前就算好（useLayoutEffect，用 useEffect 会先闪一下
 * 「堆两三行」再收起），之后跟随容器宽度与字体加载重算。
 *
 * `fitted` 为 null = 还没量到（容器 0 宽 / jsdom 无布局），调用方应全量展示，别误折。
 * `gap` 只是兜底值：真值从容器的 column-gap 读，免得 CSS 改了 gap 而这边的数字不跟。
 */
export function useTagFit<T extends HTMLElement>(
  labels: string[],
  { gap, cap, enabled = true }: { gap: number; cap?: number; enabled?: boolean },
) {
  const ref = useRef<T>(null)
  const [fitted, setFitted] = useState<number | null>(null)
  // 依赖用字符串而不是数组本身：调用方每次渲染都会新建数组，按引用比会每帧重跑
  const key = labels.join('|')

  useLayoutEffect(() => {
    if (!enabled) return
    const el = ref.current
    // 样式要从**真实渲染出来的**标签上读，不能凭空造一个：字号/内距/边框都在 CSS 里
    const sample = el?.firstElementChild
    if (!el || !(sample instanceof HTMLElement)) return
    const width = tagWidthMeasurer(sample)
    const gapPx = num(getComputedStyle(el).columnGap, gap)
    const recompute = () => {
      const avail = el.clientWidth
      if (avail > 0) setFitted(fitCount(key.split('|'), avail, width, { gap: gapPx, cap }))
    }
    recompute()
    // 字体晚加载会改变文本宽度，而容器宽没变、ResizeObserver 不会触发
    void document.fonts?.ready?.then(recompute)
    // 容器宽随断点变（协议行实测 268~440px、任务列 121~209px），不重算会在窄档溢出、
    // 宽档白留空。守卫不是防浏览器缺这个 API，是防**没有它的运行环境**（jsdom 就没有）
    // —— 少了它顶多不跟随宽度变化，抛出来会把整张卡片打挂。
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [enabled, key, gap, cap])

  return { ref, fitted }
}

/**
 * 按 labels 与折叠条数切成「可见 / 被折叠」两段。
 * 只在真的超出时折叠：正好等于上限时全量展示（折成 上限-1 + 「+1」反而少露一个）。
 */
export function splitByFit(labels: string[], limit: number | null) {
  const folded = limit != null && labels.length > limit
  return {
    visible: folded ? labels.slice(0, limit) : labels,
    hidden: folded ? labels.slice(limit) : [],
  }
}

/** 不能直接 parseFloat：拿不到样式的环境（jsdom）返回空串 → NaN，而 NaN 参与比较恒为
 *  false，会让 fitCount 每一档都判成「放不下」、永远只露 1 个标签。 */
function num(v: string, fallback: number) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}
