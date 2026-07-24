# ModelGo Console ·「安全护栏」模块 UI 参考

> **衍生文档 · 非真源** — 基线：PRD 原型 `modelgo_prd` commit `4ef7ee7`（2026-07-22）+ 现状代码，生成 2026-07-24。
> ⚠️ PRD 改版后需重跑同步（见 [README](./README.md)）。冲突时以真源（PRD `App.tsx` + 现状代码）为准。

三源对齐：PRD 原型（`modelgo_prd/src/App.tsx`）是功能真源；现状代码在 `src/pages/guardrails/`；权限码在 `src/config/permissions.ts`。后端尚未交付显式 `scope`/`kind` 字段（#378），现状代码用 `derive.ts` 从 `is_default` + `metadata.scope/kind` + `assignments` 派生兜底。

---

## 1. UI 框架

### 1.1 护栏列表页（`src/pages/guardrails/index.tsx`）

页面根为 `<div className="space-y-6">`，自上而下：

| 区块 | 组件 | 位置 | 说明 |
|---|---|---|---|
| 页头 | `PageHeader` + `WorkspaceTitleTag` | index.tsx:806-824 | 标题 `t('guardrails.title')`="安全护栏"，旁挂工作空间 Tag（#125）；右侧 `actions` 为「创建护栏」按钮，`variant="brand"`、`rounded-full px-5 h-10`，仅 `canCreate` 时渲染 |
| KPI 摘要卡 | `GuardrailSummaryCards` | index.tsx:827 | 见 1.2 |
| 三 scope section | `GuardrailSections` | index.tsx:830-849 | 见 1.3 |
| 配置抽屉 | `GuardrailDetailSheet` | index.tsx:852-889 | 见 1.4 |
| 删除确认 | `GuardrailConfirmModals` | index.tsx:892-897 | 见 1.5 |

403 兼容态：`listGuardrails` 返回业务码 40301 时整页渲染 `PageHeader` + `ForbiddenState`（index.tsx:181, 794-801），不伪装成空态。

### 1.2 KPI 摘要卡（`components/GuardrailSummaryCards.tsx`）

- 容器 `flex flex-wrap gap-4`，元件为 `KpiCard`（`iconLead`）。
- 4 张卡，数据由 `summarize(guardrails)`（derive.ts:355）客户端派生（无 `/summary` 端点）：

| 卡 | i18n key | 文案 | 图标 | 色 | 显隐 |
|---|---|---|---|---|---|
| 全局 | `guardrails.summary.global` | 全局护栏 | `LuShieldCheck` | `--brand-base` | 恒显 |
| 个人 | `guardrails.summary.member` | 个人护栏 | `LuUserRound` | `--mg-success` | `showMember` 时显（个人组织隐藏）|
| Key | `guardrails.summary.key` | Key 护栏 | `LuKeyRound` | `--mg-primary` | 恒显 |
| 提额 | `guardrails.summary.boost` | 提额护栏 | `LuGauge` | `--mg-warning` | 恒显 |

### 1.3 三 scope section（`components/GuardrailTable.tsx`）

外层 `GuardrailSections` → 每 scope 一个 `ScopeSection`（GuardrailTable.tsx:197-248）。

- `ScopeSection` 外壳：`<section class="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border">`；头部 `flex justify-between border-b px-4 py-3`，左侧 `<h4>` 分区标题，右侧仅一个搜索框 `Input variant="search"`（`prefix=LuSearch`, `placeholder="搜索护栏名称"`, `w-56`）。PRD 原型分区头只有搜索框、无有效性筛选（#65）。
- 有行 → 渲染 `<Table>`（`ui/Table`）；无行 → `EmptyState`（`icon` + `title` + 可选「创建护栏」action 按钮，仅无搜索且 `canCreate` 时）。
- `SCOPE_META`（GuardrailTable.tsx:191-195）：

| scope | title | icon | empty 文案 |
|---|---|---|---|
| global | 全局护栏 | `LuShieldCheck` | 暂无全局护栏，当前放开使用 |
| member | 个人护栏 | `LuUserRound` | 暂无个人护栏 |
| key | Key 护栏 | `LuKeyRound` | 暂无 Key 护栏 |

- 分区顺序：全局 → 个人（`showMember` 时，GuardrailTable.tsx:336）→ Key。
- 单元格用合并列减少列数（避免小屏横向滚动）：`NameKindCell`/`BudgetCell`/`GlobalBudgetCell`/`RulesCell`/`MetaCell`/`StatusCell`/`RowActions`。数据字号统一 `DATA_CELL='text-xs text-mg-text-2'`，空占位 `PLACEHOLDER='font-normal text-mg-text-3'`（GuardrailTable.tsx:41-42）。

### 1.4 配置抽屉 `GuardrailDetailSheet`（`components/GuardrailDetailSheet.tsx`）

- 容器 = `ui/SideSheet`（右侧滑出）；创建 + 编辑 + 详情三合一，`isCreating` 分流。
- 抽屉头（DetailSheet.tsx:393-399）：眉标（创建="安全护栏" / 编辑=`{scope}护栏`）+ 标题（创建=`guardrails.modal.createTitle` / 编辑=护栏名 `detailRow?.name`）。
- body `p-6 overflow-y-auto flex-1`，三种互斥态：
  1. **详情加载失败**（DetailSheet.tsx:403-407）：只渲染 `role="alert"` 红框错误说明，表单/保存一律不出（脏数据不盲写，qa#162）。
  2. **创建态**（DetailSheet.tsx:410-511）：委托 `GuardrailFormFields`，`budgetSlot` 传入绑定对象 + 预算控件，保持 PRD 创建顺序：名称 → 分类 → 类型 → section 标题 → 绑定对象 → 预算 → 提额到期 → 模型黑名单 → IP 白名单 → 提示词注入。
  3. **编辑态**（DetailSheet.tsx:514-706）：单滚动体，按派生 `scope` 出一个 section，含 section 标题 `<h4>{scope}护栏` + 预算冲突告警 + 字段 + 只读「操作记录」。
- 底部（DetailSheet.tsx:710-726）：`border-t`，右对齐，取消/关闭 + 创建/保存按钮（`canSubmit` 时才出保存按钮）。无「作用于 N…」预览。

**编辑态按 scope 的分区字段顺序：**

- 全局（DetailSheet.tsx:538-570）：名称 → 工作空间总预算 → 默认个人预算(企业) → 默认 Key 预算 → 模型黑名单 → IP 白名单 → 提示词注入（不可继承）。
- 个人（DetailSheet.tsx:573-623）：名称 → 成员多选 → 预算（提额=不限额|限额分段 / 常规=金额+周期）→ 提额到期时间（仅提额）。
- Key（DetailSheet.tsx:626-700）：名称 → 绑定 API Key → 预算 → 提额到期（仅提额）→ [常规 Key 才有]模型黑名单 + IP 白名单 + 提示词注入（可继承）。

**用到的 ui/* 组件：** `SideSheet` `Button` `Input` `Select`/`SelectItem` `TagInput`；内部自建 `Field`、`InfoTip`、`GlobalBudgetControl`、`MemberKeyBudgetControl`、`MemberKeyBoostBudgetControl`、`PromptInjectionField`、`GuardrailAuditSection`。

### 1.5 删除确认 Modal（`components/GuardrailConfirmModals.tsx`）

- 容器 = `ui/Modal`（`size="sm"`）。title=`guardrails.deleteModal.title`，description 带护栏名插值。
- footer：`outline` 取消 + `destructive` 确认删除（`loading=deleting`）。
- 若删除对象是启用中的全局护栏（`isActiveGlobal`，index.tsx:842-846 判定），body 额外渲染 `mg-warning` 告警框（见 §2.7）。

---

## 2. 字段文案（照 PRD/derive 常量）

### 2.1 三层作用域 + 常规/提额类型

`derive.ts:15-49` / PRD `App.tsx:210-211`。

| 概念 | 枚举值 | 文案（`SCOPE_LABEL`/`KIND_LABEL`）| 定义 |
|---|---|---|---|
| 作用域 global | `global` | 全局 / 全局护栏 | 工作空间默认策略；三档预算闸门 + 模型/IP + 提示词注入。`is_default` 派生。同空间最多 1 条启用中 |
| 作用域 member | `member` | 个人 / 个人护栏 | 绑定成员的预算护栏。个人组织隐藏 |
| 作用域 key | `key` | Key / Key 护栏 | 绑定 API Key 的护栏 |
| 类型 regular | `regular` | 常规 | 预算 ≤ 全局默认（月度折算比对）|
| 类型 boost | `boost` | 提额 | 预算须 > 当前生效预算；必须设到期时间；不配置模型/IP/提示词注入 |

注：PRD `GuardrailKind` 含 `"global"`（App.tsx:211），全局护栏 kind 固定为 `global`；现状代码全局恒 `regular` 且无类型选择器（index.tsx:232-236）。

派生 badge（GuardrailTable.tsx:64-67）：全局 active 显「默认」(warning)；提额显「提额」(warning)、常规显「常规」(brand)。

### 2.2 预算闸门 + 周期枚举

`aggregation_scope`（interfaces/guardrails.ts:11）；档位元信息 `GLOBAL_BUDGET_META`（DetailSheet.tsx:53-57）。

| aggregation_scope | 抽屉 label | 列表展示前缀 | 显隐 |
|---|---|---|---|
| `guardrail_total` | 工作空间总预算 | 总 | 恒显 |
| `per_member` | 默认个人预算 | 个人 | 仅企业组织（`enterpriseOnly`）|
| `per_api_key` | 默认 Key 预算 | Key | 恒显 |

个人/Key 护栏单档预算 label 动态（DetailSheet.tsx:386-387）：常规=「个人预算」/「Key 预算」；提额=「提额预算」。

**周期枚举** `GUARDRAIL_BUDGET_PERIOD_OPTIONS`（derive.ts:28-33）+ `PERIOD_LABEL`（derive.ts:19-24），对齐 PRD `apiKeyLimitPeriodOptions`（App.tsx:1473-1479）：

| value(period_unit) | 文案 | period_length | 月度折算倍率(`PERIOD_TO_MONTHLY`) |
|---|---|---|---|
| `hour` | 每 5 小时 | 5 | 144 |
| `day` | 每日 | 1 | 30 |
| `week` | 每周 | 1 | 5 |
| `month` | 每月 | 1 | 1 |

PRD 另有 `none`="不限额"（App.tsx:1474），现状代码把「不限额」拆成分段按钮而非周期选项。

预算控件文案：金额 placeholder="输入限额金额（最多两位小数）"；分段按钮「不限额 | 限额」（DetailSheet.tsx:82-83, 209-210）；金额无效错误="预算金额无效：大于 0，整数最多 12 位，小数最多 2 位"。列表预算展示 `formatBudget`（derive.ts:263-268）：无金额→「不限额」，否则「¥123 / 每月」。

### 2.3 提示词注入模式枚举

`PROMPT_INJECTION_LABEL`（derive.ts:100-105）+ `PROMPT_INJECTION_HINTS`（derive.ts:108-112）+ 继承（derive.ts:119-120）。PRD `promptInjectionModeLabel`（App.tsx:9865-9872）一致。

| value | 文案 | 命中处理（tooltip hint）|
|---|---|---|
| `off` | 关闭 | —（不解释）|
| `flag` | 仅记录 | 记录命中，请求仍按原内容发送 |
| `redact` | 脱敏 | 将命中内容替换为 `[PROMPT_INJECTION]` 后继续发送 |
| `block` | 拦截 | 直接拒绝请求，不发送给模型 |
| `inherit` | 继承全局护栏 | 仅常规 Key 护栏可选；存库=不写该字段 |

字段标题="提示词注入检测"；InfoTip 标题="命中后的处理方式"（DetailSheet.tsx:254-255 / FormFields.tsx:256-277）。
生效解析（derive.ts:141-157 / PRD `resolveConfiguredPromptInjectionMode` App.tsx:9881-9889）：常规 Key 显式 > 启用中全局 > off；来源标签取护栏名，未配置全局显示「未配置全局护栏」。全局护栏 `allowInherit=false`，常规 Key `allowInherit=true`（index.tsx:231）。

### 2.4 模型黑名单 / IP 白名单

| 字段 | label(i18n) | placeholder | hint | 控件 |
|---|---|---|---|---|
| 模型黑名单 | `guardrails.form.modelBlacklistLabel`="模型黑名单" | `...Placeholder`="搜索模型" | 命中黑名单的模型将被拒绝调用。留空表示不限制。 | `TagInput` + `suggestions=modelSuggestions`（catalog 模型）|
| IP 白名单 | `guardrails.form.ipWhitelistLabel`="IP 白名单" | `...Placeholder`="输入后按回车添加，支持 IPv4/IPv6/CIDR 格式。留空表示不限制。" | 同 placeholder | `TagInput allowFreeText tagVariant="mono"` + `ipValidator`；无效时提示"无效的 IP 地址格式"（FormFields.tsx:122-139, 243-249）|

仅全局护栏与常规 Key 护栏配置（`showModelIp = scope==='global' || (scope==='key' && kind==='regular')`，index.tsx:229）；个人护栏、提额护栏隐藏且落库清空为 `[]`（index.tsx:563-565）。

### 2.5 列表列头（`GuardrailTable.tsx`）

- **全局护栏表**（GuardrailTable.tsx:311-319）：护栏 | 预算（总 / 个人 / Key）| 规则 | 创建 / 更新 | 状态 | 操作
- **个人护栏表**（:346-354）：护栏 | 成员 | 预算 | 创建 / 更新 | 状态 | 操作
- **Key 护栏表**（:381-390）：护栏 | 作用对象 | 预算 | 规则 | 创建 / 更新 | 状态 | 操作

列内文案：规则列（`RulesCell` :104-116）="黑名单 {n|不限} · IP {n|不限}" + "注入 {label}"，提额类型显「不适用」；预算列提额次行="到期 {time}" 或「永不过期」；成员/Key 计数 `CountBadge`="{n} 名成员"/"{n} 个 Key"；创建人缺失="—"；状态列为 `Switch`（无文字，语义靠 title/aria "启用"/"停用"）；操作列 = 「编辑」(有编辑权)/「查看」(只读) + 「删除」(有删除权)。

### 2.6 配置抽屉字段标签/占位/空态

| 字段 | label | placeholder / 空态 | 来源 |
|---|---|---|---|
| 护栏名称 | 创建="护栏名称" / 编辑=`guardrails.form.nameLabel`="名称" | `guardrails.form.namePlaceholder`="例如：提示词注入防御" | FormFields.tsx:144 / DetailSheet.tsx:533 |
| 描述 | `guardrails.form.descLabel`="描述 (可选)" | `...descPlaceholder`="对此安全规则进行简要描述"（仅编辑态）| FormFields.tsx:149-150 |
| 护栏分类 | "护栏分类" | 分段按钮「全局护栏/个人护栏/Key 护栏」，无权限项置灰 title="你没有创建{X}护栏的权限" | FormFields.tsx:156-176 |
| 护栏类型 | "护栏类型" | 分段按钮「常规护栏/提额护栏」，无提额权 title="你没有创建提额护栏的权限"（仅非全局）| FormFields.tsx:180-198 |
| 成员 | `guardrails.form.membersLabel`="成员" | `...membersPlaceholder`="搜索成员"；空态="当前工作空间暂无可绑定的成员。" | DetailSheet.tsx:575-589 |
| 绑定 API Key | "绑定 API Key" | placeholder="搜索 API Key"；空态="当前工作空间暂无可绑定的 API Key，请先到「API Keys」页创建后再绑定。" | DetailSheet.tsx:628-642 |
| 提额到期时间 | "提额到期时间" | `datetime-local` | DetailSheet.tsx:612 / FormFields.tsx:207 |
| 操作记录 | "操作记录" | 空="暂无操作记录"；行="{action}"+"{time} · {actor}" | DetailSheet.tsx:269-295 |

### 2.7 按钮/Toast/告警文案

- 抽屉按钮：取消=`common.cancel` / 关闭="关闭"；创建=`guardrails.modal.confirmCreate`="创建护栏" / 编辑="保存护栏"（DetailSheet.tsx:713-721）。
- 页头/空态创建按钮：`guardrails.create`="创建护栏"。
- 删除 Modal：title=`guardrails.deleteModal.title`="删除护栏"；description="确定要删除安全护栏「{name}」吗？此操作不可撤销。"；确认=`...confirm`="确认删除"。
- 删除启用中全局告警（ConfirmModals.tsx:35-37）："这是当前启用中的全局护栏。删除后该工作空间将无全局默认预算与模型/IP 边界，按「无全局护栏，放开使用」处理。"
- 全局至少保留一条：状态开关置灰 title="需至少保留一条启用的全局护栏"（GuardrailTable.tsx:328）。
- 预算冲突："预算配置数据错误：存在多条生效中的预算策略，请联系管理员处理"（DetailSheet.tsx:528）。
- Toast（`guardrails.toast.*`）：创建成功="安全护栏已创建" / 更新成功="安全护栏已更新" / 删除成功="安全护栏已删除" / 各 error / nameRequired="请输入名称"。
- 校验 toast（index.tsx）：绑定必填="请至少绑定一个成员"/"请至少绑定一个 API Key"（#498）；提额="提额护栏必须设置到期时间"；常规超额="按当前周期预计最高可使用 ¥X/月，超过默认个人预算 …。如需提高额度，请创建个人提额护栏。"（#190/#239）；提额不足="提额预算必须大于当前生效预算（¥X）"。

---

## 3. 不同身份下的显示差异

### 3.1 权限模型（现状代码 vs PRD）

**现状 console-web：细粒度权限码驱动，无本地角色→权限映射表。** `usePermissions().hasPermission` 只读 `session.permissions.granted`（use-permissions.ts:16-25，fail-closed，缺失即空权限）。角色差异实际由后端权限矩阵下发，前端只按码显隐。

护栏权限码（`permissions.ts:65-78`，「分类 × 动作」细分 #57/#479，扁平 `guardrails:create/edit/delete` 已退役）：

| 码常量 | id | 作用 |
|---|---|---|
| `GUARDRAILS_VIEW` | `guardrails:view` | 查看菜单 |
| `GUARDRAILS_CREATE_GLOBAL` | `guardrails.global:create` | 建全局 |
| `GUARDRAILS_CREATE_MEMBER` | `guardrails.member:create` | 建个人 |
| `GUARDRAILS_CREATE_KEY` | `guardrails.key:create` | 建 Key |
| `GUARDRAILS_CREATE_BOOST` | `guardrails.boost:create` | 建提额 |
| `GUARDRAILS_EDIT_GLOBAL/MEMBER/KEY` | `guardrails.{scope}:edit` | 配置对应分类 |
| `GUARDRAILS_DELETE_GLOBAL/MEMBER/KEY` | `guardrails.{scope}:delete` | 删除对应分类 |
| `GUARDRAILS_ASSIGNMENT_EDIT` | `guardrails.assignment:edit` | 编辑作用范围 |
| `GUARDRAILS_BUDGET_EDIT` | `guardrails.budget:edit` | 编辑预算 |

现状代码消费（index.tsx:132-158）：`canCreateScope/canEditScope/canDeleteScope`（各 `Record<scope, bool>`）+ `canEditAssignment` + `canEditBudget` + `canCreateBoost`。`canCreate = 任一 scope 可建`（index.tsx:155）。

**PRD 原型：以角色 + 空间归属推导（授权真源，需求方 #230 空间负责人边界即出自此）：**

- `TenantRole = "owner" | "admin" | "member"`（App.tsx:153）→ 对应 tenant_owner / tenant_admin / tenant_member。
- `isTenantWideRole = owner || admin`（App.tsx:3075-3077）。
- `canManageWorkspaceConfig(wsId) = isTenantWideRole || isResponsibleForWorkspace(wsId)`（App.tsx:3125-3127）——space owner = member 但 `responsibleWorkspaceIds` 含该空间。
- `canViewWorkspaceConfig(wsId) = canManage || workspaceIds.includes(wsId)`（App.tsx:3129-3131）——普通 member 在该空间即可 view。

护栏创建/编辑判定（App.tsx:3187-3202）：

```
canCreateGuardrailScope(scope,kind,wsId):
  global | member          → canManageWorkspaceConfig      (owner/admin/space-owner)
  key & boost              → canManageWorkspaceConfig
  key & regular            → canViewWorkspaceConfig         (含普通 member)
canEditGuardrailRecord(record):
  global | member          → canManageWorkspaceConfig
  key & boost              → canManageWorkspaceConfig
  key & regular            → canManage OR (在该空间 AND createdBy===自己)
canDelete = canEdit
canCreateBoostGuardrail    → canManageWorkspaceConfig
```

Key 护栏创建对 member 还额外要求「有可管理的 API Key」：`canCreateKeyGuardrailForWorkspace`（App.tsx:3178-3181）→ `getManageableKeyGuardrailApiKeysForWorkspace`（自己是 owner/creator 的 Key，App.tsx:3162-3176）。

### 3.2 逐角色差异

| 能力 | tenant owner | tenant admin | space owner（member+负责该空间）| 普通 member（仅在该空间）|
|---|---|---|---|---|
| 建/改/删 **全局**护栏 | ✅ | ✅ | ✅（仅所负责空间）| ❌ |
| 建/改/删 **个人**护栏 | ✅ | ✅ | ✅（仅所负责空间）| ❌ |
| 建/改/删 **常规 Key** 护栏 | ✅ | ✅ | ✅ | ✅（仅自己是 owner/creator 的 Key，且改/删限自己创建的记录）|
| 建/改/删 **提额**护栏（任一 scope）| ✅ | ✅ | ✅ | ❌ |
| 编辑预算 / 作用范围 | ✅ | ✅ | ✅（负责空间）| 仅随常规 Key 护栏 |
| 启用/停用开关 | ✅ | ✅ | ✅（负责空间）| 随其可编辑记录 |

space owner 边界（#230）：`canManageWorkspaceConfig` 仅对 `responsibleWorkspaceIds`（`WorkspaceItem.my_role==='ws_owner'` 汇总，use-tenant-role.ts:51-54）内的空间为真；对未负责的空间与普通 member 等同（只在 workspaceIds 内可读、仅常规 Key）。现状代码把这套判定完全交给后端权限矩阵下发到 `granted`，前端不再做角色启发式（index.tsx:135-137 注释明确）。

### 3.3 组织类型（personal vs enterprise）差异

判定：`showMember = tenant.type !== 'personal'`（index.tsx:129）；PRD `isPersonalTenant`（App.tsx:3079-3081）+ `showMemberGuardrails = !isPersonalTenant`（App.tsx:11459）。`useTenantRole.isEnterprise = tenant.type==='enterprise'`。

个人组织（personal）下：
- **隐藏「个人护栏」摘要卡**（SummaryCards.tsx:32）。
- **隐藏「个人护栏」分区/表格**（GuardrailTable.tsx:336 `{showMember && …}`）。
- 创建抽屉分类分段**隐藏「个人护栏」选项**（FormFields.tsx:163-165 `.filter(s => s!=='member' || showMemberScope)`）。
- 全局护栏三档预算**隐藏「默认个人预算」档**（`per_member`, `enterpriseOnly`，DetailSheet.tsx:467, 540；index.tsx:336, 582 亦不下发/不校验该档）。
- `openCreate` 默认分类跳过 member（index.tsx:457）。

企业组织显示全部三分区 + 三档预算。

### 3.4 section/入口/操作 的隐藏 vs 置灰规则

| 元素 | 隐藏条件 | 置灰条件 |
|---|---|---|
| 页头「创建护栏」按钮 | `!canCreate`（三分类全无创建权）| — |
| 分区空态「创建护栏」按钮 | 有搜索关键词 或 `!canCreate` | — |
| 个人护栏 分区/卡/分类选项/默认个人预算档 | 个人组织（`!showMember`）| — |
| 分类分段选项 | member 选项在个人组织隐藏 | 无该分类创建权→置灰 + title（FormFields.tsx:167-173）|
| 类型分段「提额护栏」 | — | `!canCreateBoost`→置灰 + title（FormFields.tsx:189-194）|
| 行内「删除」按钮 | 该 scope 无 delete 权（`canDelete[scope]`，GuardrailTable.tsx:175）| — |
| 行内动作「编辑」↔「查看」 | 不隐藏 | 无 edit 权时文案降级为「查看」，抽屉内字段 `disabled`（GuardrailTable.tsx:172）|
| 状态开关 | — | `!canEdit[scope]` 或 全局仅剩 1 条 active（`lockOffReason`）→ `disabled`（GuardrailTable.tsx:149, 328）|
| 抽屉底部「保存护栏」按钮 | `!canSubmit`（无任一写权/必填缺失/预算冲突）时不渲染（DetailSheet.tsx:714）| — |
| 抽屉内各字段 | — | 按 `canEdit`/`canEditAssignment`/`canEditBudget` 分别 `disabled`（DetailSheet.tsx:534, 546, 583 等）|

编辑态保存门 `editCanSave`（DetailSheet.tsx:378-381）：需 `canEdit || canEditAssignment || canEditBudget` 且无冲突、必填齐全；创建态 `createCanSave = canCreateScope[scope] && (kind!=='boost' || canCreateBoost)`（:382）。

### 3.5 提额 / 模型黑名单 / IP 白名单 在个人护栏、提额下的隐藏

由 `showModelIp`（index.tsx:229）+ `showPromptInjection`（=`showModelIp`, index.tsx:230）+ `allowPromptInjectionInherit`（index.tsx:231）统一控制：

| 护栏 | 模型黑名单 | IP 白名单 | 提示词注入 | 继承全局 |
|---|---|---|---|---|
| 全局 | ✅ | ✅ | ✅ | ❌ |
| 常规 Key | ✅ | ✅ | ✅ | ✅ |
| 提额 Key | ❌ | ❌ | ❌ | — |
| 个人（常规/提额）| ❌ | ❌ | ❌ | — |

隐藏即落库清空 `[]`（index.tsx:563-565）；FormFields.tsx:220/233/253 与 DetailSheet.tsx:675-698（Key 仅 `kind==='regular'` 才渲染这三项）落实。提额护栏额外强制「提额到期时间」必填，且预算支持「不限额|限额」分段（常规恒限额必填），见 §2.7 校验。

---

## 关键文件索引

- `src/pages/guardrails/index.tsx`（页面编排、权限消费、校验、突变）
- `src/pages/guardrails/derive.ts`（scope/kind/预算/提示词注入 派生 + 全部标签常量）
- `src/pages/guardrails/components/GuardrailDetailSheet.tsx`（三合一抽屉、编辑态分区）
- `src/pages/guardrails/components/GuardrailFormFields.tsx`（创建态表单、分段按钮、IP 校验）
- `src/pages/guardrails/components/GuardrailTable.tsx`（三分区、列头、单元格、状态锁）
- `src/pages/guardrails/components/GuardrailSummaryCards.tsx`、`GuardrailConfirmModals.tsx`
- `src/config/permissions.ts:65-78,177-182`、`permission-catalog.ts:143-164`
- `src/interfaces/guardrails.ts`、`src/hooks/use-permissions.ts`、`use-tenant-role.ts`
- `src/locales/zh.json:501-576`（`guardrails.*` i18n）
- PRD 真源：`modelgo_prd/src/App.tsx`（类型 `152-215`；权限 `3075-3202,10101-10103`；创建 `GuardrailCreateModal 11436-`；详情 `GuardrailDetailDrawer 11830-`；提示词/预算解析 `9850-9969`）
