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

  it('does not show a notice for non-free models', () => {
    render(<FreeModelRateLimit model={{ free: false, rate_limit: { request_limit: 10, window_seconds: 60 } }} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  /**
   * 海外目录的 rate_limit 全是 null（2026-09-02 实测），整块不渲染会让用户
   * 完全不知道有限流、毫无预警被拦。降级提示只说「存在限制」，不编数值。
   */
  it('falls back to a value-free notice when the rule is missing', () => {
    const { rerender } = render(<FreeModelRateLimit model={{ free: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent('免费额度 存在调用频率限制')
    // 关键：不能编出任何数字
    expect(screen.getByRole('status').textContent).not.toMatch(/\d/)

    // 规则不完整（有窗口没额度 / 有额度没窗口）同样降级
    rerender(<FreeModelRateLimit model={{ free: true, rate_limit: { window_seconds: 60 } }} />)
    expect(screen.getByRole('status')).toHaveTextContent('存在调用频率限制')

    rerender(<FreeModelRateLimit model={{ free: true, rate_limit: { request_limit: 10 } }} />)
    expect(screen.getByRole('status')).toHaveTextContent('存在调用频率限制')
  })

  it('promotion-marked free model without rules also falls back', () => {
    render(<FreeModelRateLimit model={{ free: false, promotion: { free: true } }} />)
    expect(screen.getByRole('status')).toHaveTextContent('存在调用频率限制')
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
