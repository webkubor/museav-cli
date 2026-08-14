/**
 * 安全护栏页面回归测试：预算编辑、异常数据防线与 URL 工作空间作用域。
 */
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import type {
  AddBudgetPolicyRequest,
  GuardrailBudgetPolicy,
  GuardrailDetail,
  UpdateBudgetPolicyRequest,
} from '@/interfaces/guardrails'

// ── service mocks: the page is a read+mutate view over @/services/guardrails ─
const listGuardrails = vi.fn<(workspaceId: string) => Promise<{ items: GuardrailDetail[] }>>()
const getGuardrail = vi.fn<(id: string) => Promise<GuardrailDetail>>()
const addBudgetPolicy = vi.fn<(id: string, body: AddBudgetPolicyRequest) => Promise<GuardrailDetail>>()
const updateBudgetPolicy = vi.fn<(id: string, policyId: string, body: UpdateBudgetPolicyRequest) => Promise<GuardrailDetail>>()
const deleteBudgetPolicy = vi.fn<(guardrailId: string, policyId: string) => Promise<GuardrailDetail>>()
const createGuardrail = vi.fn()
const updateGuardrail = vi.fn()
const deleteGuardrail = vi.fn()

vi.mock('@/services/guardrails', () => ({
  listGuardrails: (workspaceId: string) => listGuardrails(workspaceId),
  createGuardrail: (workspaceId: string, body: unknown) => createGuardrail(workspaceId, body),
  getGuardrail: (id: string) => getGuardrail(id),
  updateGuardrail: (id: string, body: unknown) => updateGuardrail(id, body),
  addBudgetPolicy: (id: string, body: AddBudgetPolicyRequest) => addBudgetPolicy(id, body),
  updateBudgetPolicy: (id: string, policyId: string, body: UpdateBudgetPolicyRequest) =>
    updateBudgetPolicy(id, policyId, body),
  deleteBudgetPolicy: (guardrailId: string, policyId: string) => deleteBudgetPolicy(guardrailId, policyId),
  deleteGuardrail: (id: string) => deleteGuardrail(id),
}))

// Sibling data sources the page mounts but this suite does not exercise.
vi.mock('@/services/catalog', () => ({
  listModels: vi.fn().mockResolvedValue({ items: [] }),
}))
vi.mock('@/services/workspaces', () => ({
  listWorkspaceMembers: vi.fn().mockResolvedValue({ items: [] }),
  listWorkspaces: vi.fn().mockResolvedValue([]),
}))
// useTenantRole 还会调 listTenants;不 mock 会发真网络请求 → 40101 → clearAuth 异步洗掉
// 测试刚 setState 的租户(跨用例竞态,曾致「个人租户隐藏默认个人预算」间歇挂)
vi.mock('@/services/tenants', () => ({
  listTenants: vi.fn().mockResolvedValue({ items: [] }),
}))
vi.mock('@/services/api-keys', () => ({
  // #60 起返回 CursorPage 分页对象（不再是裸数组）
  listApiKeys: vi.fn().mockResolvedValue({ items: [], page_size: 0, has_more: false, next_cursor: null }),
}))

// Permission + platform-config hooks are page inputs, not what we test here:
// grant everything so the budget tab save/clear controls render.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: [],
    hasPermission: () => true,
    menus: [],
    getMenuActions: () => ({}),
  }),
}))
vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => ({ currency: 'USD', symbol: '$' }),
}))
// canManageRow（#261 逐行编辑归属）= managesWorkspace || 自己创建的；managesWorkspace 来自
// useTenantRole() 的 canManage/ownedWorkspaceIds，是走 listTenants 网络查询的（跟上面
// showMember 直接读 useAuthStore.tenants 是两条不同路径）。mock 的 listTenants 恒返回空，
// 真实 hook 下 canManage 永远 false，保存按钮的 canEditBudget = hasPermission && canManageDetail
// 会被 canManageDetail 卡死——跟 use-permissions 一样的理由，直接放行。
vi.mock('@/hooks/use-tenant-role', () => ({
  useTenantRole: () => ({
    role: 'tenant_owner',
    isLoading: false,
    isEnterprise: true,
    tenant: undefined,
    canManage: true,
    isOwner: true,
    isAdmin: false,
    isMember: false,
    isSpaceOwner: false,
    ownedWorkspaceIds: [],
  }),
}))

// appToast wraps sonner (DOM portals/timers) — mock it and assert calls.
vi.mock('@/lib/app-toast', () => ({
  appToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import { appToast } from '@/lib/app-toast'
import { useAuthStore } from '@/store/auth'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import GuardrailsPage from '@/pages/guardrails/index'

// 页面文案走 i18n（'预算限额金额' 等断言都是真实中文），测试统一走真实 i18next 而不是
// 回显 key 的假 mock——之前 mock 把 t() 简化成 (key) => key，且完全丢弃插值 options，
// aria-label={t('guardrails.budget.amountAria', { label })} 这类调用永远拿不到真文案。
// 生产环境靠 App.tsx 的 <LocaleNamespaces> 异步加载 'guardrails' 语言包，这里直接同步预加载。
i18n.changeLanguage('zh')
await loadLocaleNamespaces(['guardrails'])

const WORKSPACE_ID = 'ws-1'
const GUARDRAIL_ID = 'g-1'
const GUARDRAIL_NAME = '测试护栏'
const OLD_POLICY_ID = 'bp-1'

function budgetPolicy(over: Partial<GuardrailBudgetPolicy>): GuardrailBudgetPolicy {
  return {
    id: OLD_POLICY_ID,
    aggregation_scope: 'guardrail_total',
    enforcement_mode: 'hard_limit',
    enabled: true,
    currency: 'USD',
    timezone: 'UTC',
    period_unit: 'month',
    period_length: 1,
    // NUMERIC(24,12)::text padding exactly as the backend echoes it (qa#156)
    spend_limit_amount: '100.000000000000',
    token_limit: 0,
    request_limit: 0,
    rate_token_limit: 0,
    rate_request_limit: 0,
    rate_window_seconds: 0,
    effective_from: '2026-06-01T00:00:00Z',
    effective_to: '', // open-ended → active policy
    ...over,
  }
}

function guardrailDetail(policies: GuardrailBudgetPolicy[]): GuardrailDetail {
  return {
    id: GUARDRAIL_ID,
    name: GUARDRAIL_NAME,
    description: '',
    status: 'active',
    is_default: false,
    priority: 0,
    scope_level: 'workspace',
    policy_id: 'pol-1',
    gateway_policy_version: 1,
    version: 1,
    tenant_id: 't-1',
    workspace_id: WORKSPACE_ID,
    metadata: {},
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    assignments: [],
    budget_policies: policies,
  }
}

// Mutable backing store so the refetch after invalidateQueries sees whatever
// the (mocked) save produced.
let detailNow: GuardrailDetail

function renderPage(workspaceId = WORKSPACE_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/workspace/${workspaceId}/guardrails`]}>
        <Routes>
          <Route path="/workspace/:workspaceId/guardrails" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(<GuardrailsPage />, { wrapper: Wrapper })
}

// Open the drawer from the table row and wait for the budget section to be
// back-filled from the active policy (detail load is async).
async function openBudgetTab() {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))
  const input = (await screen.findByRole('textbox', { name: '工作空间总预算金额' })) as HTMLInputElement
  await waitFor(() => expect(input.value).toBe('100'))
  return input
}

beforeEach(() => {
  detailNow = guardrailDetail([budgetPolicy({})])
  listGuardrails.mockReset().mockImplementation(async () => ({ items: [detailNow] }))
  getGuardrail.mockReset().mockImplementation(async () => detailNow)
  addBudgetPolicy.mockReset()
  updateBudgetPolicy.mockReset()
  deleteBudgetPolicy.mockReset()
  createGuardrail.mockReset()
  updateGuardrail.mockReset()
  deleteGuardrail.mockReset()

  useAuthStore.setState({ activeWorkspaceId: WORKSPACE_ID })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('GuardrailsPage — workspace route scope', () => {
  it('uses the URL workspace even when Zustand points at another workspace', async () => {
    useAuthStore.setState({ activeWorkspaceId: 'ws-from-store' })

    renderPage('ws-from-url')

    await waitFor(() => expect(listGuardrails).toHaveBeenCalledWith('ws-from-url'))
    expect(listGuardrails).not.toHaveBeenCalledWith('ws-from-store')
  })
})

// ── drawer fill: stored padded NUMERIC echoes back trimmed ────────────────────

describe('GuardrailsPage — budget input fill on drawer open', () => {
  it('fills the input with "100" when the active policy stores "100.000000000000"', async () => {
    const input = await openBudgetTab()
    // exact string, not parseFloat round-trip: the padded scale must be gone
    expect(input.value).toBe('100')
    expect(getGuardrail).toHaveBeenCalledWith(GUARDRAIL_ID)
  })
})

// ── invalid amount: reject locally, never call the service ───────────────────

describe('GuardrailsPage — invalid budget amount', () => {
  it.each([
    ['1.234', 'three fraction digits'],
    ['0', 'not > 0'],
  ])('typing %j (%s) + 保存预算 shows an error toast and calls no service', async (bad) => {
    const input = await openBudgetTab()

    fireEvent.change(input, { target: { value: bad } })
    expect(input.value).toBe(bad)

    fireEvent.click(screen.getByRole('button', { name: '保存护栏' }))

    await waitFor(() => expect(appToast.error).toHaveBeenCalledTimes(1))
    expect(vi.mocked(appToast.error).mock.calls[0][0]).toContain('预算金额无效')
    expect(addBudgetPolicy).not.toHaveBeenCalled()
    expect(updateBudgetPolicy).not.toHaveBeenCalled()
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
    expect(appToast.success).not.toHaveBeenCalled()
  })
})

// ── valid amount: qa#164 single-policy maintenance — edit PATCHes the SAME
// policy in place; only the first save POSTs a new one ────────────────────────

describe('GuardrailsPage — valid budget save', () => {
  it('编辑已有预算：PATCH 同一条策略（同一 id），不新增不删除', async () => {
    updateBudgetPolicy.mockImplementation(async (_id, policyId, body) => {
      // backend edits the row in place: SAME id, NUMERIC scale padding on echo
      detailNow = guardrailDetail([
        budgetPolicy({
          id: policyId,
          spend_limit_amount: `${body.spend_limit_amount}0000000000`,
          period_unit: body.period_unit ?? 'month',
        }),
      ])
      return detailNow
    })

    const input = await openBudgetTab()

    fireEvent.change(input, { target: { value: '123.45' } })
    fireEvent.click(screen.getByRole('button', { name: '保存护栏' }))

    await waitFor(() => expect(updateBudgetPolicy).toHaveBeenCalledTimes(1))
    const [guardrailId, policyId, body] = updateBudgetPolicy.mock.calls[0]
    expect(guardrailId).toBe(GUARDRAIL_ID)
    expect(policyId).toBe(OLD_POLICY_ID)
    expect(body.spend_limit_amount).toBe('123.45')
    // 这条走的是 buildGlobalBudgetOps（scope==='global'，见「全局护栏三档预算」测试组的
    // 「改一档金额」用例），该函数固定带 aggregation_scope + period_length 做策略身份/
    // 周期补齐，不是 member/key 单档那套「只发变更字段」精简 diff；不泄漏的仍是
    // create-only 字段（enabled / replace_budget_policy_id）
    expect(Object.keys(body)).toEqual(['aggregation_scope', 'period_length', 'spend_limit_amount'])

    // in-place maintenance: no create, no delete, no replace
    expect(addBudgetPolicy).not.toHaveBeenCalled()
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()

    await waitFor(() => expect(appToast.success).toHaveBeenCalled())
    expect(appToast.error).not.toHaveBeenCalled()

    // onSuccess back-fills the input with the trimmed saved value, so what the
    // user sees is exactly what was stored
    await waitFor(() => expect(input.value).toBe('123.45'))
  })

  it('首次设置（无预算）：POST 新增唯一一条，不带 replace 字段', async () => {
    detailNow = guardrailDetail([])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)
    addBudgetPolicy.mockImplementation(async (_id, body) => {
      detailNow = guardrailDetail([
        budgetPolicy({ id: 'bp-new', spend_limit_amount: `${body.spend_limit_amount}.000000000000` }),
      ])
      return detailNow
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))
    // 无既有策略 → draft 初始 limited=false，金额输入框要先切到「限额」才出现
    // （draftFromPolicy(null) 落到 EMPTY_BUDGET_DRAFT，非直接可编辑态）。
    const modeGroup = await screen.findByRole('radiogroup', { name: '工作空间总预算额度类型' })
    fireEvent.click(within(modeGroup).getByRole('radio', { name: '限额' }))
    const input = (await screen.findByRole('textbox', { name: '工作空间总预算金额' })) as HTMLInputElement
    expect(input.value).toBe('')

    fireEvent.change(input, { target: { value: '88' } })
    fireEvent.click(screen.getByRole('button', { name: '保存护栏' }))

    await waitFor(() => expect(addBudgetPolicy).toHaveBeenCalledTimes(1))
    const [guardrailId, body] = addBudgetPolicy.mock.calls[0]
    expect(guardrailId).toBe(GUARDRAIL_ID)
    expect(body.spend_limit_amount).toBe('88')
    expect(body.enabled).toBe(true)
    expect(body.replace_budget_policy_id).toBeUndefined()
    expect(updateBudgetPolicy).not.toHaveBeenCalled()

    // 落库回显去尾零
    await waitFor(() => expect(input.value).toBe('88'))
  })
})

describe('GuardrailsPage — 多条生效预算策略（脏数据）防线 qa#162', () => {
  it('预算 Tab 直接报错并隐藏编辑器，保存被禁止', async () => {
    detailNow = guardrailDetail([
      budgetPolicy({ id: 'bp-new', spend_limit_amount: '500.000000000000', effective_from: '2026-06-10T00:00:00Z' }),
      budgetPolicy({ id: 'bp-old', spend_limit_amount: '100.000000000000', effective_from: '2026-06-01T00:00:00Z' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('预算配置数据错误')
    // 编辑器仍展示当前值（取最新一条）但整体 disabled，不是完全不渲染——在脏数据上
    // 保留可见但只读的展示，比整段消失更利于排障；真正被禁止的是提交动作（无保存按钮）。
    expect((screen.getByRole('textbox', { name: '工作空间总预算金额' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '保存护栏' })).toBeNull()
    expect(addBudgetPolicy).not.toHaveBeenCalled()
    expect(updateBudgetPolicy).not.toHaveBeenCalled()
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
  })

  it('单条生效 + 历史停用策略不触发报错，回填取生效那条', async () => {
    detailNow = guardrailDetail([
      budgetPolicy({ id: 'bp-live', spend_limit_amount: '500.000000000000', effective_from: '2026-06-10T00:00:00Z' }),
      budgetPolicy({ id: 'bp-dead', enabled: false, effective_to: '2026-06-09T00:00:00Z', spend_limit_amount: '100.000000000000' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))

    const input = (await screen.findByRole('textbox', { name: '工作空间总预算金额' })) as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('500'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('GuardrailsPage — 详情加载失败（后端 409 预算配置数据错误）qa#162', () => {
  it('抽屉内渲染错误说明，表单与保存按钮一概不出', async () => {
    getGuardrail.mockReset().mockRejectedValue(
      new Error('预算配置数据错误：存在多条生效中的预算策略'),
    )

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('预算配置数据错误')
    // 防串档：失败的详情上不允许出现可保存的表单（底部保存键 = t key）
    expect(screen.queryByRole('button', { name: 'guardrails.modal.saveEdit' })).toBeNull()
    expect(screen.queryByRole('button', { name: '预算' })).toBeNull()
  })
})

// ── 全局护栏（is_default）预算：按 aggregation_scope 三档独立编辑 ──────────────
// 每档对应一个 scope：guardrail_total（工作空间总预算）/ per_member（默认个人预算，
// 仅企业租户）/ per_api_key（默认 Key 预算）。三档互相独立、可并存。

// 企业租户下的全局护栏详情（is_default:true），可带任意 scope 的策略
function globalGuardrailDetail(policies: GuardrailBudgetPolicy[]): GuardrailDetail {
  return { ...guardrailDetail(policies), is_default: true }
}

// 打开全局护栏抽屉，等三档预算编辑器就绪（总预算档标签金额可作为锚点）
async function openGlobalBudgetTab() {
  renderPage()
  // is_default 护栏的名称按钮带「默认」徽标，可及名含徽标文案 → 用正则匹配
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(GUARDRAIL_NAME) }))
  // 三档预算控件对齐 PRD 后是「不限额｜限额」两按钮分段（role=radiogroup/radio），非 Switch；
  // 总预算档已有生效策略，回填后 limited=true，金额输入框直接可作为「就绪」锚点。
  await screen.findByRole('textbox', { name: '工作空间总预算金额' })
}

describe('GuardrailsPage — 全局护栏三档预算', () => {
  it('三档从各自 aggregation_scope 的生效策略回填', async () => {
    detailNow = globalGuardrailDetail([
      budgetPolicy({ id: 'bp-total', aggregation_scope: 'guardrail_total', spend_limit_amount: '1000.000000000000' }),
      budgetPolicy({ id: 'bp-member', aggregation_scope: 'per_member', spend_limit_amount: '200.000000000000' }),
      budgetPolicy({ id: 'bp-key', aggregation_scope: 'per_api_key', spend_limit_amount: '50.000000000000' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)

    await openGlobalBudgetTab()

    const total = (await screen.findByRole('textbox', { name: '工作空间总预算金额' })) as HTMLInputElement
    const member = (await screen.findByRole('textbox', { name: '默认个人预算金额' })) as HTMLInputElement
    const key = (await screen.findByRole('textbox', { name: '默认 Key 预算金额' })) as HTMLInputElement
    await waitFor(() => expect(total.value).toBe('1000'))
    expect(member.value).toBe('200')
    expect(key.value).toBe('50')
  })

  it('改一档金额：只 PATCH 该 scope 的策略，其他档不动', async () => {
    detailNow = globalGuardrailDetail([
      budgetPolicy({ id: 'bp-total', aggregation_scope: 'guardrail_total', spend_limit_amount: '1000.000000000000' }),
      budgetPolicy({ id: 'bp-key', aggregation_scope: 'per_api_key', spend_limit_amount: '50.000000000000' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)
    updateBudgetPolicy.mockImplementation(async () => detailNow)

    await openGlobalBudgetTab()
    const total = (await screen.findByRole('textbox', { name: '工作空间总预算金额' })) as HTMLInputElement
    await waitFor(() => expect(total.value).toBe('1000'))

    fireEvent.change(total, { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: '保存护栏' }))

    await waitFor(() => expect(updateBudgetPolicy).toHaveBeenCalledTimes(1))
    const [gid, policyId, body] = updateBudgetPolicy.mock.calls[0]
    expect(gid).toBe(GUARDRAIL_ID)
    expect(policyId).toBe('bp-total')
    expect(body.spend_limit_amount).toBe('2000')
    expect(Object.keys(body)).toEqual(['aggregation_scope', 'period_length', 'spend_limit_amount']) // PATCH 补齐策略身份与周期长度
    // 未改动的 per_api_key 档不产生任何调用
    expect(addBudgetPolicy).not.toHaveBeenCalled()
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
    await waitFor(() => expect(appToast.success).toHaveBeenCalled())
  })

  it('把不限额的一档改成限额：POST 新增带对应 aggregation_scope', async () => {
    detailNow = globalGuardrailDetail([
      budgetPolicy({ id: 'bp-total', aggregation_scope: 'guardrail_total', spend_limit_amount: '1000.000000000000' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)
    addBudgetPolicy.mockImplementation(async () => detailNow)

    await openGlobalBudgetTab()
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: '工作空间总预算金额' }) as HTMLInputElement).value).toBe('1000'),
    )
    // per_api_key 档初始不限额（无策略）→ 无金额输入
    expect(screen.queryByRole('textbox', { name: '默认 Key 预算金额' })).toBeNull()

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: '默认 Key 预算额度类型' })).getByRole('radio', { name: '限额' }),
    )
    const key = (await screen.findByRole('textbox', { name: '默认 Key 预算金额' })) as HTMLInputElement
    fireEvent.change(key, { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: '保存护栏' }))

    await waitFor(() => expect(addBudgetPolicy).toHaveBeenCalledTimes(1))
    const [gid, body] = addBudgetPolicy.mock.calls[0]
    expect(gid).toBe(GUARDRAIL_ID)
    expect(body.aggregation_scope).toBe('per_api_key')
    expect(body.spend_limit_amount).toBe('50')
    expect(body.enabled).toBe(true)
    // guardrail_total 未改 → 不 PATCH；无删除
    expect(updateBudgetPolicy).not.toHaveBeenCalled()
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
  })

  it('把限额的一档关成不限额：DELETE 该 scope 的策略', async () => {
    detailNow = globalGuardrailDetail([
      budgetPolicy({ id: 'bp-total', aggregation_scope: 'guardrail_total', spend_limit_amount: '1000.000000000000' }),
      budgetPolicy({ id: 'bp-member', aggregation_scope: 'per_member', spend_limit_amount: '200.000000000000' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)
    deleteBudgetPolicy.mockImplementation(async () => detailNow)

    await openGlobalBudgetTab()
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: '默认个人预算金额' }) as HTMLInputElement).value).toBe('200'),
    )

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: '默认个人预算额度类型' })).getByRole('radio', { name: '不限额' }),
    )
    fireEvent.click(screen.getByRole('button', { name: '保存护栏' }))

    await waitFor(() => expect(deleteBudgetPolicy).toHaveBeenCalledTimes(1))
    const [gid, policyId] = deleteBudgetPolicy.mock.calls[0]
    expect(gid).toBe(GUARDRAIL_ID)
    expect(policyId).toBe('bp-member')
    expect(addBudgetPolicy).not.toHaveBeenCalled()
    expect(updateBudgetPolicy).not.toHaveBeenCalled()
  })

  it('个人租户隐藏「默认个人预算」档，且保存不触碰 per_member 策略', async () => {
    useAuthStore.setState({
      activeWorkspaceId: WORKSPACE_ID,
      activeTenantId: 't-1',
      tenants: [{ tenant_id: 't-1', type: 'personal' }] as never,
    })
    detailNow = globalGuardrailDetail([
      budgetPolicy({ id: 'bp-total', aggregation_scope: 'guardrail_total', spend_limit_amount: '1000.000000000000' }),
      budgetPolicy({ id: 'bp-member', aggregation_scope: 'per_member', spend_limit_amount: '200.000000000000' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)
    updateBudgetPolicy.mockImplementation(async () => detailNow)

    await openGlobalBudgetTab()
    // 个人租户：默认个人预算档不渲染
    expect(screen.queryByRole('radiogroup', { name: '默认个人预算额度类型' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '默认个人预算金额' })).toBeNull()

    const total = (await screen.findByRole('textbox', { name: '工作空间总预算金额' })) as HTMLInputElement
    await waitFor(() => expect(total.value).toBe('1000'))
    fireEvent.change(total, { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: '保存护栏' }))

    await waitFor(() => expect(updateBudgetPolicy).toHaveBeenCalledTimes(1))
    expect(updateBudgetPolicy.mock.calls[0][1]).toBe('bp-total')
    // per_member 档被过滤，绝不误删既有的成员默认预算
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
  })
})
