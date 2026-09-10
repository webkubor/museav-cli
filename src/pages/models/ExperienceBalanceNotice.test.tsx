/**
 * 余额拦截提示条的两套文案（需求方 #833 场景一/二）。
 *
 * 本用例存在的唯一理由是**逐字钉文案**：QA 的 V1.0.6 冒烟用例集
 * （TC-MINOR-001 / TC-MINOR-002）把这两段判为逐字比对，且其中一句在
 * PRD 表格与 PRD 原型之间**标点不一致**：
 *   PRD 5 第 1 项表：「当前模型与输入已为你保留，充值后即可继续发送。」（逗号）
 *   原型 App.tsx:16700： 「当前模型与输入已为你保留。充值后即可继续发送。」（句号）
 * 按真源优先级（原型 > 飞书文档 > 现代码）与冒烟用例集的冲突裁定 C6，取**句号**。
 * 第一版实现照 PRD 表格写成了逗号，这条测试就是防它再漂回去。
 */

import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ExperienceBalanceNotice } from './ExperienceBalanceNotice'

vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
vi.mock('@/store/use-recharge-store', () => ({
  useRechargeStore: (sel: (s: { open: () => void }) => unknown) => sel({ open: vi.fn() }),
}))
vi.mock('@/hooks/use-platform-config', () => ({ useCurrency: () => ({ symbol: '¥' }) }))

beforeAll(async () => {
  await loadLocaleNamespaces(['modelsExperience'], 'zh')
  await i18n.changeLanguage('zh')
})

describe('余额拦截提示条 · 两套文案逐字（#833）', () => {
  it('免费模型走场景一：标题点出「余额为 ¥0」，正文说明免费模型也需余额 > 0', () => {
    render(<ExperienceBalanceNotice free lockedModelCount={1} />)

    expect(screen.getByText('账户余额为 ¥0，暂时无法使用免费模型')).toBeTruthy()
    expect(
      screen.getByText('免费模型不会扣费，但使用前账户可用余额需大于 ¥0。充值后即可继续发送。', { exact: false }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '去充值' })).toBeTruthy()
  })

  it('付费模型走场景二：另一套文案，且「已为你保留」后是句号不是逗号（原型口径 C6）', () => {
    render(<ExperienceBalanceNotice free={false} lockedModelCount={1} />)

    expect(screen.getByText('余额不足，暂时无法使用当前模型')).toBeTruthy()
    // 逐字：句号版才对；逗号版（PRD 表格口径）在此转红
    expect(
      screen.getByText('当前模型与输入已为你保留。充值后即可继续发送。', { exact: false }),
    ).toBeTruthy()
  })

  it('两个分支的文案互不相同 —— 共用一套文案的实现单看任一条都会通过', () => {
    const { unmount } = render(<ExperienceBalanceNotice free lockedModelCount={1} />)
    const freeText = document.querySelector('.playground-balance-notice')?.textContent ?? ''
    unmount()

    render(<ExperienceBalanceNotice free={false} lockedModelCount={1} />)
    const paidText = document.querySelector('.playground-balance-notice')?.textContent ?? ''

    expect(freeText).not.toBe('')
    expect(freeText).not.toBe(paidText)
  })
})
