import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))

import { FeedbackForm } from './feedback-form'
import { ATTACHMENT_MAX_BYTES } from './feedback-attachment'

const ATTACHMENT_LABEL = 'common.customerService.feedback.attachment'

function renderForm(onSubmit = vi.fn().mockResolvedValue(true)) {
  render(<FeedbackForm submitting={false} onCancel={vi.fn()} onSubmit={onSubmit} />)
  return onSubmit
}

describe('FeedbackForm · 附件', () => {
  it('拒绝不支持的类型并提示，不保留该文件', () => {
    renderForm()
    const input = screen.getByLabelText(ATTACHMENT_LABEL) as HTMLInputElement
    const bad = new File(['x'], 'a.exe', { type: 'application/x-msdownload' })
    fireEvent.change(input, { target: { files: [bad] } })
    expect(screen.getByText('common.customerService.feedback.attachmentInvalid')).toBeInTheDocument()
    expect(screen.queryByText('a.exe')).not.toBeInTheDocument()
  })

  it('拒绝超过 5MB 的文件并提示', () => {
    renderForm()
    const input = screen.getByLabelText(ATTACHMENT_LABEL) as HTMLInputElement
    const big = new File([new Uint8Array(ATTACHMENT_MAX_BYTES + 1)], 'big.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [big] } })
    expect(screen.getByText('common.customerService.feedback.attachmentTooLarge')).toBeInTheDocument()
  })

  it('选中合法文件后展示文件名，点移除按钮清空', () => {
    renderForm()
    const input = screen.getByLabelText(ATTACHMENT_LABEL) as HTMLInputElement
    const ok = new File(['png'], 'shot.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [ok] } })
    expect(screen.getByText('shot.png')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.customerService.feedback.attachmentClear'))
    expect(screen.queryByText('shot.png')).not.toBeInTheDocument()
    expect(screen.getByText('common.customerService.feedback.attachmentPlaceholder')).toBeInTheDocument()
  })
})
