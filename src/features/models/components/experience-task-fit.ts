/**
 * 「可体验任务」标签折叠的纯计算部分（组件在 ExperienceTaskTags.tsx）。
 * 单独成文件有两个理由：
 *   1. react-refresh 要求组件文件只导出组件，导出 fitCount 会报错；
 *   2. 这段数学在浏览器里验不了 —— 面板隐藏时页面不走渲染步骤、ResizeObserver
 *      回调根本不投递（2026-08-27 实测，连 observe 的首次回调都没有），jsdom 又
 *      不做布局。只能靠单测钉，所以它必须是可独立导入的纯函数。
 */
/** 与 .mg-task-tags 的 gap 一致，改 CSS 要同步改这里 */
const TAG_GAP = 4

/**
 * 用 canvas 量文本宽度，而不是「先渲染全部再收起」的两趟 DOM 测量：
 * 后者在 useLayoutEffect 里也要多一次布局，且 35 张卡同时做代价不划算。
 * 字体从真实渲染出来的标签上读，不写死 —— 字号/字族改了这里自动跟上。
 * （实测与 DOM 量出的宽度逐项相同：文生图 47px / Text-to-video 88px）
 */
export function tagWidthMeasurer(sample: HTMLElement): (text: string) => number {
  const cs = getComputedStyle(sample)
  // 不能直接 parseFloat：拿不到样式的环境（jsdom）返回空串 → NaN，而 NaN 参与比较
  // 恒为 false，会让 fitCount 的每一档都判成「放不下」、永远只露 1 个标签。
  // 兜底值取 .mg-task-tags > em 的实际声明（11px / padding 1px 7px）。
  const num = (v: string, fallback: number) => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : fallback
  }
  const fontSize = num(cs.fontSize, 11)
  const padX = num(cs.paddingLeft, 7) + num(cs.paddingRight, 7)
  const ctx = document.createElement('canvas').getContext('2d')
  // 无 canvas（jsdom）时按字宽估算。必须分中西文：CJK 一字约 1em、拉丁约 0.55em，
  // 一律按 0.6em 会把中文标签算窄近一半（「视频生视频」估 47px、实测 69px），
  // 折叠就会算成放得下、照样溢出。分开算后与实测吻合：4 字 58px、5 字 69px。
  if (!ctx) {
    const cjk = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/
    return (text) => {
      let w = padX
      for (const ch of text) w += cjk.test(ch) ? fontSize : fontSize * 0.55
      return w
    }
  }
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  return (text) => ctx.measureText(text).width + padX
}

/**
 * 一行能放几个标签：放不下时留出「+N」自己的宽度，至少保留 1 个（只剩「+3」没有信息量）。
 * 极窄档下这 1 个也可能放不下（列宽 121px 时英文标签 92px + 「+N」28px = 124px），
 * 那时由 .mg-task-tags.is-fit > em 的 text-overflow 让它自己省略，仍然只占一行。
 * 导出仅为单测：浏览器面板隐藏时 ResizeObserver 不投递回调，这段数学只能靠单测钉。
 */
export function fitCount(labels: string[], avail: number, width: (t: string) => number): number {
  const total = labels.length
  const run = (n: number) => labels.slice(0, n).reduce((sum, l, i) => sum + (i ? TAG_GAP : 0) + width(l), 0)
  if (run(total) <= avail) return total
  for (let k = total - 1; k >= 1; k--) {
    if (run(k) + TAG_GAP + width(`+${total - k}`) <= avail) return k
  }
  return 1
}
