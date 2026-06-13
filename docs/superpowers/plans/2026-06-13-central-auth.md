# 中央鉴权（AuthProvider）重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把散落在 request 拦截器、App 路由、各页面里的「鉴权失败/会话过期/登出/登录回跳」逻辑收拢到一个中央鉴权层，消除重复与不一致。

**Architecture:** zustand `store/auth.ts` 保持为**鉴权状态 SSOT，不改**。新增两块协同：① `lib/auth/auth-controller.ts`（**非 React** 纯函数，供 request.ts 等框架外代码调用，承载「会话过期」策略）；② `components/auth/AuthProvider.tsx`（**React**：启动 bootstrap、`useAuth()` hook、`<RequireAuth>` 门禁），并入现有 SessionLoader 与 ProtectedRoute。各页面/请求层改为调用中央层，不再各写 `toast+clearAuth+navigate('/login')`。

**Tech Stack:** React 19 + react-router-dom、zustand、ky（request）、i18next、sonner（toast）、vitest + @testing-library/react（jsdom）。

**关键约束（历史事故，务必保留）：**
- 绝不在会话处理里用 `window.location.href` 硬刷新 → 会重置 SessionLoader 的 `isFetchingSession`/`isLoading`，与 `/login` 守卫形成 `/login↔/dashboard` 全页无限刷新。一律用 react-router SPA 跳转 / `clearAuth()` 让门禁响应式跳转。
- 不在 `clearAuth` 里清 CSRF cookie（父域迁移期同名 cookie 清不掉且会重触发 shadowing 事故）。
- `device` 页在 `approving/success/error` 态不响应 auth 变化（防 40101→clearAuth 抢在 catch 前跳登录）—— 该竞态守卫必须保留。
- 已登录但无 `activeTenantId` = 有身份无授权 → 渲染 403（ForbiddenPage），**不回跳登录**（否则守卫互弹）。

---

## File Structure

- **Create** `src/lib/auth/auth-controller.ts` — 非 React 鉴权策略：`handleSessionExpired()`（toast + clearAuth）。供 request.ts 调用。
- **Create** `src/lib/auth/auth-controller.test.ts` — 上述单测。
- **Create** `src/components/auth/AuthProvider.tsx` — `AuthProvider`（启动拉 session）、`useAuth()`（状态 + `signOut`）、`RequireAuth`（受保护路由门禁）。
- **Create** `src/components/auth/AuthProvider.test.tsx` — RequireAuth 门禁分支 + useAuth.signOut 的 render 测试。
- **Modify** `src/lib/request.ts` — 40101 分支由 inline `toast+clearAuth` 改调 `handleSessionExpired()`。
- **Modify** `src/App.tsx` — 用 `<AuthProvider>` 包裹；删除本地 `SessionLoader`、`ProtectedRoute`；`/` 路由改用 `<RequireAuth>`。
- **Modify** `src/components/layout/DashboardHeader.tsx` — 登出改用 `useAuth().signOut()`。
- **Modify** `src/pages/forbidden/index.tsx`、`src/pages/auth-callback/index.tsx` — 跳登录改走 `useAuth().signOut()` / `toLoginWithRedirect`（仅当不回归既有流程）。
- **不动**：`store/auth.ts`（状态 SSOT）、`lib/redirect.ts`（回跳 URL 已集中）、`device/index.tsx` 的 approve 竞态流程（仅可选改为用 `useAuth()` 读状态，保留守卫）。

---

## Stage 1：非 React 鉴权策略（auth-controller）

### Task 1: `handleSessionExpired()` 抽取与单测

**Files:**
- Create: `src/lib/auth/auth-controller.ts`
- Test: `src/lib/auth/auth-controller.test.ts`
- Modify: `src/lib/request.ts:5-9`（import）、40101 分支

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/auth/auth-controller.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const warn = vi.fn()
const clearAuth = vi.fn()
vi.mock('@/lib/toast', () => ({ toast: { warning: warn, error: vi.fn(), info: vi.fn(), success: vi.fn() } }))
vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }))
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ clearAuth }) } }))

beforeEach(() => { warn.mockClear(); clearAuth.mockClear() })

describe('handleSessionExpired', () => {
  it('先 toast 提示再清鉴权态', async () => {
    const { handleSessionExpired } = await import('./auth-controller')
    handleSessionExpired()
    expect(warn).toHaveBeenCalledWith('common.sessionExpired')
    expect(clearAuth).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test src/lib/auth/auth-controller.test.ts`
Expected: FAIL（`./auth-controller` 不存在 / `handleSessionExpired` 未定义）

- [ ] **Step 3: 写实现**

```ts
// src/lib/auth/auth-controller.ts
/**
 * 中央鉴权策略（非 React，供 request 拦截器等框架外代码调用）。
 * React 侧的门禁/启动/登出见 components/auth/AuthProvider.tsx。
 */
import { toast } from '@/lib/toast'
import i18n from '@/i18n'
import { useAuthStore } from '@/store/auth'

/**
 * 会话过期统一处理：先给用户明确提示，再清内存鉴权态。
 * 清态后由 <RequireAuth> 响应式跳登录（绝不用 window.location 硬刷新——会触发 /login↔/dashboard 无限刷新）。
 * toast 自带「相同内容 4s 去重」，并发多个请求同时 401 也只提示一次。
 */
export function handleSessionExpired(): void {
  toast.warning(i18n.t('common.sessionExpired'))
  useAuthStore.getState().clearAuth()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test src/lib/auth/auth-controller.test.ts`
Expected: PASS（2 个断言）

- [ ] **Step 5: request.ts 改调中央策略**

`src/lib/request.ts` 顶部 import 段（当前第 7-8 行有 `import { toast } from '@/lib/toast'` 与 `import i18n from '@/i18n'`，上一次提交新增）。替换为单一 import：

```ts
// 删除：
import { toast } from '@/lib/toast'
import i18n from '@/i18n'
// 新增：
import { handleSessionExpired } from '@/lib/auth/auth-controller'
```

40101 分支（`afterResponse` 内）替换：

```ts
            if (request.url.includes('/auth/session')) return
            if (window.location.pathname === '/login') return
            // 会话过期：统一走中央策略（toast 提示 + 清鉴权态，门禁响应式跳登录）
            handleSessionExpired()
            return
```

- [ ] **Step 6: 验证全量 + 提交**

Run: `npx tsc --noEmit && npx eslint src/lib/request.ts src/lib/auth/auth-controller.ts && pnpm test`
Expected: tsc 无输出、eslint 0 error、全部测试 PASS

```bash
git add src/lib/auth/auth-controller.ts src/lib/auth/auth-controller.test.ts src/lib/request.ts
git commit -m "refactor(auth): 抽出中央 handleSessionExpired，request 40101 改调"
```

---

## Stage 2：React 中央鉴权（AuthProvider / useAuth / RequireAuth）

### Task 2: AuthProvider + useAuth + RequireAuth

**Files:**
- Create: `src/components/auth/AuthProvider.tsx`
- Test: `src/components/auth/AuthProvider.test.tsx`
- 参照（移植来源）: `src/App.tsx:95-130`（SessionLoader）、`src/App.tsx:151-161`（ProtectedRoute）

- [ ] **Step 1: 写失败测试（RequireAuth 三分支 + signOut）**

```tsx
// src/components/auth/AuthProvider.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { RequireAuth } from './AuthProvider'

function resetAuth(partial: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState({
    account: null, activeTenantId: null, activeWorkspaceId: null,
    tenants: [], permissions: null, menus: [],
    isAuthenticated: false, isLoading: false, ...partial,
  })
}

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/app" element={<RequireAuth><div>PROTECTED</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('RequireAuth', () => {
  it('加载中渲染占位（不跳转、不渲染子内容）', () => {
    resetAuth({ isLoading: true })
    renderGate()
    expect(screen.queryByText('PROTECTED')).toBeNull()
    expect(screen.queryByText('LOGIN')).toBeNull()
  })

  it('未登录跳登录', () => {
    resetAuth({ isLoading: false, isAuthenticated: false })
    renderGate()
    expect(screen.getByText('LOGIN')).toBeInTheDocument()
  })

  it('已登录有组织渲染子内容', () => {
    resetAuth({ isLoading: false, isAuthenticated: true, activeTenantId: 'ten_1' })
    renderGate()
    expect(screen.getByText('PROTECTED')).toBeInTheDocument()
  })

  it('已登录但无组织渲染 403（不跳登录）', () => {
    resetAuth({ isLoading: false, isAuthenticated: true, activeTenantId: null })
    renderGate()
    expect(screen.queryByText('LOGIN')).toBeNull()
    expect(screen.queryByText('PROTECTED')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test src/components/auth/AuthProvider.test.tsx`
Expected: FAIL（`./AuthProvider` 不存在 / `RequireAuth` 未导出）

- [ ] **Step 3: 写实现**

```tsx
// src/components/auth/AuthProvider.tsx
/**
 * 中央鉴权（React 侧）。
 * - AuthProvider：挂载时拉一次 /auth/session 填充 store（并入原 SessionLoader）。
 * - useAuth：读鉴权状态 + 提供 signOut。
 * - RequireAuth：受保护路由门禁（并入原 ProtectedRoute）。
 * 状态 SSOT 仍在 store/auth.ts；会话过期的非 React 策略在 lib/auth/auth-controller.ts。
 */
import { useEffect, useCallback, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { getSession, logout } from '@/services/auth'
import { storageKeys } from '@/lib/storage'
import { toLoginWithRedirect } from '@/lib/redirect'
import ForbiddenPage from '@/pages/forbidden'

// 模块级闸：防止 StrictMode 双挂载 / 并发触发重复拉 session
let isFetchingSession = false

export function AuthProvider({ children }: { children: ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth)
  const setLoading = useAuthStore((s) => s.setLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated || isFetchingSession) return
    isFetchingSession = true
    getSession()
      .then((result) => {
        // 刷新时优先恢复用户上次选择的工作区（localStorage），无记录才回退会话默认
        const persistedWs = localStorage.getItem(storageKeys.activeWorkspaceId())
        setAuth(
          {
            account_id: result.account.account_id,
            display_name: result.account.display_name,
            email: result.account.email,
            avatar_url: result.account.avatar_url,
          },
          result.active_tenant_id,
          result.tenants,
          persistedWs || result.active_workspace_id,
          result.permissions?.granted ?? null,
          result.permissions?.menus ?? [],
        )
      })
      .catch(() => setLoading(false))
      .finally(() => { isFetchingSession = false })
    // 仅挂载执行一次：会话引导是一次性副作用，依赖项故意留空
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}

/** 读鉴权状态 + 登出。登出：调后端 logout（失败也继续）→ 清态 → SPA 跳登录 */
export function useAuth() {
  const navigate = useNavigate()
  const account = useAuthStore((s) => s.account)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // 后端 logout 失败也继续清前端态
    }
    clearAuth()
    navigate('/login', { replace: true })
  }, [clearAuth, navigate])

  return { account, isAuthenticated, isLoading, activeTenantId, hasPermission, signOut }
}

/** 受保护路由门禁：加载中占位 → 未登录跳登录 → 有身份无组织 403 → 放行 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to={toLoginWithRedirect()} replace />
  if (!activeTenantId) return <ForbiddenPage />
  return <>{children}</>
}
```

> import 路径均与 `src/App.tsx` 现有写法一致：`ForbiddenPage from '@/pages/forbidden'`（默认导出）、`getSession`/`logout from '@/services/auth'`、`storageKeys from '@/lib/storage'`、`toLoginWithRedirect from '@/lib/redirect'`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test src/components/auth/AuthProvider.test.tsx`
Expected: PASS（4 个 RequireAuth 用例）

- [ ] **Step 5: 提交**

```bash
git add src/components/auth/AuthProvider.tsx src/components/auth/AuthProvider.test.tsx
git commit -m "feat(auth): 新增中央 AuthProvider/useAuth/RequireAuth（暂未接线）"
```

### Task 3: App.tsx 接线，移除旧 SessionLoader/ProtectedRoute

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 引入中央组件，删除本地定义**

在 App.tsx 顶部 import 段加：

```ts
import { AuthProvider, RequireAuth } from '@/components/auth/AuthProvider'
```

删除 App.tsx 内本地的 `function SessionLoader() {...}`（约 95-130 行）与 `function ProtectedRoute({children}) {...}`（约 151-161 行）整段。删除随之多余的 import（`getSession`、`storageKeys`、`toLoginWithRedirect`、`Navigate`、`ForbiddenPage` 等——逐个看 tsc 报「未使用」再删，AuthProvider 已接管）。

- [ ] **Step 2: 用 AuthProvider 包裹 + RequireAuth 替换**

`<SessionLoader />`（约 195 行）删除。把 `<BrowserRouter>` 内容用 `<AuthProvider>` 包裹（AuthProvider 必须在 `<BrowserRouter>` 内，因 useAuth/signOut 用 useNavigate）。受保护根路由：

```tsx
<Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
```

- [ ] **Step 3: 验证启动与门禁（tsc + 构建 + 全量测试）**

Run: `npx tsc --noEmit && pnpm test && pnpm build:test`
Expected: tsc 无输出、测试全过、构建成功

- [ ] **Step 4: 手动冒烟（本地 dev）**

Run: `cs dev`，浏览器验证：① 未登录访问 `/dashboard` → 跳 `/login`（无 `/login↔/dashboard` 反复刷新）；② 登录后正常进入；③ 已登录无组织 → 403。

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx
git commit -m "refactor(auth): App 接入 AuthProvider/RequireAuth，移除散落的 SessionLoader/ProtectedRoute"
```

---

## Stage 3：登出收口

### Task 4: DashboardHeader 改用 useAuth().signOut()

**Files:**
- Modify: `src/components/layout/DashboardHeader.tsx`（`handleLogout` 约 235-243 行）

- [ ] **Step 1: 替换登出实现**

引入：`import { useAuth } from '@/components/auth/AuthProvider'`，组件内 `const { signOut } = useAuth()`。
将 `handleLogout` 内原 `await logout(); clearAuth(); navigate('/login', {replace:true})` 整体替换为 `await signOut()`。删除随之多余的 `logout`/`clearAuth`/`navigate('/login')` 相关 import/取值（若其他逻辑仍用 navigate 则保留 navigate）。

- [ ] **Step 2: 验证 + 提交**

Run: `npx tsc --noEmit && npx eslint src/components/layout/DashboardHeader.tsx && pnpm test`
Expected: 0 error，测试全过。手动：点登出 → 清态 → 到登录页。

```bash
git add src/components/layout/DashboardHeader.tsx
git commit -m "refactor(auth): 登出改走中央 useAuth().signOut()"
```

---

## Stage 4：边缘页面收口（低风险，逐个独立）

### Task 5: forbidden / auth-callback 走中央原语

**Files:**
- Modify: `src/pages/forbidden/index.tsx`、`src/pages/auth-callback/index.tsx`

- [ ] **Step 1: forbidden 的「返回登录」按钮**

`src/pages/forbidden/index.tsx:23` 的 `navigate('/login', { replace:true })`：若语义是「换账号/重新登录」，改为 `useAuth().signOut()`（先清态再跳，避免带着残留身份回登录页）。若仅是「去登录」展示按钮则保留 `navigate`。按页面实际文案判断后改。

- [ ] **Step 2: auth-callback 失败跳转**

`src/pages/auth-callback/index.tsx:53` 失败时 `navigate('/login')`：确认其前后是否已有错误提示（toast/页面文案）；若静默则补一句 `toast.error(...)` 或保留页面错误态，符合「任何错误先提示」原则。**仅当确有静默才改**，不无谓改动。

- [ ] **Step 3: 验证 + 提交**

Run: `npx tsc --noEmit && pnpm test && pnpm build:test`

```bash
git add src/pages/forbidden/index.tsx src/pages/auth-callback/index.tsx
git commit -m "refactor(auth): forbidden/auth-callback 跳转收口到中央原语"
```

### Task 6: device 状态读取收口（保留竞态守卫）

**Files:**
- Modify: `src/pages/device/index.tsx`

- [ ] **Step 1: 仅状态读取改用 useAuth**

把 `device/index.tsx` 中直接 `useAuthStore((s)=>s.isAuthenticated/isLoading/account)` 改为 `const { isAuthenticated, isLoading, account } = useAuth()`（统一入口）。
**保留**：approve 的 40101 → 错误态+「去登录」流程；useEffect 中 `state.kind` 为 `approving/success/error` 时不响应 auth 变化的竞态守卫。device 因 `user_code` 回跳 + 竞态需求，**不并入 RequireAuth**，作为有意例外（在文件顶部注释说明）。

- [ ] **Step 2: 验证 + 提交**

Run: `npx tsc --noEmit && npx eslint src/pages/device/index.tsx && pnpm test`
手动：`/device?user_code=XXX` 未登录 → 跳登录；登录态 approve 正常；approve 遇 40101 → 错误态+去登录（不被拽走）。

```bash
git add src/pages/device/index.tsx
git commit -m "refactor(auth): device 状态读取统一走 useAuth，保留 approve 竞态守卫"
```

---

## 完成判据

- 全站「会话过期/登出/受保护门禁/会话引导」只在 `lib/auth/auth-controller.ts` + `components/auth/AuthProvider.tsx` 两处定义；request.ts、App.tsx、Header、各页面均调用中央层。
- `store/auth.ts`（状态）与 `lib/redirect.ts`（回跳 URL）保持单点，未被打散。
- 历史事故未复现：无 `/login↔/dashboard` 无限刷新、device approve 竞态正常、无组织→403。
- `npx tsc --noEmit`、`npx eslint .`（0 error）、`pnpm test`、`pnpm build:test` 全绿。
