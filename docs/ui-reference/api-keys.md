# ModelGo Console ·「API Keys」模块 UI 参考

> **衍生文档 · 非真源** — 基线：PRD 原型 `modelgo_prd` commit `4ef7ee7`（2026-07-22）+ 现状代码，生成 2026-07-24。
> ⚠️ PRD 改版后需重跑同步（见 [README](./README.md)）。冲突时以真源（PRD `App.tsx` + 现状代码）为准。

三源对齐：**PRD 原型**（`modelgo_prd/src/App.tsx`，功能真源）｜**现状代码**（`src/pages/api-keys/`）｜**权限/类型**（`src/config/*`、`src/types/workspace.ts`）。文案一律照原型常量，不自造。

---

## 1. UI 框架

### 1.1 列表页结构 (`index.tsx`)

页面根为 `space-y-6` 纵向堆叠，自上而下 6 段（`index.tsx:394-629`）：

| 顺序 | 区块 | 组件 | 说明 |
|---|---|---|---|
| 1 | 页头 | `PageHeader` + `WorkspaceTitleTag` | 标题 `API Keys` 旁挂当前工作空间 Tag（需求方#125，去掉标题下 Hint）`index.tsx:397-404` |
| 2 | KPI 摘要卡 | `ApiKeySummaryCards`（内含 5×`KpiCard`） | `index.tsx:406` |
| 3 | 协议接入横栏 | `ApiKeyProtocolBanner` | OpenAI/Anthropic Base URL + 文档入口 `index.tsx:408-412` |
| 4 | 工具条 | `Input`(search) + 3×`Select` + `Button`(brand) | 搜索 / 类型 / 状态 / 负责人 / 创建 `index.tsx:415-454` |
| 5 | 作用域提示 | `<p>` caption | 企业视图 vs 我的视图文案（见 §3）`index.tsx:456-462` |
| 6 | 表格 + 分页 | `ApiKeyTable` + `Pagination`(cursor) | `index.tsx:464-491` |

**容器规则**：整页无 Card 外框，KPI 卡用 `flex flex-wrap gap-4`；表格由 `ui/Table` 家族渲染；游标翻页仅在 `page>1 || hasMore` 时出现（`index.tsx:482`）。

**挂载的弹层**（均在页面根下，受 state 控制）：
- `ApiKeyDetailDrawer`（详情抽屉，`SideSheet`）`index.tsx:493-506`
- 创建成功 `Modal`（size=md，一次性明文）`index.tsx:509-528`
- `ConnectModal`（快速接入，`Modal` size=lg）`index.tsx:530-537`
- 轮转成功 `Modal`（size=md，一次性新 Token）`index.tsx:540-554`
- 确认完成轮换 `Modal`（size=md）`index.tsx:556-577`
- `CreateKeyModal`（创建抽屉，`SideSheet`）`index.tsx:579-585`
- 撤销确认 `Modal`（size=sm）`index.tsx:588-602`
- 停用确认 `Modal`（size=sm，回显 Masked Key #157）`index.tsx:605-627`

### 1.2 KPI 卡组成 (`ApiKeySummaryCards.tsx`)

5 张 `KpiCard`（`iconLead`），依次：**全部 Key** / **启用中** / **7 天内即将过期** / **已达限额** / **本月消费**。数据优先后端 `/summary`，否则 `deriveSummary` 客户端派生（`ApiKeySummaryCards.tsx:19-73`）。图标依次 `LuKeyRound / LuCircleCheck / LuClock / LuGauge / LuReceiptText`；配色 brand/success/warning/warning/brand。

### 1.3 详情抽屉结构 (`ApiKeyDetailDrawer.tsx`)

容器 `SideSheet`（`title=item.name`）。body 为 `space-y-6 pb-8`（`ApiKeyDetailDrawer.tsx:224-511`）：

1. **治理动作行**（抽屉头下方）：掩码 + 复制完整 Key 按钮 + 动作按钮组（轮转/已轮转、停用/启用、删除）`:229-278`
2. **轮转提示条**（仅 `rotation_required` 态显示，warning 底 + 复制旧 Token）`:280-299`
3. **详情加载失败错误块**（`detailError` 时，含重试）`:302-319`
4. **`Section` 基础信息**：3 格 `Cell`（类型 / 负责人 / 到期时间）`:322-328`
5. **`Section` 用量**：3 格 `Cell`（本期消费 / 请求数 / Tokens）`:333-339`
6. **`Section` 安全护栏**：生效规则预览（3 层）+ 预算闸门（逐档）+ 规则清单 3 卡（模型黑名单/IP白名单/提示词注入）`:342-463`
7. **`Section` 最近调用**：单卡摘要 + 「跳转日志」`:466-491`
8. **`Section` 操作审计**：时间线 `border-l-2`，最多 8 条 `:494-510`

自定义容器：`Section`（标题 + 可选 action）`:43-53`、`Cell`（label 上、值加粗下）`:56-63`。

### 1.4 创建抽屉结构 (`CreateKeyModal.tsx`)

容器 `SideSheet`（`title=创建 API Key`，`description=为 {workspaceName} 工作空间创建运行凭证`）。body `flex flex-col gap-7`（`CreateKeyModal.tsx:387-699`）：

1. **Key 名称** `Input` `:396-407`
2. **Key 类型** 卡片栅格 `grid sm:grid-cols-3`（`personal/member/service`，无权限置灰）`:409-454`
3. **负责人**（成员 Key）`Select` `:456-484`
4. **负责人 / 维护人为自己**（服务 Key，企业选下拉 / 个人租户提示）`:486-521`
5. **过期时间** `DateRangePicker` `:523-543`
6. **高级设置**（折叠面板，默认收起）→ 安全策略：Key 护栏 `Select` + 已选策略 tile + 生效规则预览（3 层 + 预算闸门 + 规则 3 卡）`:545-698`
7. **sticky 底栏**：取消 / 立即创建 `:700-712`

### 1.5 接入弹窗 (`ConnectModal.tsx`)

`Modal`（size=lg，title=`立即接入`）。顶部「ModelGo 接入参数」卡 + `Tabs` 切换 6 种客户端（一键接入/CC Switch/Claude Code/Codex/OpenAI SDK/cURL，见 `CONNECT_ACTIONS` `constants.tsx:110-152`），每个 Tab 展示参数表 + 拉起工具/文档按钮 + 复制。

### 1.6 协议横栏 (`ApiKeyProtocolBanner.tsx`)

栅格 section：左「使用标准协议接入」标题块 + OpenAI/Anthropic 两个 Base URL 复制条 + 「查看 API 文档」外链。

---

## 2. 字段文案（照 PRD 原型常量）

### 2.1 列表表头 + 单元格（9 列）

表头真源：PRD `App.tsx:12459-12469`；现状 `ApiKeyTable.tsx:103-114`。

| # | 表头文案 | 单元格显示内容 | 代码 |
|---|---|---|---|
| 1 | 名称 | Key 名称（加粗）+ 下方掩码 `masked` + 复制完整明文按钮 | `ApiKeyTable.tsx:197-217` |
| 2 | 类型 | 类型徽章：`私有 Key`/`成员 Key`/`服务 Key`（配色区分） | `:218-222` |
| 3 | 负责人 | `responsible.display_name`；若创建人≠负责人，下方灰字「创建人 X」 | `:223-239` |
| 4 | Key护栏（原型「安全护栏」） | 护栏名绿色 Chip（`LuShieldCheck`），最多 3 个 + `+N` | `:240-261` |
| 5 | 状态 | `StatusBadge`（见 §2.4） | `:262-264` |
| 6 | 本期消费 / 限额 | 上行本期消费金额（等宽）；下行 `限额 ¥800 / 每月` 或 `不限额` | `:265-273` |
| 7 | 最近调用 | 时间；无则灰字「尚未调用」 | `:274-276` |
| 8 | 到期时间 | 时间；`永不过期`；过期红字 + `已过期` 徽章；将过期橙字 | `:277-292` |
| 9 | 操作 | `详情`（brand）+ 条件 `停用`/`启用` | `:293-310` |

> 现状表头微差异：第 6 列现状为「本期消费 / 限额」，第 4 列现状标题为「Key护栏」（`normal-case` 保留 Key 大小写），原型为「安全护栏」。搜索占位现状 `搜索 Key 名称、负责人`（`index.tsx:419`），原型 `搜索 Key 名称、负责人、标签`（`App.tsx:12433`）。

### 2.2 Key 类型枚举（`apiKeyTypeOptions` `App.tsx:1457-1461` / `derive.ts:53-63`）

| value | 中文标签 | 定义（description / KEY_TYPE_DESC） | 后端 scope 映射 |
|---|---|---|---|
| `personal` | 私有 Key | 当前成员负责，适合个人开发、测试或本地接入。 | `personal` |
| `member` | 成员 Key | 管理员代建，指定成员负责和接收通知。 | `member` |
| `service` | 服务 Key | 工作空间服务或生产系统使用。 | `workspace` |

`scope→type` 回退：`personal→personal / member→member / workspace→service`（`derive.ts:47-51`）。**个人租户无「成员 Key」**（`index.tsx:428`、`CreateKeyModal.tsx:415`、`App.tsx:13071-13073`）。

### 2.3 限额周期枚举

- **PRD 原型** `apiKeyLimitPeriodOptions`（`App.tsx:1473-1479`）：`none=不限额` / `fiveHours=每 5 小时` / `daily=每日` / `weekly=每周` / `monthly=每月`。
- **现状** `LIMIT_PERIOD_OPTIONS`（创建表单实际可选，`constants.tsx:70-74`）：`none=不限额` / `day=每日` / `month=每月`（后端当前只接受 none/daily/monthly）。
- **展示映射** `LIMIT_PERIOD_LABEL`（`constants.tsx:77-84`）：`none=不限额 / day=每日 / month=每月 / total=总额 / hour=每小时 / week=每周`。

> 说明：现状详情抽屉已按需求方定案**移除 Key 级消费限额/调整限额入口**，限额统一走护栏预算（`ApiKeyDetailDrawer.tsx:330-332`）。

### 2.4 状态枚举（`ApiKeyStatus`）

`STATUS_LABEL`（`derive.ts:65-72`）+ `STATUS_MAP` 徽章样式（`ApiKeyTable.tsx:40-47`）；原型 `apiKeyStatusLabel/Class`（`App.tsx:13427-13440`）。

| status | 标签 | 徽章 variant |
|---|---|---|
| `active` | 启用中 | success（带点） |
| `rotation_required` | 待轮转 | info |
| `limited` | 已达限额 | warning |
| `expired` | 已过期 | warning |
| `disabled` | 已停用 | outline |
| `revoked` | 已撤销 | danger |

**状态筛选下拉**（`index.tsx:431-439`）：全部状态 / 启用中 / 已达限额 / 已过期 / 已停用 / 即将过期（`expiring` 客户端过滤；轮转是过渡态，不作常规筛选项）。

### 2.5 详情抽屉字段（`ApiKeyDetailDrawer.tsx` / 原型 `App.tsx:12916-12977`）

| 分区 | 字段标签 | 值 / 枚举 |
|---|---|---|
| 基础信息 | 类型 | `KEY_TYPE_LABEL[keyType]` `:324` |
| | 负责人 | `responsible.display_name || email || —` `:325` |
| | 到期时间 | 时间 / `永不过期` `:326` |
| 用量 | 本期消费 | 金额 / `—` `:335` |
| | 请求数 | `toLocaleString` / `—` `:336` |
| | Tokens | `toLocaleString` / `—` `:337` |
| 安全护栏·生效规则预览（3 层槽 `LAYER_SLOTS`） | 全局护栏 / 个人护栏 / Key 护栏 | 空值文案：全局→`未配置`；Key→`不使用Key护栏`；服务 Key 个人护栏→`个人预算不适用`；无个人护栏→`全局默认个人预算` `:67-71,352-389` |
| 预算闸门（`GATE_LABEL`） | `guardrail_total=工作空间总预算` / `per_member=个人预算` / `per_api_key=Key 预算` | 金额 / `每{period}` + 来源护栏 `:72-76,394-415` |
| 规则清单（3 卡恒显） | 模型黑名单 / IP 白名单 / 提示词注入 | 值空→`不限制`；来源空→`未配置规则` `:420-453` |
| 提示词注入模式 | `PROMPT_INJECTION_LABEL[mode]` | 见 §2.7 |
| 最近调用 | — | 时间 + `N requests · 金额` / `尚未调用`；action=`跳转日志` `:466-491` |
| 操作审计（`AUDIT_ACTION_LABEL`） | — | `创建/更新/启用/停用/轮转/删除 API Key`、`查看完整 Key`；空态 `暂无审计记录（审计接口待上线）` `:92-100,494-510` |

轮转提示条文案：标题 `新 Token 已生效，旧 Token 暂不失效`，正文 `请复制新 Token 并替换到调用方配置中。验证通过后点击"已轮转"，旧 Token 将立即失效。`（`:283-284`，与原型 `App.tsx:12911-12912` 一致）。

### 2.6 创建表单字段文案（`CreateKeyModal.tsx` + i18n `zh.json:174-187`）

| 字段 | 标签 | 占位 / 选项 |
|---|---|---|
| Key 名称 | `Key 名称`（`apiKeys.createModal.nameLabel`） | 占位 `如：生产测试 Key`；空校验 `密钥名称不能为空` |
| Key 类型 | `Key 类型` | 3 卡（标签+description，见 §2.2）；无权限卡显 `无创建权限`，hover `你没有创建此类型 Key 的权限` `:439-449` |
| 负责人（成员 Key） | `负责人` | 占位 `请选择工作区成员`；空成员 `该工作区暂无成员` `:457-483` |
| 负责人（服务 Key·企业） | `负责人` | 占位 `请选择服务 Key 负责人` `:494-521` |
| 维护人（服务 Key·个人租户） | — | 文案 `维护人为自己（{账户}）` `:490-493` |
| 过期时间 | `过期时间` + `（必填，不可永不过期）`/`（可选，不填则永不过期）` | `DateRangePicker`；占位 `选择过期失效时间`；预设见 `EXPIRATION_PRESETS` `:524-543` |
| 高级设置 | `高级设置` / `配置当前 Key 绑定的安全策略` | 折叠，默认收起 `:546-567` |
| Key 护栏 | `Key 护栏` | `不使用 Key 护栏` + 护栏列表；无护栏 `暂无 Key 护栏` `:573-606` |
| 预览 tile | `已选 Key 护栏`/`当前策略` → 护栏名 / `不使用 Key 护栏` → 预算 / `未绑定 Key 护栏` | `:608-620` |
| 底栏按钮 | `取消` / `立即创建`（`apiKeys.createModal.confirm`） | `:700-712` |

**过期预设** `EXPIRATION_PRESETS`（`constants.tsx:55-62`）：`永不过期 / 24 小时后 / 7 天后 / 30 天后 / 1 年后 / 自定义截止日期`。原型 `apiKeyExpiryPresetOptions`（`App.tsx:12987-12993`）：`永不过期 / 24 小时后 / 7 天后 / 30 天后 / 自定义截止日期`。

创建成功提示（`toast.createSuccess`）：`密钥 "{name}" 创建成功`。

### 2.7 提示词注入 / 预算聚合文案

- 提示词注入 `PROMPT_INJECTION_LABEL`（来自 `guardrails/derive`，创建预览 `CreateKeyModal.tsx:382` / 详情 `:448`）——枚举见 [guardrails.md §2.3](./guardrails.md)。
- 创建预览预算聚合 `AGG_LABEL`（`CreateKeyModal.tsx:296-300`）：`guardrail_total=总额 / per_member=每人 / per_api_key=每 Key`；预算闸门行 `budgetGateRows` 标签 `工作空间总预算 / 个人预算 / Key 预算`，无值 `不限额`，来源 `生效规则`/`未配置预算`（`:356-368`）。

### 2.8 空态 / 按钮 / 提示文案

| 场景 | 文案 | 代码 |
|---|---|---|
| 筛选无结果 | 标题 `没有符合筛选条件的 Key`；描述 `试试调整类型、状态、负责人筛选或搜索关键词`；按钮 `清空筛选` | `ApiKeyTable.tsx:122-133` |
| Member 自领空态 | 标题 `你名下暂无 API Key`；描述 `仅展示由你负责的 Key；如需新的 Key，请联系空间负责人创建或指派给你` | `ApiKeyTable.tsx:134-148` / `zh.json:207-210` |
| 空间无 Key | 标题 `当前工作空间还没有 API Key`；描述 `创建第一个 API Key，即可获取运行凭证接入模型调用`；按钮 `创建 API Key`（有权限时） | `ApiKeyTable.tsx:149-164` |
| 复制不可用·遗留 | `该密钥创建于「支持复制」功能上线之前，明文不可找回；请轮换新建密钥` | `zh.json:167` |
| 复制不可用·失效 | `密钥已撤销或过期，无法复制` | `zh.json:168` |
| 撤销确认 | 标题 `确定删除该密钥吗？`；正文 `密钥删除后立即失效、从列表中移除且不可恢复，所有使用该密钥的网关请求将被阻断！` | `zh.json:170-173` |
| 停用确认 | 标题 `确认停用 API Key`；正文 `停用后「{name}」将立即停止调用，可稍后重新启用。` + 回显 Masked Key | `index.tsx:605-627` |
| 创建成功 Modal | 标题 `API Key 创建成功`；描述 `请立即复制并保存，关闭后将无法再查看完整密钥。`；按钮 `快速接入` / `我已保存密钥` | `index.tsx:512-519` |
| 轮转成功 Modal | 标题 `轮转成功`；描述 `新 Token 已生效、只展示一次…旧 Token 仍在过渡期，验证无误后再点「已轮转」使其失效。`；按钮 `我已复制 Token` | `index.tsx:543-546` |
| 确认完成轮换 | 标题 `确认完成轮换`；描述 `确认后旧 Token 将立即失效，新 Token 保持生效。`；按钮 `取消`/`已轮转` | `index.tsx:559-569` |
| 无权限进入 | `ForbiddenState`（业务码 40301） | `index.tsx:385-392` |

---

## 3. 不同身份下的显示差异（重点）

### 3.0 判定机制总述

**PRD 原型**（前端本地判定，真源）：
- `isTenantWideRole(role)` = `owner || admin`（`App.tsx:3075-3077`）
- `isResponsibleForWorkspace(identity, wsId)` = 该空间 ∈ `responsibleWorkspaceIds`（`:3121-3123`）—— 即 space owner
- **可见范围** `canSeeAllWorkspaceKeys` = 非企业租户 **||** 租户级角色 **||** 本空间负责人（`:12200-12201`）；否则只看 `record.owner === currentMember`（`:12202-12204`）
- **可管理某 Key** `canManageApiKey` = 租户级角色 **||** 本空间负责人 **||** `record.owner === 自己`（`:3156-3160`）
- **可创建托管 Key**（成员/服务）`canCreateManagedKeys` = 非企业 **||** 租户级角色 **||** 本空间负责人（`:13066`）
- **可指派负责人** `canAssignResponsibleMember` = 企业 **&&**（租户级角色 **||** 本空间负责人）（`:13067`）
- **可变更负责人** `canChangeKeyOwner` = 非私有 Key **&&**（租户级角色 **||** 本空间负责人）（`:12328-12331`）
- **永不过期** 仅 `canCreateManagedKeys` 放开，普通 Member 默认 `30d`（`:13068-13070`）

**现状代码**（后端裁剪 + capabilities + 权限双闸）：
- **行可见性完全由后端裁剪**（`index.tsx:112-113`）：成员只回自己的行；页头提示据全量视角是否含他人 Key 派生 `showsOthers`（`:177-182`），而非前端角色判定。运行页**无企业/我的视图切换**。
- **行级动作**走 `capabilities.can_*` 优先、`usePermissions` 权限回退：`cap(itemFlag, permFallback)`（`derive.ts:142-144`）。
- **权限码按「类型 × 动作」细分** `KEY_ACTION_PERMS`（`derive.ts:23-44`）：`canAction(type, action) = hasPermission(KEY_ACTION_PERMS[type][action])`（`index.tsx:103-106`）。权限唯一来源 `GET /auth/session` 的 `permissions.granted`，fail-closed（`use-permissions.ts:16-25`）。
- **空间负责人**判定来源 `GET /workspaces` 的 `my_role==='ws_owner'` 汇总的 `ownedWorkspaceIds`（`use-tenant-role.ts:51-58`），非 session。

具体动作 → 权限码（`derive.ts:23-44`；`can_enable/can_disable` 共用 `*_DISABLE_*`）：

| 动作 | personal | member | service |
|---|---|---|---|
| edit | `api_keys.personal:edit` | `api_keys.member:edit` | `api_keys.service:edit` |
| revoke(删除) | `api_keys.personal:revoke` | `api_keys.member:revoke` | `api_keys.service:revoke` |
| disable(启用/停用) | `api_keys.personal:disable` | `api_keys.member:disable` | `api_keys.service:disable` |
| rotate(轮转) | `api_keys.personal:rotate` | `api_keys.member:rotate` | `api_keys.service:rotate` |
| change_owner | —（私有恒本人） | `api_keys.member:change_owner` | `api_keys.service:change_owner` |
| create | `api_keys.personal:create` | `api_keys.member:create` | `api_keys.service:create` |
| reveal(明文) | `api_keys:reveal`（不分类型） | | |

（权限定义 `permissions.ts:24-60`；菜单挂载 `permission-catalog.ts:117-141`）

### 3.1 逐角色差异

#### tenant owner / tenant admin（租户级角色 `isTenantWideRole`）

- **列表可见范围**：企业视图，**看本工作空间全部成员的 Key**（`canSeeAllWorkspaceKeys=true`）。页头提示 `作用域：当前工作空间 · 显示本空间全部成员的 API Key（N 位成员）`（`index.tsx:458-459`）。
- **列/入口**：负责人列会出现「创建人 X」副标（跨人可见）；「全部负责人」筛选有多选项；创建按钮显示（`canCreate` 命中任一 create 权限）。
- **操作**：对全部 Key 可 创建（三类型全开）/ 编辑 / 停用 / 启用 / 轮转 / 删除 / 变更负责人（非私有）。原型 `canManageApiKey=true`、`canChangeKeyOwner=true`。
- **创建表单**：三类型卡全可选（`canCreateManagedKeys=true`），可指派负责人（`canAssignResponsibleMember=true`），可选「永不过期」。
- **空态**：走「当前工作空间还没有 API Key」（非自领空态）。

#### space owner（企业普通成员 + `my_role==='ws_owner'` / 原型 `isResponsibleForWorkspace`）

- **列表可见范围**：**在其负责的空间内看全空间成员的 Key**（`canSeeAllWorkspaceKeys=true`，因 `isResponsibleForWorkspace` 命中）。页头同租户级角色显「全部成员」提示。在**非其负责的空间**则退化为只看自己。
- **操作**：对本空间内所有 Key `canManageApiKey=true`（可停用/启用/轮转/删除）；`canChangeKeyOwner=true`（非私有 Key）。
- **创建表单**：`canCreateManagedKeys=true`（可建成员/服务 Key）、`canAssignResponsibleMember=true`、可选永不过期。
- 现状实现中，space owner 的行级能力仍以后端 `capabilities.can_*` 为准，前端权限码回退（其 session 在该空间应下发对应 `api_keys.*` 动作权限）。埋点 `is_space_owner` 由 `ownedWorkspaceIds.includes(workspaceId)` 判定（`index.tsx:108-110`）。

#### member（企业普通成员，非空间负责人）

- **列表可见范围**：**只看自己负责的 Key**（后端只回自己的行；原型 `canSeeAllWorkspaceKeys=false` → `record.owner===自己`）。页头提示 `作用域：当前工作空间 · 仅展示由你负责的 Key`（`index.tsx:460`）；原型显 `仅展示由你负责的 Key。`（`App.tsx:12412`）。
- **列差异**：负责人列基本不出现「创建人」副标（都是自己）；「全部负责人」筛选实际只有自己一项。
- **入口/操作**：
  - 创建入口：**仅当拥有 `api_keys.personal:create`** 时显示；创建抽屉里**成员卡/服务卡置灰**（`canCreateManagedKeys=false`），hover 提示 `仅 Owner/Admin 或本空间负责人可创建，Member 只能创建私有 Key。`（原型 `App.tsx:13243`）/ 现状 `你没有创建此类型 Key 的权限`（`CreateKeyModal.tsx:426`）。
  - 只能管理 `owner===自己` 的 Key（`canManageApiKey` 第三分支）；对自己的私有 Key 可停用/启用/轮转/删除，但**无变更负责人**（私有 Key `canChangeKeyOwner=false`）。
  - 表格「停用/启用」按钮仅在 `canToggle` 命中时出现（`ApiKeyTable.tsx:180-182,301-308`）。
- **过期时间**：普通 Member `canUseNeverExpiry=false`，「永不过期」预设置灰（hover `仅 Owner/Admin 或空间负责人可选择永不过期。` `App.tsx:13287`），默认 `30d`；现状对应 `mustSetExpiry = isEnterprise && !canManage` → 过滤掉 `all` 预设，标签变 `（必填，不可永不过期）`（`CreateKeyModal.tsx:91,113-121,528`）。
- **空态引导**：走 `selfScopeOnly` 空态 `你名下暂无 API Key` / `仅展示由你负责的 Key；如需新的 Key，请联系空间负责人创建或指派给你`（`ApiKeyTable.tsx:73-74,134-148`）。若无任何 create 权限，空态**不显示创建按钮**（`canCreate=false`）。

#### 个人租户（personal tenant，非企业）

- `canSeeAllWorkspaceKeys=true`（`tenantKind!=='enterprise'`），看自己空间全部 Key。
- **无「成员 Key」**：类型筛选与创建卡都隐藏 member（`index.tsx:428`、`CreateKeyModal.tsx:415`）。
- 服务 Key **不显示「负责人」字段**，改显 `维护人为自己（{账户}）`（`CreateKeyModal.tsx:488-493`；需求方#210）。

### 3.2 明文复制（reveal）差异（跨角色）

「复制完整明文」入口受 `canReveal = hasPermission('api_keys:reveal')` 控制（`index.tsx:102`）。按钮 disabled 分层原因（`ApiKeyTable.tsx:183-190`）：无 reveal 权限 → `无查看 API Key 明文权限`；非 active → `密钥已撤销或过期，无法复制`；无密文（遗留）→ 遗留提示。详情抽屉的复制完整 Key 也需 `canReveal && revealable && status==='active'`（`ApiKeyDetailDrawer.tsx:241`）。

### 3.3 抽屉动作按钮 gate（现状 `ApiKeyDetailDrawer.tsx:218-222`）

- `canToggle`（停用/启用）：`cap(can_disable/can_enable, canAction(type,'disable'))`
- `rotateEnabled`（轮转）：`canAction(type,'rotate') && capabilities.can_rotate===true`（路由未就绪时不做死按钮，点击走「服务暂不可用」）
- `canDelete`（删除）：`cap(can_delete, canAction(type,'revoke')) && status!=='revoked'`
- `rotation_required` 态：轮转按钮替换为「已轮转」（`onCompleteRotation`）

---

## 关键差异备忘（现状 vs 原型）

1. **视图切换**：原型无企业/我的视图切换，运行页作用域恒＝当前工作空间；现状同样移除视图切换，行可见性纯后端裁剪（`index.tsx:112-113`）。
2. **Key 级限额**：原型详情有「用量与限额」+「调整消费限额」；现状已移除，限额统一走护栏预算（`ApiKeyDetailDrawer.tsx:330-332`，需求方#122）。
3. **变更负责人**：原型详情抽屉基础信息里「负责人」为 inline `select`（`canChangeOwner` 时）（`App.tsx:12920-12936`）；现状详情抽屉负责人为**静态展示**（无编辑/变更负责人 UI，见文件头注释 `ApiKeyDetailDrawer.tsx:4`），变更负责人权限码保留但未在此抽屉暴露入口。
4. **权限模型**：原型用本地 identity 启发式；现状升级为「类型 × 动作」细粒度权限码 + 后端行级 `capabilities`（需求方#68）。

---

## 关键文件索引

- `src/pages/api-keys/index.tsx`（页面编排、筛选、权限/视图、弹层挂载）
- `src/pages/api-keys/ApiKeyTable.tsx`（9 列表格、徽章、空态、行动作）
- `src/pages/api-keys/ApiKeyDetailDrawer.tsx`（详情抽屉、护栏预览、审计）
- `src/pages/api-keys/CreateKeyModal.tsx`（创建抽屉、类型卡、高级设置）
- `src/pages/api-keys/ApiKeySummaryCards.tsx`、`ApiKeyProtocolBanner.tsx`、`ConnectModal.tsx`
- `src/pages/api-keys/derive.ts`（类型/状态/权限动作 派生 + 标签常量）、`constants.tsx`（周期/预设/接入客户端）
- `src/config/permissions.ts:24-60`、`permission-catalog.ts:117-141`
- `src/types/workspace.ts`（`ApiKeyItem`/`ApiKeyMember`/`ApiKeyCapabilities`）、`src/hooks/use-permissions.ts`、`use-tenant-role.ts`
- `src/locales/zh.json:160-210`（`apiKeys.*` i18n）
- PRD 真源：`modelgo_prd/src/App.tsx`（类型/常量 `1457-1479`；权限 `3075-3202,13060-13073`；列表 `12400-12480`；详情抽屉 `12845-12980`；创建 `13040-`）
