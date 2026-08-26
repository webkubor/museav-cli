/**
 * 「可体验任务」标签组测试（shared/modelgo_prd#872 需求点 10 + 折叠追加）。
 * 钉住三个契约：≤max 全量独立标签、>max 折叠为「+N」且气泡可达其余任务、
 * 空任务回落「暂未开放」。
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ExperienceTaskTags } from './ExperienceTaskTags'
import type { ExperienceTaskType } from '@/pages/models/model-experience-data'

beforeAll(async () => {
  await loadLocaleNamespaces(['modelsCatalog', 'modelsExperience'], 'zh')
  await i18n.changeLanguage('zh')
})

const videoTasks: ExperienceTaskType[] = ['text_to_video', 'image_to_video', 'video_to_video']

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
