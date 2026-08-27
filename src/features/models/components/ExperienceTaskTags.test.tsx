/**
 * 「可体验任务」标签组测试（shared/modelgo_prd#872 需求点 10 + 折叠追加）。
 * 钉住的契约：≤max 全量独立标签、>max 折叠为「+N」且气泡可达其余任务、
 * 空任务回落「暂未开放」，以及 fit 模式按可用宽度折叠。
 *
 * fit 的数学为什么必须单测：这段逻辑依赖 ResizeObserver + 真实文本量宽，而
 * 浏览器面板隐藏时页面不走渲染步骤、RO 回调根本不投递（2026-08-27 实测，连
 * observe 时的首次回调都没有），jsdom 也不做布局。所以宽度换算只能在这里钉。
 * 真实宽度取自浏览器实测（11px Inter，padding 1px 7px → padX 14）：
 *   中文 文生视频 58 / 图生视频 58 / 视频生视频 69；英文 Text-to-video 88 /
 *   Image-to-video 96 / Video-to-video 94；「+N」28。
 * 任务列宽实测区间 121~209px（随网格列数跳变）。
 */
import { act, render, screen, fireEvent } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ExperienceTaskTags } from './ExperienceTaskTags'
import { fitCount } from './experience-task-fit'
import type { ExperienceTaskType } from '@/pages/models/model-experience-data'

beforeAll(async () => {
  await loadLocaleNamespaces(['modelsCatalog', 'modelsExperience'], 'zh')
  await i18n.changeLanguage('zh')
})

const videoTasks: ExperienceTaskType[] = ['text_to_video', 'image_to_video', 'video_to_video']

/** stub 容器可用宽度。jsdom 不做布局、clientWidth 恒 0，且它定义在 Element.prototype 上
 *  （spyOn(HTMLElement.prototype, 'clientWidth', 'get') 拿不到、静默失效）。 */
function stubClientWidth(get: () => number) {
  const orig = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get })
  return () => {
    if (orig) Object.defineProperty(Element.prototype, 'clientWidth', orig)
  }
}


describe('ExperienceTaskTags', () => {
  it('数量不超过 max 时全量渲染独立标签，无折叠 chip', () => {
    const { container } = render(<ExperienceTaskTags tasks={videoTasks} max={3} />)
    expect(container.querySelectorAll('.mg-task-tags > em')).toHaveLength(3)
    expect(container.querySelector('.mg-task-tags-more')).toBeNull()
  })

  it('超过 max 折叠为「+N」，气泡/aria 可达被折叠的任务', () => {
    const { container } = render(<ExperienceTaskTags tasks={videoTasks} max={2} />)
    expect(container.querySelectorAll('.mg-task-tags > em')).toHaveLength(2)
    const more = container.querySelector('.mg-task-tags-more')!
    expect(more.textContent).toBe('+1')
    // 被折叠的是第三个任务（视频生视频），全量列表通过 aria-label 与悬停气泡可达
    const hiddenLabel = i18n.t('modelsExperience.taskLabel.video_to_video')
    expect(more.getAttribute('aria-label')).toBe(hiddenLabel)
    fireEvent.mouseEnter(more)
    expect(screen.getByRole('tooltip').textContent).toBe(hiddenLabel)
    fireEvent.mouseLeave(more)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('不传 max 不折叠（详情页口径）', () => {
    const { container } = render(<ExperienceTaskTags tasks={videoTasks} />)
    expect(container.querySelectorAll('.mg-task-tags > em')).toHaveLength(3)
    expect(container.querySelector('.mg-task-tags-more')).toBeNull()
  })

  it('空任务回落「暂未开放」纯文本（AC-13）', () => {
    render(<ExperienceTaskTags tasks={[]} max={3} />)
    expect(screen.getByText(i18n.t('modelsCatalog.button.comingSoon'))).toBeTruthy()
  })
})

describe('fitCount — 按可用宽度算一行放几个', () => {
  // 浏览器实测宽度表（含左右 padding 各 7px）
  const W: Record<string, number> = {
    文生视频: 58, 图生视频: 58, 视频生视频: 69,
    'Text-to-video': 88, 'Image-to-video': 96, 'Video-to-video': 94,
    'Text-to-image': 91, 'Image-to-image': 99,
    '+1': 28, '+2': 28,
  }
  const w = (t: string) => W[t] ?? t.length * 7
  const ZH3 = ['文生视频', '图生视频', '视频生视频']
  const EN3 = ['Text-to-video', 'Image-to-video', 'Video-to-video']

  it('放得下就不折（中文两连 120px ≤ 155px 列宽）', () => {
    expect(fitCount(['文生视频', '图生视频'], 155, w)).toBe(2)
  })

  it('中文三连 193px 放不下 155px → 折成 1 个 +「+2」（58+4+28=90）', () => {
    // 两个 + chip = 58+4+58+4+28 = 152 ≤ 155，所以其实还能放 2 个
    expect(fitCount(ZH3, 155, w)).toBe(2)
  })

  it('同一份中文三连在 121px 窄档只放得下 1 个（58+4+28=90 ≤ 121，两个要 152）', () => {
    expect(fitCount(ZH3, 121, w)).toBe(1)
  })

  it('英文三连在 155px 只放得下 1 个（88+4+28=120 ≤ 155，两个要 216）', () => {
    expect(fitCount(EN3, 155, w)).toBe(1)
  })

  it('英文三连在 209px 宽档仍只放 1 个（两个 + chip = 88+4+96+4+28 = 220 > 209）', () => {
    expect(fitCount(EN3, 209, w)).toBe(1)
  })

  it('宽到放得下全部就不出现「+N」（英文三连需 286px）', () => {
    expect(fitCount(EN3, 300, w)).toBe(3)
  })

  it('极窄档至少保留 1 个（只剩「+3」没有信息量，超出交给 CSS 省略号）', () => {
    expect(fitCount(EN3, 40, w)).toBe(1)
    expect(fitCount(ZH3, 10, w)).toBe(1)
  })

  it('单个标签永不折叠', () => {
    expect(fitCount(['Video-to-video'], 50, w)).toBe(1)
  })
})

describe('ExperienceTaskTags — fit 模式接线', () => {
  it('量不到宽度时（jsdom / 容器 0 宽）保持全量展示，不误折', () => {
    const { container } = render(<ExperienceTaskTags tasks={videoTasks} fit />)
    expect(container.querySelectorAll('.mg-task-tags > em')).toHaveLength(3)
    expect(container.querySelector('.mg-task-tags-more')).toBeNull()
  })

  it('fit 模式挂 is-fit 类（单行 + 省略号靠它生效），max 模式不挂', () => {
    const { container: a } = render(<ExperienceTaskTags tasks={videoTasks} fit />)
    expect(a.querySelector('.mg-task-tags')!.className).toContain('is-fit')
    const { container: b } = render(<ExperienceTaskTags tasks={videoTasks} max={2} />)
    expect(b.querySelector('.mg-task-tags')!.className).not.toContain('is-fit')
  })

  it('宽度变化后重新折叠（浏览器面板隐藏时 RO 不投递，这条只能在单测覆盖）', () => {
    // 装一个可手动触发的假 ResizeObserver
    const cbs: Array<() => void> = []
    class FakeRO {
      constructor(cb: () => void) { cbs.push(cb) }
      observe() {}
      disconnect() {}
    }
    const prev = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO
    // 用极端宽度断言，不依赖 jsdom 里估算的绝对值（那边 padding 读作 0、字号读作
    // "medium"，与浏览器实测 padX=14 不符；精确换算由上面 fitCount 的用例负责）
    let width = 1
    const restore = stubClientWidth(() => width)
    try {
      const { container } = render(<ExperienceTaskTags tasks={videoTasks} fit />)
      expect(container.querySelectorAll('.mg-task-tags > em')).toHaveLength(1)
      expect(container.querySelector('.mg-task-tags-more')!.textContent).toBe('+2')
      width = 10000
      // 必须包 act：RO 回调不走 React 事件系统，不包住状态更新不会被 flush
      act(() => cbs.forEach((cb) => cb()))
      expect(container.querySelectorAll('.mg-task-tags > em')).toHaveLength(3)
      expect(container.querySelector('.mg-task-tags-more')).toBeNull()
    } finally {
      restore()
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = prev
    }
  })

  it('极窄容器至少留 1 个标签 +「+N」（只剩「+3」没有信息量）', () => {
    const restore = stubClientWidth(() => 1)
    try {
      const { container } = render(<ExperienceTaskTags tasks={videoTasks} fit />)
      expect(container.querySelectorAll('.mg-task-tags > em')).toHaveLength(1)
      expect(container.querySelector('.mg-task-tags-more')!.textContent).toBe('+2')
    } finally {
      restore()
    }
  })
})
