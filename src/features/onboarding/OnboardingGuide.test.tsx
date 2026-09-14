/**
 * 新手指南气泡与领取成功弹框的行为测试。
 *
 * 钉住的是三条**改过就会静默退化**的规格要求（浏览器里都验过，这里固化成回归网）：
 *   §5.2  打开气泡后焦点进标题，不落在关闭按钮上
 *   §14   弹框打开后主按钮拿焦点；Escape / 次按钮均可关闭
 *   §5.3  可领取态才允许点「领取」，未满足时按钮禁用
 *
 * ⚠️ 焦点这块特别容易回归：曾经把 focus 裹在 requestAnimationFrame 里（页面不可见时
 * rAF 根本不触发），也曾把回调放进 effect 依赖数组（内联箭头每渲染都变，cleanup 反复
 * 抢焦点）。两种写法在正常前台窗口里"看着像对的"，只有这类断言能拦住。
 */

import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { OnboardingGuide, OnboardingRewardSuccessDialog } from './OnboardingGuide'
import { toOnboardingGuideState } from '@/services/onboarding'
import {
  completeOnboardingStep,
  ONBOARDING_STEP_ORDER,
  type OnboardingGuideState,
} from './onboarding-guide-domain'

beforeAll(async () => {
  await loadLocaleNamespaces(['onboarding'], 'zh')
  await i18n.changeLanguage('zh')
})

function guideWith(count: number): OnboardingGuideState {
  return ONBOARDING_STEP_ORDER.slice(0, count).reduce(
    (g, stepKey, i) =>
      completeOnboardingStep(g, {
        stepKey,
        completedAt: `2026-08-06T00:0${i + 1}:00.000Z`,
        completedBy: 'tester',
        evidenceType: 'test',
        evidenceId: `e-${stepKey}`,
      }),
    toOnboardingGuideState(
      {
        status: 'eligible',
        guide_version: 'v1',
        eligible_at: '2026-08-06T00:00:00.000Z',
        completed_steps: [],
        reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
      },
      { tenantId: 't-1', tenantKind: 'personal', site: 'domestic' },
    ) as OnboardingGuideState,
  )
}

function renderGuide(completed: number, overrides: Partial<Parameters<typeof OnboardingGuide>[0]> = {}) {
  return render(
    <OnboardingGuide
      collapsed={false}
      guide={guideWith(completed)}
      open
      onClaim={vi.fn()}
      onOpenChange={vi.fn()}
      onStepAction={vi.fn()}
      {...overrides}
    />,
  )
}

describe('任务气泡', () => {
  it('打开后焦点落在标题上，不落在关闭按钮上（规格 §5.2）', async () => {
    renderGuide(2)
    const heading = screen.getByRole('heading', { name: '新手指南' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '关闭新手指南' }))
  })

  it('未满五步时领取按钮禁用，并提示还差几项', () => {
    renderGuide(2)
    const claim = screen.getByRole('button', { name: /领取 ¥10/ })
    expect(claim).toBeDisabled()
    expect(screen.getByText('再完成 3 项即可领取')).toBeInTheDocument()
  })

  it('五步齐了按钮可用，点击回调拿到调用', () => {
    const onClaim = vi.fn()
    renderGuide(5, { onClaim })
    const claim = screen.getByRole('button', { name: /领取 ¥10/ })
    expect(claim).toBeEnabled()
    fireEvent.click(claim)
    expect(onClaim).toHaveBeenCalledTimes(1)
  })

  it('已完成的步骤不再给 CTA，只显示完成态', () => {
    renderGuide(2)
    expect(screen.getAllByText('完成')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /去浏览/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /去创建/ })).toBeInTheDocument()
  })

  it('Escape 关闭气泡', () => {
    const onOpenChange = vi.fn()
    renderGuide(2, { onOpenChange })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('点气泡外面才关闭', () => {
    const onOpenChange = vi.fn()
    renderGuide(2, { onOpenChange })
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  /**
   * 控制台里侧栏入口是**两份实例**：DashboardLayout 桌面侧栏 + 移动抽屉（抽屉常驻
   * DOM，只是 translate 出屏），而 open 是 store 里的单份状态 —— 两份会同时打开、
   * 各自往 document 注册一个「点外面就关」的 pointerdown 监听。
   * 监听只比自己的 ref 时，抽屉那份把桌面那份气泡里的点击当成外部点击、在
   * pointerdown 阶段就关掉气泡，按钮在 click 派发前被卸载 ⇒ 五步 CTA 与「领取」
   * 在控制台内全点不动（测试环境实测：pointerdown 有、click 根本没派发）。
   */
  it('两份实例共存时，点其中一个气泡内部不被另一份判成外部点击', () => {
    const onOpenChange = vi.fn()
    const onStepAction = vi.fn()
    renderGuide(1, { onOpenChange, onStepAction })
    renderGuide(1, { onOpenChange, onStepAction })

    const cta = screen.getAllByRole('button', { name: /去体验/ })[0]
    fireEvent.pointerDown(cta)
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(cta)
    expect(onStepAction).toHaveBeenCalledWith('playground')
  })
})

describe('领取成功弹框（2026-08-13 规格）', () => {
  function renderDialog(props: Partial<Parameters<typeof OnboardingRewardSuccessDialog>[0]> = {}) {
    const onDismiss = vi.fn()
    const onViewCredit = vi.fn()
    render(
      <OnboardingRewardSuccessDialog
        open
        rewardLabel="¥10"
        onDismiss={onDismiss}
        onViewCredit={onViewCredit}
        {...props}
      />,
    )
    return { onDismiss, onViewCredit }
  }

  it('文案与按钮按规格定稿，且是 aria-modal 对话框', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: '新手奖励领取成功' })).toBeInTheDocument()
    expect(screen.getByText('¥10')).toBeInTheDocument()
    expect(screen.getByText('已存入赠送余额')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看赠金' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '稍后查看' })).toBeInTheDocument()
  })

  it('打开后主按钮拿焦点（不依赖 requestAnimationFrame）', async () => {
    renderDialog()
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '查看赠金' })),
    )
  })

  it('Escape 关闭，且回调用的是最新的一份（不因内联箭头函数而失效）', () => {
    const first = vi.fn()
    const { rerender } = render(
      <OnboardingRewardSuccessDialog open rewardLabel="¥10" onDismiss={first} onViewCredit={vi.fn()} />,
    )
    const latest = vi.fn()
    rerender(
      <OnboardingRewardSuccessDialog open rewardLabel="¥10" onDismiss={latest} onViewCredit={vi.fn()} />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(latest).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('「稍后查看」只关闭不跳转；「查看赠金」走跳转回调', () => {
    const { onDismiss, onViewCredit } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '稍后查看' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onViewCredit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '查看赠金' }))
    expect(onViewCredit).toHaveBeenCalledTimes(1)
  })

  it('open=false 时不渲染任何东西', () => {
    render(
      <OnboardingRewardSuccessDialog
        open={false}
        rewardLabel="¥10"
        onDismiss={vi.fn()}
        onViewCredit={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
