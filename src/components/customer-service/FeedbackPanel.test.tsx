/**
 * 问题反馈表单（PRD v0.1 §7.5 + 技术方案 §5.1/§6.6）。
 * 覆盖：必填校验 / 提交成功后按服务端返回生成回执 / 取消回到对话 / 接口失败不伪造成功。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { useCustomerServiceStore } from '@/store/use-customer-service-store'
import { ModelGoApiError } from '@/lib/request'
import type { SupportFeedbackResponse } from '@/interfaces/support'
import { CustomerService } from './index'
import {
  buildFeedbackReceipt,
  buildFeedbackRequest,
  createEmptyFeedbackDraft,
  validateFeedbackDraft,
} from './feedback'

vi.mock('@/services/support', () => ({
  submitSupportFeedback: vi.fn(),
  uploadSupportAttachment: vi.fn(),
}))

const { submitSupportFeedback } = await import('@/services/support')
const submitMock = vi.mocked(submitSupportFeedback)

i18n.changeLanguage('zh')
await loadLocaleNamespaces(['common'])

/** 服务端工单摘要（形状照技术方案 §5.1 的 JSON 示例） */
function serverTicket(overrides: Partial<SupportFeedbackResponse> = {}): SupportFeedbackResponse {
  return {
    ticket_id: 'FB-20260902-0007',
    ticket_type: 'feedback',
    service_mode: null,
    display_type: '问题反馈',
    status: 'pending',
    status_label: '等待客服受理',
    title: '调用问题',
    created_at: '2026-09-02T10:31:02+08:00',
    updated_at: '2026-09-02T10:31:02+08:00',
    version: 1,
    capabilities: { can_reply: false, can_supplement: true, can_reopen: false, can_create_followup: false },
    expected_response_label: '预计 2 小时内响应',
    ...overrides,
  }
}

beforeAll(() => {
  // Radix Select（ui/Select 的底座）在 jsdom 缺这几个原生能力，补齐才能驱动下拉
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  window.HTMLElement.prototype.setPointerCapture = vi.fn()
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  localStorage.clear()
  submitMock.mockReset()
  useCustomerServiceStore.setState({ isOpen: true })
})

/** 打开反馈模式，返回表单区域 */
function openFeedbackForm() {
  render(<CustomerService />)
  fireEvent.click(screen.getByRole('button', { name: '问题反馈' }))
  return screen.getByRole('region', { name: '问题反馈' })
}

function selectIssueType(label: string) {
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
  fireEvent.click(screen.getByRole('option', { name: label }))
}

function fillRequiredFields() {
  selectIssueType('调用问题')
  fireEvent.change(screen.getByRole('textbox', { name: '问题描述' }), {
    target: { value: '调用 chat 接口一直 500' },
  })
}

describe('feedback domain', () => {
  it('要求问题类型与问题描述必填，描述去空格后为空也算缺失', () => {
    expect(validateFeedbackDraft(createEmptyFeedbackDraft())).toEqual({
      issueType: 'issueTypeRequired',
      description: 'descriptionRequired',
    })
    expect(
      validateFeedbackDraft({ ...createEmptyFeedbackDraft(), issueType: 'billing', description: '   ' }),
    ).toEqual({ description: 'descriptionRequired' })
    expect(
      validateFeedbackDraft({ ...createEmptyFeedbackDraft(), issueType: 'billing', description: '扣费对不上' }),
    ).toEqual({})
  })

  it('入参按契约拼装：category 用 PRD 类型名，附件走 ID 列表，带幂等键与页面上下文', () => {
    const request = buildFeedbackRequest(
      {
        ...createEmptyFeedbackDraft(new Date(2026, 8, 2, 10, 30)),
        issueType: 'apiCall',
        description: '  一直 500  ',
        requestId: 'req-1',
        attachmentId: 'att-1',
        attachmentName: 'shot.png',
      },
      { clientSubmissionId: 'sub-1', pageName: '模型发现', pagePath: '/models/discovery', conversationId: 'conv-1' },
    )

    expect(request).toMatchObject({
      client_submission_id: 'sub-1',
      category: '调用问题',
      description: '一直 500',
      request_id: 'req-1',
      attachment_ids: ['att-1'],
      page_name: '模型发现',
      page_path: '/models/discovery',
      conversation_id: 'conv-1',
    })
    expect(new Date(request.occurred_at!).getTime()).toBe(new Date(2026, 8, 2, 10, 30).getTime())
  })

  it('回执取服务端的编号与状态文案，描述截断到 48 字；没下发预计响应时间就留空', () => {
    const draft = { ...createEmptyFeedbackDraft(), issueType: 'apiCall' as const, description: ` ${'长'.repeat(60)} ` }
    const receipt = buildFeedbackReceipt(serverTicket(), draft)
    expect(receipt.ticketId).toBe('FB-20260902-0007')
    expect(receipt.status).toBe('pending')
    expect(receipt.statusLabel).toBe('等待客服受理')
    expect(receipt.expectedResponseLabel).toBe('预计 2 小时内响应')
    expect(receipt.summary).toHaveLength(48)

    const noEta = buildFeedbackReceipt(serverTicket({ expected_response_label: undefined }), draft)
    expect(noEta.expectedResponseLabel).toBeUndefined()
  })
})

describe('CustomerService 反馈表单模式', () => {
  it('点问题反馈后中部换成表单，聊天输入隐藏', () => {
    const form = openFeedbackForm()

    expect(within(form).getByRole('combobox')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('输入消息，Enter 发送')).not.toBeInTheDocument()
    expect(screen.getByText('请尽量补充完整信息，当前页面上下文会随反馈一并记录。')).toBeInTheDocument()
  })

  it('必填项为空时提交被拦下，在字段旁展示错误，不打接口', () => {
    openFeedbackForm()
    fireEvent.click(screen.getByRole('button', { name: '提交反馈' }))

    const alerts = screen.getAllByRole('alert').map((el) => el.textContent)
    expect(alerts).toEqual(['请选择问题类型', '请描述遇到的问题'])
    expect(submitMock).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: '问题反馈' })).toBeInTheDocument()
  })

  it('提交成功后按服务端返回生成回执卡片并回到问答模式', async () => {
    submitMock.mockResolvedValue(serverTicket())
    openFeedbackForm()
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: '提交反馈' }))

    const receipt = await screen.findByRole('article')
    expect(within(receipt).getByText('反馈已提交')).toBeInTheDocument()
    expect(within(receipt).getByText('等待客服受理')).toBeInTheDocument()
    expect(within(receipt).getByText('FB-20260902-0007')).toBeInTheDocument()
    expect(within(receipt).getByText('预计 2 小时内响应')).toBeInTheDocument()
    expect(within(receipt).getByText('调用问题')).toBeInTheDocument()
    expect(within(receipt).getByText('调用 chat 接口一直 500')).toBeInTheDocument()

    // 入参走契约：category 是 PRD 类型名，带幂等键
    const payload = submitMock.mock.calls[0][0]
    expect(payload.category).toBe('调用问题')
    expect(payload.description).toBe('调用 chat 接口一直 500')
    expect(payload.client_submission_id).toBeTruthy()

    // 自动回到普通问答模式：聊天输入恢复，表单消失
    expect(screen.getByPlaceholderText('输入消息，Enter 发送')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '问题反馈' })).not.toBeInTheDocument()
  })

  /** 后端 9/7 才上线，接口未注册时真实表现就是 40401 —— 这条守住「不伪造成功」 */
  it('接口失败时报错并留在表单，不伪造回执', async () => {
    submitMock.mockRejectedValue(new ModelGoApiError({ code: 40401, msg: 'resource not found' }))
    openFeedbackForm()
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: '提交反馈' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('服务暂不可用，请稍后再试'))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '问题反馈' })).toBeInTheDocument()
    // 已填内容保留，便于重试
    expect(screen.getByRole('textbox', { name: '问题描述' })).toHaveValue('调用 chat 接口一直 500')
  })

  it('取消回到对话，不生成任何消息，再次进入表单是空白草稿', () => {
    openFeedbackForm()
    fireEvent.change(screen.getByRole('textbox', { name: '问题描述' }), { target: { value: '写了一半不想提了' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('region', { name: '问题反馈' })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('输入消息，Enter 发送')).toBeInTheDocument()
    expect(submitMock).not.toHaveBeenCalled()
    // 不生成消息：对话仍是空态
    expect(screen.getByText('有什么我可以帮助你的吗？')).toBeInTheDocument()
    expect(screen.queryByText('写了一半不想提了')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '问题反馈' }))
    expect(screen.getByRole('textbox', { name: '问题描述' })).toHaveValue('')
  })
})
