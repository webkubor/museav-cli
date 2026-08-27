/**
 * 「可体验任务」标签组测试（shared/modelgo_prd#872 需求点 10 + 折叠追加）。
 * 钉住的契约：≤max 全量独立标签、>max 折叠为「+N」且气泡可达其余任务、
 * 空任务回落「暂未开放」，以及 fit 模式按可用宽度折叠。
 *
 * 这里只钉组件接线（类名、折叠后的 DOM、气泡可达、RO 重算）；宽度换算本身是
 * 与 API 协议行共用的公共逻辑，用例在 tag-fit.test.ts。
 */
import { act, render, screen, fireEvent } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ExperienceTaskTags } from './ExperienceTaskTags'
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
