/**
 * OverflowTip 的「只在真截断时才冒气泡」判定测试。
 *
 * 为什么必须用单测钉：jsdom 不做布局，scrollWidth/scrollHeight 恒为 0，所以这里把两个
 * 度量 stub 掉，直接验判定分支。浏览器里也验不了 —— 会冒气泡的那条数据（英文 featured_pitch_en
 * 140~152 字，两行放不下）只存在于生产环境，test 环境的 pitch 全是 25~38 字的中文，
 * 两行都放得下、恒不截断；而 DOM 里手改文案会被 React 下一次 render 覆盖成 prop 原值，
 * 量到的和气泡里显示的不是同一个东西（2026-08-26 实测踩过）。
 *
 * multiline 分支的来历：精选轮播的简介是 -webkit-line-clamp 两行截断，横向根本不溢出
 * （它会换行），单行那套 scrollWidth 判定在多行场景恒为「没截断」，气泡永远不冒。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OverflowTip } from './OverflowTip'

/** 给某个真实 DOM 节点伪造布局度量（jsdom 里这两个属性恒 0）。 */
function stubMetrics(el: Element, m: { scrollW?: number; clientW?: number; scrollH?: number; clientH?: number }) {
  const def = (k: string, v: number) => Object.defineProperty(el, k, { value: v, configurable: true })
  if (m.scrollW !== undefined) def('scrollWidth', m.scrollW)
  if (m.clientW !== undefined) def('clientWidth', m.clientW)
  if (m.scrollH !== undefined) def('scrollHeight', m.scrollH)
  if (m.clientH !== undefined) def('clientHeight', m.clientH)
}

const TEXT = '支持图文输入的轻量视觉模型，响应快、单价低，适合截图问答与大批量图片理解。'
// 气泡走 portal 挂 body，但仍在组件树里 —— RTL 的自动 cleanup 会跟着 unmount 一起收掉，
// 不要在 afterEach 里再手动 remove 一次（会 NotFoundError：节点已经不是 body 的子节点了）。
const tip = () => screen.queryByRole('tooltip')

describe('OverflowTip — 单行（默认，量 scrollWidth）', () => {
  it('文本被横向截断时冒气泡显全文', () => {
    const { container } = render(<OverflowTip text={TEXT} />)
    const el = container.firstElementChild!
    stubMetrics(el, { scrollW: 500, clientW: 200 })
    fireEvent.mouseEnter(el)
    expect(tip()).toHaveTextContent(TEXT)
  })

  it('没截断就不冒（没截断不打扰）', () => {
    const { container } = render(<OverflowTip text="短" />)
    const el = container.firstElementChild!
    stubMetrics(el, { scrollW: 200, clientW: 200 })
    fireEvent.mouseEnter(el)
    expect(tip()).toBeNull()
  })

  it('移出后气泡收掉', () => {
    const { container } = render(<OverflowTip text={TEXT} />)
    const el = container.firstElementChild!
    stubMetrics(el, { scrollW: 500, clientW: 200 })
    fireEvent.mouseEnter(el)
    expect(tip()).not.toBeNull()
    fireEvent.mouseLeave(el)
    expect(tip()).toBeNull()
  })

  it('渲染成 span 且带单行省略的类', () => {
    const { container } = render(<OverflowTip text={TEXT} />)
    const el = container.firstElementChild!
    expect(el.tagName).toBe('SPAN')
    expect(el.className).toContain('whitespace-nowrap')
  })
})

describe('OverflowTip — multiline（量 scrollHeight，精选轮播两行简介）', () => {
  it('两行放不下时冒气泡（此时横向并不溢出，单行判定会漏）', () => {
    const { container } = render(<OverflowTip as="p" text={TEXT} multiline />)
    const el = container.firstElementChild!
    // 3 行内容塞进 2 行的盒子：高度溢出，宽度不溢出
    stubMetrics(el, { scrollH: 60, clientH: 40, scrollW: 390, clientW: 390 })
    fireEvent.mouseEnter(el)
    expect(tip()).toHaveTextContent(TEXT)
  })

  it('两行放得下就不冒（中文 52 字的情形）', () => {
    const { container } = render(<OverflowTip as="p" text={TEXT} multiline />)
    const el = container.firstElementChild!
    stubMetrics(el, { scrollH: 40, clientH: 40, scrollW: 390, clientW: 390 })
    fireEvent.mouseEnter(el)
    expect(tip()).toBeNull()
  })

  it('multiline 不能带 whitespace-nowrap —— 带了就不换行，line-clamp 失效', () => {
    const { container } = render(<OverflowTip as="p" text={TEXT} multiline />)
    const el = container.firstElementChild!
    expect(el.tagName).toBe('P')
    expect(el.className).not.toContain('whitespace-nowrap')
  })

  it('as 渲染成指定标签本身（截断发生在它身上，套一层就量不到）', () => {
    const { container } = render(<OverflowTip as="strong" text={TEXT} />)
    expect(container.firstElementChild!.tagName).toBe('STRONG')
  })
})
