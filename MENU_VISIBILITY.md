# 菜单与 UI 可见性规则

> 记录 console-web 中所有「条件显示」逻辑的真源。
> 修改任何可见性逻辑前，先更新此文档。

---

## 判断维度总览

| 维度 | 判断依据 | 代码位置 |
|------|----------|----------|
| 国内 / 国外 | `isDomestic()` / `getMarket()` | `src/lib/market.ts` |
| 账户类型 | `tenant.type === 'enterprise'` | `DashboardLayout.tsx`, `DashboardHeader.tsx` |
| 组织角色 | `tenant.role` (owner / admin / member) | `settings/organization/index.tsx` |
| 工作区状态 | `activeWorkspaceId` 是否存在 | `DashboardLayout.tsx` WorkspaceGuard |
| Dev Tools | `VITE_SHOW_DEV_TOOLS === 'true'` | `DashboardLayout.tsx` |

---

## 一、国内 vs 国外（Market）

**判断逻辑**：`isDomestic()` → 域名含 `modelgo.com` / `.cn` = domestic；含 `modelgo.ai` = global。也可通过 `VITE_MARKET` 环境变量强制指定。

| 位置 | 国内（domestic） | 国外（global） |
|------|-----------------|---------------|
| Billing 页 — 查看发票按钮 | ✅ 显示（需同时有 `invoice_url`） | ❌ 隐藏 |
| Logo 图片 | 国内版 Logo | 全球版 Logo |
| Header 公司名 | 国内品牌名 | 全球品牌名 |
| 客服浮窗行为 | 待确认 | 待确认 |

**代码引用**：
```
src/pages/billing/index.tsx:315     isDomestic() && selected.invoice_url
src/components/layout/DashboardHeader.tsx:254  src={modelGoLogos[market]}
src/config/market.ts                getMarketConfig(market)
```

---

## 二、账户类型（enterprise vs personal）

**判断逻辑**：`tenant.type === 'enterprise'`（通过 auth store 中当前激活的 tenant 获取）

### 侧边栏

| 菜单项 | enterprise | personal |
|--------|-----------|---------|
| 邀请管理（invitations-mgmt） | ✅ 显示 | ❌ 隐藏 |

### Header — 工作区切换下拉

| 菜单项 | enterprise | personal |
|--------|-----------|---------|
| 工作区管理 → `/settings/workspace` | ✅ 显示 | ❌ 隐藏 |

### Header — 账号下拉

| 菜单项 | enterprise | personal |
|--------|-----------|---------|
| 组织设置 → `/settings/organization` | ✅ 显示 | ❌ 隐藏 |
| 工作区管理 → `/settings/workspace` | ✅ 显示 | ❌ 隐藏 |

**代码引用**：
```
src/components/layout/DashboardLayout.tsx:72,104   isEnterprise → invitations-mgmt
src/components/layout/DashboardHeader.tsx:316      isEnterprise → 工作区管理（工作区下拉）
src/components/layout/DashboardHeader.tsx:513,522  isEnterprise → 组织设置、工作区管理（账号下拉）
```

---

## 三、组织角色（Tenant Role）

**角色枚举**：`tenant_owner` > `tenant_admin` > `tenant_member`

**canManage**：`role === 'tenant_owner' || role === 'tenant_admin'`

### 设置 — 组织管理 Tabs

| Tab | owner / admin | member |
|-----|--------------|--------|
| 基本信息 | ✅ | ✅ |
| 组织成员 | ✅ | ✅ |
| 邀请成员 | ✅ | ❌ 隐藏 |
| 域名配置 | ✅ | ❌ 隐藏 |

### 组织成员列表内操作

| 操作 | owner / admin | member |
|------|--------------|--------|
| 修改成员角色 | ✅ | ❌ disabled |
| 移除成员 | ✅ | ❌ disabled |
| 操作 owner 自身 | ❌ 禁止 | ❌ 禁止 |

### 数据可见性

| 字段 | owner / admin | member |
|------|--------------|--------|
| 账户余额（balance） | ✅ 有值 | ❌ null |

**代码引用**：
```
src/pages/settings/organization/index.tsx:781  canManage = owner || admin
src/pages/settings/organization/index.tsx:817,824  canManage → 邀请成员 / 域名配置 Tab
src/types/entities.ts:137  balance 字段注释：仅 owner/admin 可见
```

---

## 四、工作区状态

**判断逻辑**：`activeWorkspaceId` 是否存在（来自 auth store）

### 工作区级页面（无工作区时降级为空状态）

| 页面 key | 有工作区 | 无工作区 |
|----------|---------|---------|
| `api-keys` | 正常渲染 | 显示「无可用工作区」提示 |
| `guardrails` | 正常渲染 | 显示「无可用工作区」提示 |
| `observability` | 正常渲染 | 显示「无可用工作区」提示 |
| `invitations-mgmt` | 正常渲染 | 显示「无可用工作区」提示 |

**代码引用**：
```
src/components/layout/DashboardLayout.tsx:27-63  WorkspaceGuard + WORKSPACE_SCOPED_KEYS
```

---

## 五、Dev Tools 模式（仅内部）

**判断逻辑**：`VITE_SHOW_DEV_TOOLS === 'true'`（构建时注入）

| 位置 | 开启 | 关闭 |
|------|------|------|
| 侧边栏「接口调试」（/platform-config） | ✅ 显示 | ❌ 隐藏 |

**代码引用**：
```
src/components/layout/DashboardLayout.tsx:24,92-97  isDevTools → platform-config
```

---

## 六、工作区角色（Workspace Role）⚠️ 待完善

**角色枚举**：`ws_owner` > `ws_admin` > `ws_member`

目前工作区角色**只影响操作权限**，无菜单级差异。

| 操作 | ws_owner / ws_admin | ws_member |
|------|---------------------|-----------|
| 撤销邀请 | ✅ | ❌（仅自己发出的） |
| 修改工作区成员角色 | ✅ | ❌ |

> **待议**：是否需要对 ws_member 隐藏「邀请管理」菜单（目前由账户类型控制，未按工作区角色细分）。

---

## 待确认项

- [ ] 客服浮窗是否区分 domestic / global 有不同入口或行为
- [ ] 工作区角色是否需要影响菜单可见性（目前只控制操作权限）
- [ ] 国外版是否有任何专属功能入口（目前只确认国内有发票）
