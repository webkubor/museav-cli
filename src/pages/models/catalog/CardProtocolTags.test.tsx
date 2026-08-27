/**
 * 卡片「API 协议」标签行的接线测试。
 * 钉住的契约：单行类名、按上限 2 折叠出「+N」、被折叠项通过 aria/气泡可达、
 * 可见标签点击回传 code（而不是展示文案）、排序仍走 sortProtocols、宽度变化重算。
 *
 * 折叠的宽度换算本身在 tag-fit.test.ts；这里用极端宽度断言，不依赖 jsdom 的估算
 * 绝对值（jsdom 读 padding 为 0、字号为 "medium"，与浏览器实测 padX=14 不符）。
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { CardProtocolTags } from './CardProtocolTags'

beforeAll(async () => {
  await loadLocaleNamespaces(['modelsCatalog', 'modelsExperience'], 'zh')
  await i18n.changeLanguage('zh')
})

/** stub 容器可用宽度。jsdom 不做布局、clientWidth 恒 0，且它定义在 Element.prototype 上
 *  （spyOn(HTMLElement.prototype, 'clientWidth', 'get') 拿不到、静默失效）。 */
function stubClientWidth(get: () => number) {
  const orig = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get })
  return () => {
    if (orig) Object.defineProperty(Element.prototype, 'clientWidth', orig)
  }
}

// 线上最常见的三连（Doubao 系）。刻意乱序传入，用来同时验 sortProtocols 仍生效。
const TRIO = ['anthropic_messages', 'openai_video', 'openai_chat_completions']

describe('CardProtocolTags', () => {
  it('空协议不渲染容器（卡片上不留空行）', () => {
    const { container } = render(<CardProtocolTags protocols={[]} isZh />)
    expect(container.querySelector('.mg-mcard-protocols')).toBeNull()
  })

  it('挂 is-fit 类（单行 + 省略号靠它生效）并带 API 协议 aria', () => {
    const { container } = render(<CardProtocolTags protocols={TRIO} isZh />)
    const row = container.querySelector('.mg-mcard-protocols')!
    expect(row.className).toContain('is-fit')
    expect(row.getAttribute('aria-label')).toBe(i18n.t('modelsCatalog.sidebar.apiProtocolAria'))
  })

  it('量不到宽度时（jsdom / 容器 0 宽）保持全量展示，不误折', () => {
    const { container } = render(<CardProtocolTags protocols={TRIO} isZh />)
    expect(container.querySelectorAll('button.mg-proto')).toHaveLength(3)
    expect(container.querySelector('.mg-proto-more')).toBeNull()
  })

  it('展示顺序仍走 sortProtocols（openai → anthropic → 其他），不是入参顺序', () => {
    const { container } = render(<CardProtocolTags protocols={TRIO} isZh />)
    expect([...container.querySelectorAll('button.mg-proto')].map((b) => b.textContent)).toEqual([
      'OpenAI Chat Completions', 'Anthropic Messages', 'OpenAI Video',
    ])
  })

  it('超出上限时折成两个 +「+N」，被折叠项通过 aria/悬停气泡可达', () => {
    const restore = stubClientWidth(() => 10000)
    try {
      const { container } = render(<CardProtocolTags protocols={TRIO} isZh />)
      const shown = [...container.querySelectorAll('button.mg-proto')]
      expect(shown.map((b) => b.textContent)).toEqual(['OpenAI Chat Completions', 'Anthropic Messages'])
      const more = container.querySelector('.mg-proto-more')!
      expect(more.textContent).toBe('+1')
      expect(more.getAttribute('aria-label')).toBe('OpenAI Video')
      fireEvent.mouseEnter(more)
      expect(screen.getByRole('tooltip').textContent).toBe('OpenAI Video')
      fireEvent.mouseLeave(more)
      expect(screen.queryByRole('tooltip')).toBeNull()
    } finally {
      restore()
    }
  })

  it('点击可见标签回传 code 而不是展示文案，并阻止冒泡（否则会连带触发卡片跳转）', () => {
    const onPick = vi.fn()
    const onCardClick = vi.fn()
    const { container } = render(
      <div onClick={onCardClick}>
        <CardProtocolTags protocols={TRIO} isZh onPick={onPick} />
      </div>,
    )
    fireEvent.click(container.querySelectorAll('button.mg-proto')[1])
    expect(onPick).toHaveBeenCalledWith('anthropic_messages')
    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('没有 onPick 时标签禁用（详情/只读场景不给假的可点感）', () => {
    const { container } = render(<CardProtocolTags protocols={TRIO} isZh />)
    expect([...container.querySelectorAll('button.mg-proto')].every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('宽度变化后重新折叠（浏览器面板隐藏时 RO 不投递，这条只能在单测覆盖）', () => {
    const cbs: Array<() => void> = []
    class FakeRO {
      constructor(cb: () => void) { cbs.push(cb) }
      observe() {}
      disconnect() {}
    }
    const prev = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO
    let width = 1
    const restore = stubClientWidth(() => width)
    try {
      const { container } = render(<CardProtocolTags protocols={TRIO} isZh />)
      // 极窄档：连一个都放不下时也要留 1 个（其余交给 CSS 省略号），仍是单行
      expect(container.querySelectorAll('button.mg-proto')).toHaveLength(1)
      expect(container.querySelector('.mg-proto-more')!.textContent).toBe('+2')
      width = 10000
      // 必须包 act：RO 回调不走 React 事件系统，不包住状态更新不会被 flush
      act(() => cbs.forEach((cb) => cb()))
      // 宽到放得下全部，但上限 2 仍然生效
      expect(container.querySelectorAll('button.mg-proto')).toHaveLength(2)
      expect(container.querySelector('.mg-proto-more')!.textContent).toBe('+1')
    } finally {
      restore()
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = prev
    }
  })

  it('正好两个协议时全量展示、不出「+N」（上限是「不超过」而非「必须折」）', () => {
    const restore = stubClientWidth(() => 10000)
    try {
      const { container } = render(
        <CardProtocolTags protocols={['openai_chat_completions', 'anthropic_messages']} isZh />,
      )
      expect(container.querySelectorAll('button.mg-proto')).toHaveLength(2)
      expect(container.querySelector('.mg-proto-more')).toBeNull()
    } finally {
      restore()
    }
  })

  it('气泡里按 tag 逐个排，不是逗号串成一段话；aria-label 仍是串好的整句', () => {
    const four = ['openai_chat_completions', 'anthropic_messages', 'openai_video', 'content_generation']
    const restore = stubClientWidth(() => 10000)
    try {
      const { container } = render(<CardProtocolTags protocols={four} isZh />)
      const more = container.querySelector('.mg-proto-more')!
      expect(more.textContent).toBe('+2')
      fireEvent.mouseEnter(more)
      const tip = screen.getByRole('tooltip')
      // 每个折叠项一个独立 tag 元素（几何与标签行同一套，样式见 .mg-tag-tip > span）
      expect([...tip.children].map((c) => c.textContent)).toEqual(['OpenAI Video', 'Content Generation'])
      // 读屏要的是一句连读，所以 aria-label 保留分隔符
      expect(more.getAttribute('aria-label'))
        .toBe(['OpenAI Video', 'Content Generation'].join(i18n.t('modelsExperience.listSeparator')))
    } finally {
      restore()
    }
  })

  it('labelMap 覆盖展示文案（跟随 /catalog/public-protocols 下发）', () => {
    const { container } = render(
      <CardProtocolTags protocols={['openai_video']} isZh labelMap={{ openai_video: '视频生成接口' }} />,
    )
    expect(container.querySelector('button.mg-proto')!.textContent).toBe('视频生成接口')
  })
})
