/**
 * 小标签折叠数学（tag-fit）的单测。两处消费者共用这套换算：
 * 可体验任务（gap 4、无上限）与卡片 API 协议（gap 5、上限 2）。
 *
 * 为什么必须在这里钉：这段逻辑依赖 ResizeObserver + 真实文本量宽，而浏览器面板
 * 隐藏时页面不合成、RO 回调根本不投递（2026-08-27 实测，连 observe 时的首次回调
 * 都没有），jsdom 也不做布局。所以宽度换算只能靠单测。
 *
 * 宽度表全部取自浏览器实测（11px Inter，padding 1px 7px → padX 14；协议标签另有
 * 左右各 1px 边框）：
 *   任务 中文 文生视频 58 / 图生视频 58 / 视频生视频 69；
 *        英文 Text-to-video 88 / Image-to-video 96 / Video-to-video 94；「+N」28
 *   协议 OpenAI Chat Completions 148 / Anthropic Messages 120 / OpenAI Image Edits 117 /
 *        Content Generation 116 / OpenAI Responses 112 / OpenAI Images 93 /
 *        OpenAI Video 85；「+N」27
 * 容器实测区间：任务列 121~209px，卡片协议行 268~440px（都随网格列数跳变）。
 */
import { describe, expect, it } from 'vitest'
import { fitCount, splitByFit } from './tag-fit'

describe('fitCount — 可体验任务（gap 4，无条数上限）', () => {
  const W: Record<string, number> = {
    文生视频: 58, 图生视频: 58, 视频生视频: 69,
    'Text-to-video': 88, 'Image-to-video': 96, 'Video-to-video': 94,
    '+1': 28, '+2': 28,
  }
  const w = (t: string) => W[t] ?? t.length * 7
  const fit = (labels: string[], avail: number) => fitCount(labels, avail, w, { gap: 4 })
  const ZH3 = ['文生视频', '图生视频', '视频生视频']
  const EN3 = ['Text-to-video', 'Image-to-video', 'Video-to-video']

  it('放得下就不折（中文两连 120px ≤ 155px 列宽）', () => {
    expect(fit(['文生视频', '图生视频'], 155)).toBe(2)
  })

  it('中文三连 193px 放不下 155px，但两个 + chip = 152 ≤ 155 → 露 2 个', () => {
    expect(fit(ZH3, 155)).toBe(2)
  })

  it('同一份中文三连在 121px 窄档只放得下 1 个（58+4+28=90 ≤ 121，两个要 152）', () => {
    expect(fit(ZH3, 121)).toBe(1)
  })

  it('英文三连在 155px 只放得下 1 个（88+4+28=120 ≤ 155，两个要 216）', () => {
    expect(fit(EN3, 155)).toBe(1)
  })

  it('英文三连在 209px 宽档仍只放 1 个（两个 + chip = 88+4+96+4+28 = 220 > 209）', () => {
    expect(fit(EN3, 209)).toBe(1)
  })

  it('宽到放得下全部就不出现「+N」（英文三连需 286px）', () => {
    expect(fit(EN3, 300)).toBe(3)
  })

  it('极窄档至少保留 1 个（只剩「+3」没有信息量，超出交给 CSS 省略号）', () => {
    expect(fit(EN3, 40)).toBe(1)
    expect(fit(ZH3, 10)).toBe(1)
  })

  it('单个标签永不折叠', () => {
    expect(fit(['Video-to-video'], 50)).toBe(1)
  })
})

describe('fitCount — 卡片 API 协议（gap 5，上限 2）', () => {
  const W: Record<string, number> = {
    'OpenAI Chat Completions': 148, 'Anthropic Messages': 120, 'OpenAI Image Edits': 117,
    'Content Generation': 116, 'OpenAI Responses': 112, 'OpenAI Images': 93, 'OpenAI Video': 85,
    '+1': 27, '+2': 27, '+3': 27,
  }
  const w = (t: string) => W[t] ?? t.length * 7
  const fit = (labels: string[], avail: number) => fitCount(labels, avail, w, { gap: 5, cap: 2 })
  const TRIO = ['OpenAI Chat Completions', 'Anthropic Messages', 'OpenAI Video']

  it('线上最常见的三连（合计 390px）在 322px 容器里露 2 个 +「+1」（148+5+120+5+27=305）', () => {
    expect(fit(TRIO, 322)).toBe(2)
  })

  it('两个就是上限：即便宽到放得下全部三个也只露 2 个', () => {
    expect(fit(TRIO, 1000)).toBe(2)
  })

  it('上限是「不超过」而非「必须折」：正好两个协议时全量展示、不出「+N」', () => {
    expect(fit(['OpenAI Chat Completions', 'Anthropic Messages'], 322)).toBe(2)
  })

  it('268px 窄档放不下两个（305 > 268）→ 退到 1 个 +「+2」（148+5+27=180）', () => {
    expect(fit(TRIO, 268)).toBe(1)
  })

  it('上限必须在算「+N」宽度前生效：临界宽度 304px 差 1px 就退成 1 个', () => {
    expect(fit(TRIO, 305)).toBe(2)
    expect(fit(TRIO, 304)).toBe(1)
  })

  it('四连也只露 2 个，「+N」按真实剩余数算', () => {
    const four = [...TRIO, 'Content Generation']
    expect(fit(four, 322)).toBe(2)
    expect(splitByFit(four, fit(four, 322)).hidden).toHaveLength(2)
  })

  it('极窄档至少留 1 个（超出交给 CSS 省略号，仍是单行）', () => {
    expect(fit(TRIO, 30)).toBe(1)
  })

  it('单个协议不折叠、不出「+N」', () => {
    expect(fit(['OpenAI Chat Completions'], 100)).toBe(1)
  })
})

describe('splitByFit', () => {
  const labels = ['a', 'b', 'c']

  it('limit 为 null（还没量到宽度）时全量展示，不误折', () => {
    expect(splitByFit(labels, null)).toEqual({ visible: labels, hidden: [] })
  })

  it('limit 等于总数时全量展示（折成 n-1 +「+1」反而少露一个）', () => {
    expect(splitByFit(labels, 3)).toEqual({ visible: labels, hidden: [] })
  })

  it('limit 大于总数也不折', () => {
    expect(splitByFit(labels, 9)).toEqual({ visible: labels, hidden: [] })
  })

  it('超出时切成可见 + 被折叠两段，顺序不变', () => {
    expect(splitByFit(labels, 2)).toEqual({ visible: ['a', 'b'], hidden: ['c'] })
  })
})
