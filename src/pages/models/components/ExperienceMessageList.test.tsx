/**
 * 媒体失败展示（qa#549）：确定性失败（errorRetryable=false）不给重试入口，
 * 上游原文降级为可展开详情，详情区带我方 request_id/trace_id。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExperienceMessageList } from './ExperienceMessageList'
import type { ExperienceMessage } from '../model-experience-data'

const messages: Record<string, string> = {
  'modelsExperience.notBilled': '计费：未计费',
  'modelsExperience.retryAfterAdjust': '调整后重试',
  'modelsExperience.errorDetailShow': '查看详情',
  'modelsExperience.errorDetailHide': '收起详情',
}

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string, fallback?: string) => messages[key] ?? fallback ?? key }),
}))

vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => ({ currency: 'CNY', symbol: '¥' }),
}))

// @lobehub/icons 的 fluent-emoji 子路径在 vitest 的 node ESM 解析下会炸（目录导入），
// 与本用例要断言的失败态行为无关，直接替身（同 ModelsCompareModal.test.tsx 的处理）
vi.mock('@/features/models/components/ModelIcon', () => ({ ModelIcon: () => null }))

function userThenFailedMedia(patch: Partial<ExperienceMessage>): ExperienceMessage[] {
  return [
    { role: 'user', content: '画一只猫' },
    { role: 'assistant', content: '', ...patch },
  ]
}

describe('ExperienceMessageList · 媒体失败展示', () => {
  it('确定性失败（errorRetryable=false）：不渲染重试按钮，渲染详情展开', () => {
    render(
      <ExperienceMessageList
        messages={userThenFailedMedia({
          error: '请求内容被上游安全策略拒绝，请修改后重试',
          errorRetryable: false,
          errorDetail: '[BadRequestError] Your request was rejected by the safety system.',
          errorRequestId: 'req-abc',
          errorTraceId: 'trace-xyz',
        })}
        isStreaming={false}
        isMediaTask
        onRetry={vi.fn()}
        emptyState={null}
      />,
    )
    expect(screen.getByText('请求内容被上游安全策略拒绝，请修改后重试')).toBeInTheDocument()
    expect(screen.queryByText('调整后重试')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('查看详情'))
    expect(screen.getByText(/BadRequestError/)).toBeInTheDocument()
    expect(screen.getByText(/req-abc/)).toBeInTheDocument()
    expect(screen.getByText(/trace-xyz/)).toBeInTheDocument()
  })

  it('可重试失败（errorRetryable=true）：渲染重试按钮，点击回传上一条用户消息', () => {
    const onRetry = vi.fn()
    const msgs = userThenFailedMedia({ error: '上游服务暂时不可用，请稍后重试', errorRetryable: true })
    render(<ExperienceMessageList messages={msgs} isStreaming={false} isMediaTask onRetry={onRetry} emptyState={null} />)

    fireEvent.click(screen.getByText('调整后重试'))
    expect(onRetry).toHaveBeenCalledWith(msgs[0])
  })

  it('未设置 errorRetryable（历史消息/旧格式）：默认按可重试处理，保留既有行为', () => {
    render(
      <ExperienceMessageList
        messages={userThenFailedMedia({ error: '该消息发送失败' })}
        isStreaming={false}
        isMediaTask
        onRetry={vi.fn()}
        emptyState={null}
      />,
    )
    expect(screen.getByText('调整后重试')).toBeInTheDocument()
  })

  it('没有详情/ID 时不渲染"查看详情"折叠区', () => {
    render(
      <ExperienceMessageList
        messages={userThenFailedMedia({ error: '该消息发送失败', errorRetryable: true })}
        isStreaming={false}
        isMediaTask
        onRetry={vi.fn()}
        emptyState={null}
      />,
    )
    expect(screen.queryByText('查看详情')).not.toBeInTheDocument()
  })
})
