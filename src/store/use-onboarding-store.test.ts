/**
 * 蕴含步骤补报（shared/modelgo_prd#1058：完成 ⑤ 之后 ④ 自动完成）。
 *
 * 钉的是**发不发那一次补报请求**，不是领域层算得对不对（那在 onboarding-guide-domain.test.ts）。
 * 两条路径都要钉：⑤ 刚上报完的、以及已经卡在 4/5 的存量租户拉到指南时。少钉后者的话，
 * 线上那些 ⑤ 已完成的租户永远领不到奖励，而单测照样全绿。
 *
 * 还钉两条反向防线：
 *   · ⑤ 上报失败（回滚）不许补 ④ —— 否则等于凭一次失败的调用发钱；
 *   · 补出来的 ④ 不许再触发一轮对账 —— 递归必须自己收敛，不靠额外状态挡。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackEvent = vi.fn()
vi.mock('@/lib/track', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }))

const getOnboardingGuide = vi.fn()
const completeOnboardingStepApi = vi.fn()
vi.mock('@/services/onboarding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/onboarding')>()
  return {
    ...actual,
    getOnboardingGuide: (...args: unknown[]) => getOnboardingGuide(...args),
    completeOnboardingStepApi: (...args: unknown[]) => completeOnboardingStepApi(...args),
  }
})

import { useAuthStore } from '@/store/auth'
import {
  ONBOARDING_IMPLIED_EVIDENCE_PREFIX,
  useOnboardingStore,
} from '@/store/use-onboarding-store'
import { ONBOARDING_STEP_KEY_TO_API, toOnboardingGuideState } from '@/services/onboarding'
import type {
  OnboardingGuideState,
  OnboardingGuideStatus,
  OnboardingStepKey,
} from '@/features/onboarding/onboarding-guide-domain'

const TENANT_ID = 'ten_1'

function guide(
  completed: OnboardingStepKey[],
  status: OnboardingGuideStatus = 'in_progress',
): OnboardingGuideState {
  return {
    tenantId: TENANT_ID,
    tenantKind: 'personal',
    guideVersion: 'v1',
    eligibleAt: '2026-09-17T00:00:00Z',
    status,
    reward: { site: 'domestic', currency: 'CNY', amount: 10, configVersion: 'v1' },
    completedSteps: completed.map((stepKey) => ({ stepKey })),
  }
}

/** 第 ⑤ 步完成、第 ④ 步没完成 —— #1058 的现场 */
const STUCK_AT_FOUR: OnboardingStepKey[] = ['marketplace', 'playground', 'api_key', 'request_log']

function ensureGuide() {
  useOnboardingStore
    .getState()
    .ensureGuide({ tenantId: TENANT_ID, tenantKind: 'personal', site: 'domestic' })
}

/** 让存量对账跑起来：清掉本地 guide，让 ensureGuide 的 GET 回同一份进度 */
function ensureGuideFromLocal() {
  const current = useOnboardingStore.getState().guides[TENANT_ID]
  useOnboardingStore.setState({ guides: {} })
  getOnboardingGuide.mockResolvedValue({ guide: current, autoOpen: false })
  ensureGuide()
}

function reportedSteps() {
  return completeOnboardingStepApi.mock.calls.map((call) => call[1] as OnboardingStepKey)
}

/** 服务端权威回包：completed_steps 用后端的 step_key 命名 */
function authoritative(completed: OnboardingStepKey[], status: OnboardingGuideStatus) {
  return toOnboardingGuideState(
    {
      status,
      guide_version: 'v1',
      eligible_at: '2026-09-17T00:00:00Z',
      completed_steps: completed.map((key) => ONBOARDING_STEP_KEY_TO_API[key]),
      reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
    },
    { tenantId: TENANT_ID, tenantKind: 'personal', site: 'domestic' },
  )
}

function liveSteps() {
  return useOnboardingStore.getState().guides[TENANT_ID]?.completedSteps.map((s) => s.stepKey)
}

beforeEach(() => {
  trackEvent.mockReset()
  getOnboardingGuide.mockReset()
  completeOnboardingStepApi.mockReset()
  // 服务端不回权威状态：本地保留乐观值，等价于 BFF 只回 code=0 空 data 的那条路径
  completeOnboardingStepApi.mockResolvedValue(null)
  useOnboardingStore.setState({
    guides: {},
    trackRoles: {},
    open: false,
    pendingAutoOpen: null,
    rewardReceipt: null,
    billingHighlight: null,
    loadingTenants: {},
    guidelessTenants: {},
    claimingTenants: {},
  })
  useAuthStore.setState({
    isAuthenticated: true,
    activeTenantId: TENANT_ID,
    account: { account_id: 'a-1', email: 'dev@example.com' },
  } as never)
})

describe('存量对账：拉到指南时补齐被蕴含的步骤', () => {
  it('⑤ 完成而 ④ 没完成 → 补报 ④，本地进度变成可领取', async () => {
    getOnboardingGuide.mockResolvedValue({ guide: guide(STUCK_AT_FOUR), autoOpen: false })
    ensureGuide()

    await vi.waitFor(() => expect(reportedSteps()).toEqual(['quick_connect']))
    expect(completeOnboardingStepApi.mock.calls[0]?.[2]).toEqual({
      // 前缀 + 触发方的后端 step_key，让 billing / 漏斗认得出这条不是用户直接做的
      evidenceType: `${ONBOARDING_IMPLIED_EVIDENCE_PREFIX}call_and_view_log`,
      // 存量这条路服务端不回 evidence，退回触发方的 step_key，不留空值
      evidenceId: 'call_and_view_log',
    })
    await vi.waitFor(() =>
      expect(useOnboardingStore.getState().guides[TENANT_ID]?.status).toBe('claimable'),
    )
  })

  it('④ 本来就完成了 → 不发多余请求', async () => {
    getOnboardingGuide.mockResolvedValue({
      guide: guide([...STUCK_AT_FOUR, 'quick_connect']),
      autoOpen: false,
    })
    ensureGuide()

    await vi.waitFor(() => expect(useOnboardingStore.getState().guides[TENANT_ID]).toBeDefined())
    expect(completeOnboardingStepApi).not.toHaveBeenCalled()
  })

  it('已领取的租户不补 —— 状态机只向前，补了也不改变结果', async () => {
    getOnboardingGuide.mockResolvedValue({
      guide: guide(STUCK_AT_FOUR, 'rewarded'),
      autoOpen: false,
    })
    ensureGuide()

    await vi.waitFor(() => expect(useOnboardingStore.getState().guides[TENANT_ID]).toBeDefined())
    expect(completeOnboardingStepApi).not.toHaveBeenCalled()
  })

  it('企业 Member / 未取得资格（guide 为 null）不补', async () => {
    getOnboardingGuide.mockResolvedValue({ guide: null, autoOpen: false })
    ensureGuide()

    await vi.waitFor(() =>
      expect(useOnboardingStore.getState().guidelessTenants[TENANT_ID]).toBe(true),
    )
    expect(completeOnboardingStepApi).not.toHaveBeenCalled()
  })
})

describe('新完成 ⑤：上报成功后顺带点亮 ④', () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      guides: { [TENANT_ID]: guide(['marketplace', 'playground', 'api_key']) },
    })
  })

  function completeRequestLog() {
    useOnboardingStore.getState().completeStep({
      tenantId: TENANT_ID,
      stepKey: 'request_log',
      evidenceType: 'request_log_opened',
      evidenceId: 'req-1',
      completedBy: 'dev@example.com',
    })
  }

  it('⑤ 上报成功 → ④ 自动补上，且补出来的那步不再触发新一轮（恰好两次请求）', async () => {
    completeRequestLog()

    await vi.waitFor(() => expect(reportedSteps()).toEqual(['request_log', 'quick_connect']))
    await vi.waitFor(() =>
      expect(useOnboardingStore.getState().guides[TENANT_ID]?.status).toBe('claimable'),
    )
    // 再等一轮微任务，确认没有第三次（递归靠「只有触发方对账」收敛，不靠额外状态）
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(completeOnboardingStepApi).toHaveBeenCalledTimes(2)
  })

  it('⑤ 上报失败（本地回滚）→ 不许补 ④：凭一次没落库的调用点亮别的步骤等于凭空发奖', async () => {
    completeOnboardingStepApi.mockRejectedValueOnce(new Error('boom'))
    completeRequestLog()

    await vi.waitFor(() =>
      expect(
        useOnboardingStore.getState().guides[TENANT_ID]?.completedSteps.map((s) => s.stepKey),
      ).toEqual(['marketplace', 'playground', 'api_key']),
    )
    expect(reportedSteps()).toEqual(['request_log'])
  })
})

/**
 * 服务端权威回包这条路 —— 真实环境走的就是它（BFF 每次 POST 都回完整 guide），
 * 而上面那些用例全程 mock 成 null（等价于 BFF 回空 data 的少见分支）。
 * 本改动让「同一租户背靠背两次 POST」成为常态，乱序保护从边角变成热路径，必须钉住。
 */
describe('服务端权威回包与乱序', () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      guides: { [TENANT_ID]: guide(['marketplace', 'playground', 'api_key']) },
    })
  })

  it('⑤ 回 4 步权威、④ 回 5 步权威 → 终态是服务端那份，不是本地乐观值', async () => {
    /**
     * 本地故意只有两步，且**没有** marketplace —— 它只可能来自服务端（企业里另一个
     * 管理员在别的标签页点亮的）。断言它出现在本地，才真的证明「权威回包整份覆盖了
     * 乐观值」这条路跑通了；只断言「5 步 claimable」的话，乐观更新自己也凑得出来，
     * 把整个覆盖分支删掉测试照样全绿。
     */
    useOnboardingStore.setState({ guides: { [TENANT_ID]: guide(['playground', 'api_key']) } })
    completeOnboardingStepApi.mockImplementation((_ctx: unknown, stepKey: OnboardingStepKey) =>
      Promise.resolve(
        stepKey === 'request_log'
          ? authoritative(['marketplace', 'playground', 'api_key', 'request_log'], 'in_progress')
          : authoritative(
              ['marketplace', 'playground', 'api_key', 'request_log', 'quick_connect'],
              'claimable',
            ),
      ),
    )

    useOnboardingStore.getState().completeStep({
      tenantId: TENANT_ID,
      stepKey: 'request_log',
      evidenceType: 'request_log_opened',
      evidenceId: 'req-1',
      completedBy: 'dev@example.com',
    })

    await vi.waitFor(() => expect(liveSteps()).toHaveLength(5))
    expect(liveSteps()).toContain('marketplace')
    expect(useOnboardingStore.getState().guides[TENANT_ID]?.status).toBe('claimable')
  })

  it('先回的权威不含后一步 → 不许把刚打上的勾抹掉', async () => {
    // ④ 的回包（不含 ⑤）故意晚于 ⑤ 的乐观更新到达
    let resolveQuickConnect: ((value: unknown) => void) | undefined
    completeOnboardingStepApi.mockImplementation((_ctx: unknown, stepKey: OnboardingStepKey) => {
      if (stepKey === 'quick_connect') {
        return new Promise((resolve) => {
          resolveQuickConnect = resolve
        })
      }
      return Promise.resolve(null)
    })

    const store = useOnboardingStore.getState()
    store.completeStep({
      tenantId: TENANT_ID,
      stepKey: 'quick_connect',
      evidenceType: 'quick_connect_copied',
      evidenceId: 'mgc',
      completedBy: 'dev@example.com',
    })
    store.completeStep({
      tenantId: TENANT_ID,
      stepKey: 'request_log',
      evidenceType: 'request_log_opened',
      evidenceId: 'req-1',
      completedBy: 'dev@example.com',
    })
    await vi.waitFor(() => expect(liveSteps()).toHaveLength(5))

    // ④ 的回包此刻才到，里面没有 ⑤ —— 覆盖下去就等于「完成了又退回去」
    resolveQuickConnect?.(
      authoritative(['marketplace', 'playground', 'api_key', 'quick_connect'], 'in_progress'),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(liveSteps()).toHaveLength(5)
    expect(useOnboardingStore.getState().guides[TENANT_ID]?.status).toBe('claimable')
  })
})

describe('补报失败的回滚', () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      guides: { [TENANT_ID]: guide(['playground', 'api_key', 'request_log']) },
    })
  })

  it('④ 补报失败 → 摘掉本地那个勾，不留服务端没有的假勾', async () => {
    completeOnboardingStepApi.mockRejectedValue(new Error('boom'))
    ensureGuideFromLocal()

    await vi.waitFor(() => expect(reportedSteps()).toEqual(['quick_connect']))
    await vi.waitFor(() =>
      expect(liveSteps()).toEqual(['playground', 'api_key', 'request_log']),
    )
    expect(useOnboardingStore.getState().guides[TENANT_ID]?.status).toBe('in_progress')
  })

  it('补报在途时用户又完成了别的步骤 → 回滚仍要摘掉 ④，不能因为引用变了就整个跳过', async () => {
    let rejectQuickConnect: ((reason: unknown) => void) | undefined
    completeOnboardingStepApi.mockImplementation((_ctx: unknown, stepKey: OnboardingStepKey) => {
      if (stepKey === 'quick_connect') {
        return new Promise((_resolve, reject) => {
          rejectQuickConnect = reject
        })
      }
      return Promise.resolve(null)
    })
    ensureGuideFromLocal()
    await vi.waitFor(() => expect(reportedSteps()).toEqual(['quick_connect']))

    // 补报在途期间用户进了模型广场 —— guide 的引用被换掉
    useOnboardingStore.getState().completeStep({
      tenantId: TENANT_ID,
      stepKey: 'marketplace',
      evidenceType: 'page_visit',
      evidenceId: 'marketplace',
      completedBy: 'dev@example.com',
    })
    await vi.waitFor(() => expect(liveSteps()).toHaveLength(5))

    rejectQuickConnect?.(new Error('boom'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // ④ 必须被摘掉，否则本地 claimable / 服务端 4 步，点领取拿 400 且整个会话不自愈
    expect(liveSteps()).not.toContain('quick_connect')
    expect(useOnboardingStore.getState().guides[TENANT_ID]?.status).toBe('in_progress')
  })
})

describe('埋点口径', () => {
  it('补报也发一条 onboarding_step_completed，但 evidence_type 带 implied_ 前缀可供漏斗排除', async () => {
    useOnboardingStore.setState({
      guides: { [TENANT_ID]: guide(['marketplace', 'playground', 'api_key']) },
    })
    useOnboardingStore.getState().completeStep({
      tenantId: TENANT_ID,
      stepKey: 'request_log',
      evidenceType: 'request_log_opened',
      evidenceId: 'req-1',
      completedBy: 'dev@example.com',
    })

    await vi.waitFor(() => expect(reportedSteps()).toHaveLength(2))
    const implied = trackEvent.mock.calls.find(
      (call) => call[0] === 'onboarding_step_completed' && call[1]?.step_key === 'quick_connect',
    )
    expect(implied?.[1]?.evidence_type).toBe(`${ONBOARDING_IMPLIED_EVIDENCE_PREFIX}call_and_view_log`)
    // 刚完成 ⑤ 这条路手里有真 request_id，透传下去便于事后倒查是哪次调用派生的
    expect(completeOnboardingStepApi.mock.calls[1]?.[2]).toMatchObject({ evidenceId: 'req-1' })
  })
})
