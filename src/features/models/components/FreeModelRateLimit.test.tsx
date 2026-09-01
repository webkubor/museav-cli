import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { FreeModelRateLimit } from './FreeModelRateLimit'

i18n.changeLanguage('zh')
await loadLocaleNamespaces(['modelsExperience'])

describe('FreeModelRateLimit', () => {
  it('renders the PRD copy from a free model rate-limit rule', () => {
    render(
      <FreeModelRateLimit
        model={{ free: true, rate_limit: { request_limit: 10, token_limit: 10_000, window_seconds: 60 } }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      '免费额度 每分钟最多 10 次调用，或 10,000 Token；达到任一上限后，请耐心等待，额度恢复后即可继续使用。',
    )
  })

  it('does not show a notice for non-free models or missing rules', () => {
    const { rerender } = render(<FreeModelRateLimit model={{ free: false, rate_limit: { request_limit: 10, window_seconds: 60 } }} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    rerender(<FreeModelRateLimit model={{ free: true }} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('recognizes a promotion-marked free model when a rate-limit rule is present', () => {
    render(
      <FreeModelRateLimit
        model={{ free: false, promotion: { free: true }, rate_limit: { request_limit: 5, window_seconds: 60 } }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('免费额度 每分钟最多 5 次调用')
  })
})
