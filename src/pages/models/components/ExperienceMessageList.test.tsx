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
  'modelsExperience.modelThinking': '模型思考中',
  'modelsExperience.thinkProcess': '思考过程',
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

describe('ExperienceMessageList · 思维链隐藏（#1124）', () => {
  it('历史消息只显示最终回答，不显示思维链文本或入口', () => {
    render(
      <ExperienceMessageList
        messages={[{ role: 'assistant', content: '<think>内部推理内容</think>对用户的最终回答' }]}
        isStreaming={false}
        emptyState={null}
      />,
    )

    expect(screen.getByText('对用户的最终回答')).toBeInTheDocument()
    expect(screen.queryByText('内部推理内容')).not.toBeInTheDocument()
    expect(screen.queryByText('思考过程')).not.toBeInTheDocument()
  })

  it('流式思考只显示状态动画，不显示思维链文本', () => {
    render(
      <ExperienceMessageList
        messages={[{ role: 'assistant', content: '<think>流式内部推理' }]}
        isStreaming
        emptyState={null}
      />,
    )

    expect(screen.getByLabelText('模型思考中')).toBeInTheDocument()
    expect(screen.queryByText('流式内部推理')).not.toBeInTheDocument()
    expect(screen.queryByText('思考过程')).not.toBeInTheDocument()
  })

  it('音频产物标题也隐藏 assistant 思维链', () => {
    render(
      <ExperienceMessageList
        messages={[{
          role: 'assistant',
          content: '<think>音频推理内容</think>最终语音说明',
          media: [{ kind: 'audio', url: 'https://example.com/audio.mp3' }],
        }]}
        isStreaming={false}
        isMediaTask
        emptyState={null}
      />,
    )

    expect(screen.getAllByText('最终语音说明')).toHaveLength(2)
    expect(screen.queryByText('音频推理内容')).not.toBeInTheDocument()
  })
})
