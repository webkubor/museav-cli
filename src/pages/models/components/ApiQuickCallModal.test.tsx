import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } }),
}))

import { ApiQuickCallModal } from './ApiQuickCallModal'

const renderModal = (supportedProtocols: Parameters<typeof ApiQuickCallModal>[0]['supportedProtocols']) => render(
  <MemoryRouter>
    <ApiQuickCallModal open onClose={vi.fn()} modelName="m" modelId="qwen3.8-omni-flash-realtime" supportedProtocols={supportedProtocols} />
  </MemoryRouter>,
)

describe('ApiQuickCallModal 语言 Tab 按协议过滤 (prd46#1211)', () => {
  it('realtime 只给 Node.js / Python，不出现挂着 Node.js 代码的 cURL 标签', () => {
    renderModal(['dashscope_realtime'])
    expect(screen.queryByRole('tab', { name: 'cURL' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Node.js' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Python' })).toBeInTheDocument()
    expect(document.body.textContent).toContain('wss://')
  })

  it('普通对话协议仍是 cURL / Node.js / Python，默认 cURL', () => {
    renderModal(['openai_chat_completions'])
    expect(screen.getByRole('tab', { name: 'cURL' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Node.js' })).toBeInTheDocument()
  })
})
