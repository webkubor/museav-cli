/**
 * 新手指南入口与任务气泡 —— 从 PRD 原型 1:1 移植。
 * 路由：全局（侧栏底部 variant="sidebar"；公开模型广场 variant="floating"）
 * API：无（本轮全 Mock）
 *
 * 来源：modelgo_prd/src/OnboardingGuide.tsx（325 行）
 * 规格：2026-08-06-onboarding-guide-reward-design.md §5（入口/气泡/三态）
 *      2026-08-13-onboarding-reward-balance-guide-design.md（领取成功弹框）
 *
 * ⚠️ 同模型发现页，属「1:1 复刻原型」的**显式例外**（需求方 2026-08-27 明确要求）。
 * 结构、类名、DOM 层级照抄原型，只做两处必要替换：
 *   · lucide-react → react-icons/lu（本仓通用 UI 图标铁律，DESIGN.md）
 *   · 硬编码中文 → i18n（海外站要出英文；奖励金额本来就读快照不硬编码）
 * 样式在同目录 onboarding-guide.css，变量桥接到控制台 token。
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  LuChevronRight,
  LuCircle,
  LuCircleCheck,
  LuCoins,
  LuGift,
  LuLockKeyhole,
  LuX,
} from 'react-icons/lu'
import {
  ONBOARDING_STEP_ORDER,
  formatOnboardingReward,
  type OnboardingGuideState,
  type OnboardingStepKey,
} from './onboarding-guide-domain'
import './onboarding-guide.css'

export interface OnboardingGuideProps {
  guide: OnboardingGuideState
  open: boolean
  collapsed: boolean
  variant?: 'sidebar' | 'floating'
  onOpenChange: (open: boolean) => void
  onStepAction: (step: OnboardingStepKey) => void
  onClaim: () => void
}

export interface OnboardingRewardSuccessDialogProps {
  open: boolean
  rewardLabel: string
  onDismiss: () => void
  onViewCredit: () => void
}

/**
 * 领取成功弹框。文案由 2026-08-13 规格定死：标题「新手奖励领取成功」、
 * 内容「{金额} 已存入赠送余额」、主按钮「查看赠金」、次按钮「稍后查看」。
 * 打开后主按钮拿焦点，支持 Escape / 遮罩点击 / 次按钮三种关闭。
 */
export function OnboardingRewardSuccessDialog({
  open,
  rewardLabel,
  onDismiss,
  onViewCredit,
}: OnboardingRewardSuccessDialogProps) {
  const { t } = useTranslation()
  const primaryActionRef = useRef<HTMLButtonElement>(null)

  /**
   * ⚠️ 回调走 ref、effect 只依赖 open —— 不能照原型把 onDismiss 放进依赖数组。
   * 调用方常传内联箭头函数，每次渲染都是新引用 → effect 反复重跑 → cleanup 里的
   * `previousFocus.focus()` 每轮都执行一次，把用户当前的焦点位置抢走。
   */
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!open) return
    // 只认真正可聚焦的来源；body / 已卸载节点不作数，避免关闭时把焦点扔回文档根
    const opener = document.activeElement
    const previousFocus =
      opener instanceof HTMLElement && opener !== document.body ? opener : null
    // 直接聚焦，不裹 requestAnimationFrame：createPortal 的节点在 effect 执行时已经
    // 进了 DOM，不需要等一帧；而 rAF 在页面不可见时**根本不触发**（后台标签页、
    // 隐藏的预览窗格），裹一层等于「切到后台再打开弹框就没有焦点」。浏览器验收时
    // 正是这条让 activeElement 停在 BODY。
    primaryActionRef.current?.focus()
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') dismissRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      // 关闭后焦点还给打开它的控件（规格 §14）；节点已从文档移除时不强抢
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="onboarding-reward-success-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss()
      }}
      role="presentation"
    >
      <section
        aria-labelledby="onboarding-reward-success-title"
        aria-modal="true"
        className="onboarding-reward-success-modal"
        role="dialog"
      >
        <div className="onboarding-reward-success-head">
          <h2 id="onboarding-reward-success-title">{t('onboarding.rewardSuccess.title')}</h2>
          <button
            aria-label={t('onboarding.close')}
            className="onboarding-reward-success-close"
            onClick={onDismiss}
            type="button"
          >
            <LuX size={15} />
          </button>
        </div>
        <div className="onboarding-reward-success-body">
          <div className="onboarding-reward-success-result">
            <span className="onboarding-reward-success-icon" aria-hidden="true">
              <LuCircleCheck size={18} />
            </span>
            <p>
              <strong>{rewardLabel}</strong>
              <span>{t('onboarding.rewardSuccess.credited')}</span>
            </p>
          </div>
        </div>
        <div className="onboarding-reward-success-actions">
          <button className="secondary" onClick={onDismiss} type="button">
            {t('onboarding.rewardSuccess.later')}
          </button>
          <button className="primary" onClick={onViewCredit} ref={primaryActionRef} type="button">
            {t('onboarding.rewardSuccess.viewCredit')}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function OnboardingGuide({
  guide,
  open,
  collapsed,
  variant = 'sidebar',
  onOpenChange,
  onStepAction,
  onClaim,
}: OnboardingGuideProps) {
  const { t } = useTranslation()
  const entryRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>()
  const openChangeRef = useRef(onOpenChange)
  useEffect(() => {
    openChangeRef.current = onOpenChange
  }, [onOpenChange])
  const completedStepKeys = useMemo(
    () => new Set(guide.completedSteps.map((item) => item.stepKey)),
    [guide.completedSteps],
  )
  const completedCount = completedStepKeys.size
  const totalSteps = ONBOARDING_STEP_ORDER.length
  const rewardLabel = formatOnboardingReward(guide.reward)
  const floating = variant === 'floating'

  useEffect(() => {
    if (!open) return

    // 气泡从入口右侧展开，按入口的实际位置定位（规格 §14：右侧空间不足时
    // 由 CSS 的 820px 断点接管贴左下，避免产生整页横向滚动）
    const positionPopover = () => {
      const rect = entryRef.current?.getBoundingClientRect()
      if (!rect) return
      setPopoverStyle({
        left: Math.round(rect.right + 12),
        bottom: Math.max(16, Math.round(window.innerHeight - rect.bottom)),
      })
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') openChangeRef.current(false)
    }
    /**
     * ⚠️ 认的是「任意一个指南入口/气泡」，不是自己这一份 ref —— 别改回比 ref。
     * open 是 store 里的单份状态，而侧栏入口在 DashboardLayout 里挂了**两份**实例
     * （桌面常驻 + 移动抽屉：抽屉一直在 DOM 里，只是 translate 出屏），两份都会注册
     * 这个监听。只比自己的 ref 时，抽屉那份会把「点在桌面那份气泡里」判成外部点击，
     * 抢在 pointerdown 阶段把气泡卸载掉 —— 按钮在 pointerdown 与 click 之间消失，
     * click 永远派发不到 CTA 上，于是控制台内五步与「领取」全点不动（模型广场走
     * PublicShell，只有一份悬浮入口，所以那里是好的）。
     */
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      const insideGuide =
        target instanceof Element &&
        target.closest('.onboarding-guide-entry, .onboarding-guide-popover') !== null
      if (!insideGuide) openChangeRef.current(false)
    }

    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    // 焦点进标题而不是关闭按钮（规格 §5.2：别让默认焦点环落在 X 上）。
    // 同弹框：不裹 rAF，页面不可见时 rAF 不触发。
    headingRef.current?.focus()

    return () => {
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
    // 同上：只依赖 open。onOpenChange 进依赖数组的话，父组件每次重渲染都会重跑这个
    // effect，末尾那句 requestAnimationFrame(focus 标题) 会把用户已经 Tab 到的位置抢回
    // 标题上 —— 气泡里有 6 个可聚焦控件，键盘用户会被反复弹回开头。
  }, [open])

  const popover = open ? (
    <div
      aria-labelledby="onboarding-guide-title"
      aria-modal="false"
      className="onboarding-guide-popover"
      ref={popoverRef}
      role="dialog"
      style={popoverStyle}
    >
      <header className="onboarding-guide-header">
        <div className="onboarding-guide-title-block">
          <div className="onboarding-guide-title-row">
            <h2 id="onboarding-guide-title" ref={headingRef} tabIndex={-1}>
              {t('onboarding.title')}
            </h2>
            <span className="onboarding-guide-header-tag">{t('onboarding.quickStartTag')}</span>
          </div>
          <p>{t('onboarding.subtitle', { count: totalSteps, reward: rewardLabel })}</p>
        </div>
        <button
          aria-label={t('onboarding.closeGuide')}
          className="onboarding-guide-close"
          onClick={() => onOpenChange(false)}
          type="button"
        >
          <LuX size={17} />
        </button>
      </header>

      <ol className="onboarding-guide-steps">
        {ONBOARDING_STEP_ORDER.map((stepKey, index) => {
          const completed = completedStepKeys.has(stepKey)
          return (
            <li className={`onboarding-guide-step${completed ? ' completed' : ''}`} key={stepKey}>
              <span className="onboarding-guide-step-marker" aria-hidden="true">
                {completed ? <LuCircleCheck size={20} /> : <LuCircle size={20} />}
              </span>
              <div className="onboarding-guide-step-copy">
                <strong>
                  {index + 1}. {t(`onboarding.steps.${stepKey}.title`)}
                </strong>
                <span>
                  {completed
                    ? t('onboarding.stepCompleted')
                    : t(`onboarding.steps.${stepKey}.description`)}
                </span>
              </div>
              {!completed ? (
                <button onClick={() => onStepAction(stepKey)} type="button">
                  {t(`onboarding.steps.${stepKey}.action`)}
                  <LuChevronRight size={14} />
                </button>
              ) : (
                <span className="onboarding-guide-done">{t('onboarding.stepDone')}</span>
              )}
            </li>
          )
        })}
      </ol>

      <section
        className={`onboarding-guide-reward${guide.status === 'claimable' ? ' claimable' : ''}`}
      >
        <div>
          <span className="onboarding-guide-reward-icon" aria-hidden="true">
            {guide.status === 'claimable' ? <LuGift size={18} /> : <LuLockKeyhole size={17} />}
          </span>
          <div>
            <strong>
              {totalSteps + 1}. {t('onboarding.reward.title')}
            </strong>
            <span>
              {guide.status === 'claimable'
                ? t('onboarding.reward.claimable', { reward: rewardLabel })
                : t('onboarding.reward.remaining', { count: totalSteps - completedCount })}
            </span>
          </div>
        </div>
        <button
          className="onboarding-guide-claim"
          disabled={guide.status !== 'claimable'}
          onClick={onClaim}
          type="button"
        >
          {t('onboarding.reward.claim', { reward: rewardLabel })}
        </button>
      </section>
    </div>
  ) : null

  return (
    <div
      className={`onboarding-guide-anchor${floating ? ' floating' : ''}${!floating && collapsed ? ' collapsed' : ''}`}
    >
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('onboarding.entryLabel', { reward: rewardLabel })}
        className="onboarding-guide-entry"
        onClick={() => onOpenChange(!open)}
        ref={entryRef}
        // 侧栏收起态只剩图标，进度靠 Tooltip 传达（规格 §5.1）
        title={
          !floating && collapsed
            ? t('onboarding.entryTooltip', { completed: completedCount, total: totalSteps })
            : undefined
        }
        type="button"
      >
        <span className="onboarding-guide-entry-icon" aria-hidden="true">
          <LuCoins size={18} />
        </span>
        <strong className="onboarding-guide-entry-label">{t('onboarding.entryLabel', { reward: rewardLabel })}</strong>
        {!floating ? (
          <span className="onboarding-guide-entry-progress">
            {completedCount}/{totalSteps}
          </span>
        ) : null}
      </button>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </div>
  )
}
