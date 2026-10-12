import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { FreeModelRateLimit } from './FreeModelRateLimit'

// 关闭状态写在 localStorage，用例之间要清掉，否则前一条的关闭会串到后一条
beforeEach(() => {
  localStorage.clear()
})

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
   * prd46#1215（2026-10-09 需求方）：没配限流规则就整块不展示。
   *
   * ⚠️ 本用例推翻了 2026-09-02 的相反断言（原：「rate_limit 缺失时降级为不含数值的
   * 提示」，理由是用户会毫无预警被拦）。新口径的逻辑是：后端没配规则就不会执行限流，
   * 这时显示「存在限制」本身是错误信息。生产国际站实测，唯一的免费模型
   * `minimax-m3:free` 的 rate_limit 正是 null —— 改完该提示在国际站完全消失，是预期结果。
   */
  it('renders nothing when the free model has no rate-limit rule', () => {
    const { rerender } = render(<FreeModelRateLimit model={{ free: true }} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // promotion 标记的限免模型同样不展示（国际站 minimax-m3:free 就是这一形状）
    rerender(<FreeModelRateLimit model={{ free: false, promotion: { free: true } }} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  /**
   * 分寸没变：规则对象**在**、只是数值不全时仍要提示——那说明规则是配了的、约束真实存在，
   * 只是数值取不全，此时不编造数字但保留提示。这一半与 2026-09-02 的决策一致。
   */
  it('keeps a value-free notice when the rule exists but is incomplete', () => {
    const { rerender } = render(<FreeModelRateLimit model={{ free: true, rate_limit: { window_seconds: 60 } }} />)
    expect(screen.getByRole('status')).toHaveTextContent('存在调用频率限制')
    // 关键：不能编出任何数字
    expect(screen.getByRole('status').textContent).not.toMatch(/\d/)

    rerender(<FreeModelRateLimit model={{ free: true, rate_limit: { request_limit: 10 } }} />)
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

  it('hides the notice when the user dismisses it with the close button', () => {
    render(<FreeModelRateLimit model={{ free: true, rate_limit: { request_limit: 10, window_seconds: 60 } }} />)

    fireEvent.click(screen.getByRole('button', { name: '关闭免费额度提示' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('stays hidden after a reload once the user has dismissed it', () => {
    const { unmount } = render(<FreeModelRateLimit model={{ free: true, rate_limit: { request_limit: 10, window_seconds: 60 } }} />)
    fireEvent.click(screen.getByRole('button', { name: '关闭免费额度提示' }))
    unmount()

    // 模拟刷新页面：重新挂载组件，关闭状态应从 localStorage 读回
    render(<FreeModelRateLimit model={{ free: true, rate_limit: { request_limit: 10, window_seconds: 60 } }} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

/**
 * 英文语境下不能用全角分号。原先分隔符硬编码成「；」，海外站会渲染出
 * "rate limits apply；Once a limit is reached..."（2026-09-02 生产实测）。
 */
describe('FreeModelRateLimit（英文）', () => {
  it('uses a half-width separator in English', async () => {
    await i18n.changeLanguage('en')
    // 切语言后要重新加载该语言的命名空间，否则 t() 吐回 key 本身
    await loadLocaleNamespaces(['modelsExperience'])
    // 本用例查的是 rateLimit.unknown 那句降级文案里的分隔符。
    // prd46#1215 起「没有 rate_limit」整块不渲染，所以不能再传空模型；
    // 给一条**不完整**的规则（有窗口无额度）即可命中 unknown 分支并保留原断言语义。
    render(<FreeModelRateLimit model={{ free: true, rate_limit: { window_seconds: 60 } }} />)
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).not.toContain('；')
    expect(text).toContain('; ')
    expect(text).toContain('rate limits apply')
    await i18n.changeLanguage('zh')
    await loadLocaleNamespaces(['modelsExperience'])
  })
})
