# ModelGo Console ·「账单管理」模块 UI 参考

> **衍生文档 · 非真源** — 基线：飞书 PRD《ModelGo PRD by Release》V1.0.4 `ModelGo Console 重构 PRD：账单管理页面（v0.1）`（node `EXbgwriwiiXY7Fk44ZScVXi9n7b`，2026-07-27 拉取）+ 现状代码，生成 2026-07-27。
> ⚠️ **口径提醒**：本仓根 `CLAUDE.md` / `docs/COLLABORATION.md` 标注「当前只做 V1.0.3」，但现状代码已大量实现本 1.0.4 PRD 的措辞与字段（recordRef 前缀、扣减顺序文案、余额三桶等逐字对应），说明账单模块的 1.0.4 重构**已提前开工**。本次改动前请与需求方确认这是否为已批准的例外，而不是默认可扩展范围。
> 三源对齐：**飞书 PRD**（功能真源）｜**现状代码**（`src/pages/billing/`，视觉/布局真源）｜**权限**（`src/config/permissions.ts` + `permission-catalog.ts`）。

---

## 1. UI 框架

页面根 `space-y-6`（`index.tsx`），自上而下 3 段：

| 顺序 | 区块 | 组件 | 说明 |
|---|---|---|---|
| 1 | 页头 | `PageHeader` | 标题 `billing.title` |
| 2 | 余额概览卡 | `BalanceCard` | 可消费合计 + 主/赠送/奖励三桶 tab 切换器 + 刷新/兑换/充值按钮 |
| 3 | 入账+发票卡 | `BillingLedgerPanel` | 内部两个页签：入账记录 / 发票（`BillingInvoiceTab`）。~~`BillingOrdersPanel`~~ 旧三页签面板（充值记录/赠送余额明细/奖励记录 + 订单详情侧栏）已删除，见 §5.2 |

挂载弹层：`TopUpModal`（充值）、兑换优惠码 `Modal`（内嵌 `PromoRedeemForm`）、`ApplyInvoiceModal`、`InvoiceTitleModal`。

**PRD 页面模块顺序（§7.2）**：标题区 → 余额概览（含扣减顺序/充值/兑换）→ 余额桶与风险区（主/赠送/奖励 + 低余额提醒）→ 内容页签（入账记录 / 发票）。**现状代码与此顺序一致，唯独「低余额提醒」在余额区完全缺失**（见 §4.2）；**「充值记录/赠送余额明细/奖励记录」旧三页签 + 订单详情侧栏已删除（commit `811835c`），PRD 全文没有这套结构，§2.1 原文直接把它列为要解决的问题（入账记录表就是替代方案），之前一直和新版入账记录表同屏并存，是本文档最初几版审核时漏掉的一处偏差，见 §5.2**。

不随工作空间切换过滤（PRD §7.1 工作空间选择器影响范围：不影响账单管理）——现状代码用 `activeTenantId` 而非 workspace id，一致。

### 1.1 原型实测记录（浏览器点击确认，非仅读文字）

之前几版结论是读 `App.tsx` 源码/PRD 文字得出的。为了不漏弹窗和交互细节，本次用 `pnpm --dir modelgo_prd dev` 把原型跑起来（`http://localhost:5173`，企业 Owner 身份），把账单管理页所有弹层实际点了一遍，截图逐一核对。结论更新如下：

| 弹层/区块 | 原型实际表现 | 与现状代码对比 |
|---|---|---|
| 低余额提醒 | 余额桶下方常驻一行：通知人多选下拉（勾选项精确显示 `Jy. Owner` / `Lin Admin`）+ 阈值输入框 `¥1000` + 开关，三者同排 | 现状**完全没有这个区块**，见 §4.2 |
| 入账记录表 | 列顺序：编号/时间/**余额桶/类型**/金额/渠道/状态，共 7 列，**无发票列**；底部原文「共 6 条记录 · 每页 10 条」 | 现状 8 列（多发票列）+ `page_size:15`，见 §4.1 |
| 「充值」弹窗 | 标题「账户充值」；预设档位 **¥100/¥500/¥1000/¥5000（4 档）**；支付方式**只有支付宝一个选项**；底部文案「充值实时到账主余额，充值金额均可开具发票。」 | 现状 `TopUpModal` 预设 6 档（10/50/100/200/500/1000）+ 支付宝/微信/Stripe 三选一——**原型只做国内单一支付方式的简化版，现状代码是三渠道扩展版**，需确认是否需要收窄回原型口径还是保留三渠道（多渠道大概率是后来的真实需求，不建议倒退） |
| 「兑换优惠码」弹窗 | 标题「兑换优惠码」；单一输入框 placeholder「输入线下收款或促销活动获得的优惠码」；底部提示「兑换金额将进入赠送余额，消费时优先扣减。」 | 现状 `PromoRedeemForm` 结构一致，提示文案措辞略有出入，可对齐 |
| 「发票抬头」弹窗 | 票种下拉**只有「增值税普票／增值税专票」两个选项，没有 `overseas`**（进一步坐实 §4.3 结论，原型压根没做这个选项）；**切到专票后字段不变**，仍只有票种/抬头名称/税号/接收邮箱 4 项 | 现状 `InvoiceTitleTab.tsx` 专票分支多出「注册地址/注册电话/开户银行/银行账号」4 项——**现状比原型多做了字段**，见下方新增待办 |
| 「申请开票」弹窗 | **单页 modal**：充值单勾选列表（全选/单选）+ 发票抬头选择器 + 底部「提交申请(¥X)」，无抬头时按钮置灰并提示「还没有发票抬头，请先新增抬头后再申请开票」+ 跳转链接 | 现状 `ApplyInvoiceTab.tsx` 是**两步流程**（列表页→确认页，确认页展示抬头详情卡片、发票类型、可展开收起充值单列表）——**现状比原型复杂得多**，见下方新增待办 |
| 发票记录状态筛选 | 下拉只有「开票中(processing)／已开票(issued)」**两态**，比 PRD 文字提到的三态（含 `failed`）还少 | 现状 5 态（pending/invoicing/invoiced/failed/voided），差距比之前评估的更大 |

**由此新增两个此前只读代码/文字时漏掉的待办**：
- **专票字段（注册地址/电话/开户行/账号）是否要保留**：原型没做，PRD §8.7.3.1 文字里"专票场景需严格校验"隐含需要这些信息，但没具体列字段。现状代码这 4 项从哪来的需要查历史单号——不确定是需求方真实反馈还是自行加的，不能默认按原型删掉已上线字段。
- **申请开票是否要简化成原型的单页 modal**：现状的两步流程（列表→确认页）明显比原型精细（抬头详情卡片、发票类型展示、展开/收起），大概率是后续需求方反馈加的体验优化，**默认不应该照原型简化回去**，只是要记录这个差异，别在改列顺序等小项时顺手"对齐原型"给砍了。

---

## 2. 字段文案（照 PRD 常量）

### 2.1 余额概览

| 字段 | PRD 文案 | 现状代码 |
|---|---|---|
| 可消费合计 | 主余额+赠送余额+奖励余额，不减冻结 | `BalanceCard.tsx` `calculateSpendableBalance`，一致 |
| 扣减顺序 | 赠送 → 奖励 → 主余额 | `InfoTip` 文案「调用消费时按 赠送 → 奖励 → 主余额 的顺序扣减」，一致 |
| 赠送余额 hint | 「活动、兑换码等赠送额度，调用消费时优先扣减。」 | 逐字一致 |
| 奖励余额 hint | 「推荐返佣等产生的奖励，调用消费时在主余额前扣减。」不展示转入主余额 | 逐字一致，且已移除转入操作 |

### 2.2 入账记录（PRD §8.6.1 vs 现状 `BillingLedgerPanel.tsx`）

| 字段 | PRD 枚举/格式 | 现状代码 | 差异 |
|---|---|---|---|
| 编号 recordRef | `rch_/redm_/ref_` + `YYYYMMDD_序号` | `rec.record_ref`，格式一致 | 无 |
| 类型 | `recharge/gift/reward`（充值/赠送入账/奖励入账） | 同 | 无 |
| 渠道 | `alipay/admin_recharge/coupon/activity_grant/referral_program` | `channelLabel(rec.channel)` 走 i18n key，需核对 5 个枚举值是否全部覆盖 | **待核对**：现状未见 `admin_recharge`（管理员充值）渠道文案是否已接入 |
| 余额桶 | `main/gift/reward` | 同 | 无 |
| 状态 | `completed/processing/failed` 三态 | 代码 `STATUS_DESC` 只定义了 `completed/processing` 两态（无 `failed` 分支） | **缺口**：失败态入账记录的展示未定义 |
| **列顺序** | 编号→时间→**余额桶→类型**→金额→渠道→状态（7列，无发票列） | 编号→时间→**类型→渠道→余额桶**→金额→状态→**发票**（8列） | **顺序不一致 + 多一列**，见 §4.1 |
| 筛选 | 时间/类型/余额桶 三个下拉 | 一致（`TIME_FILTERS`/`TYPE_FILTERS`/`BUCKET_FILTERS`） | 无 |
| 分页 | **每页最多 10 条** | `page_size: 15` | **数值不符**，见 §4.1 |

### 2.3 发票

| 字段 | PRD | 现状代码 |
|---|---|---|
| 票种 | `vat_normal`/`vat_special` 两种 | 多一个 `overseas`（国外 Invoice），见 §4.3 |
| 发票记录状态 | `processing/issued/failed` 三态 | `pending/invoicing/invoiced/failed/voided` 五态（`voided` 为运营端作废只读展示，符合 PRD「不开放红冲/作废给用户侧操作」精神） |
| 操作 | `download/view_reason/none` | 仅实现 `download`（`issued` 态展示），失败原因暂无独立查看入口，靠 hover title |

---

## 3. 不同身份下的显示差异

角色来源：`useTenantRole()`（`role: tenant_owner/tenant_admin/tenant_member`）+ `isSpaceOwner`。权限点：`PERMS.BILLING_*`（`permissions.ts:23-37`），菜单级 `BILLING_VIEW` 决定整页入口。

| 按钮/入口 | 权限点 | 企业 Owner | 企业 Admin | 企业 Member | 空间负责人（非 Owner/Admin） | 个人租户 |
|---|---|:---:|:---:|:---:|:---:|:---:|
| 侧边栏「账单管理」入口 | `BILLING_VIEW`（menu） | ✅ | ✅ | ❌ 不展示 | ❌（空间负责人身份不授予租户财务权限，PRD §9） | ✅ |
| 「充值」按钮 | `BILLING_RECHARGE_CREATE` | ✅ | ✅ | — | — | ✅ |
| 「兑换优惠码」按钮 | `BILLING_PROMO_REDEEM` | ✅ | ✅ | — | — | ✅ |
| 发票页签 | `BILLING_INVOICE_VIEW` **+ 市场限定** | ✅ | ✅ | — | — | ✅ |
| 「申请开票」按钮 | `BILLING_INVOICE_APPLY` **+ 市场限定** | ✅ | ✅ | — | — | ✅ |
| 「发票抬头」按钮 | `BILLING_INVOICE_TITLE_MANAGE` **+ 市场限定** | ✅ | ✅ | — | — | ✅ |
| 下载发票 | `BILLING_INVOICE_DOWNLOAD` **+ 市场限定** | ✅ | ✅ | — | — | ✅ |
| 低余额提醒开关/阈值/通知人 | **前端尚无对应 PERMS 常量** | 应可配置（PRD） | 应可配置（PRD） | — | — | 应可配置（默认通知本人） |

**市场限定是独立于角色的第二道权限维度，不是前端拍脑袋的 `isDomestic()` UI 隐藏**：`permission-catalog.ts:210-216` 的 `PERMISSION_MARKET_RESTRICT` 把上述 4 个 `billing.invoice.*` 权限点标为 `['china']`——这张表决定了 `catalogPayloadForMarket('global')` 推送给后端时会**直接过滤掉**这 4 个权限点，海外市场的权限矩阵里它们根本不存在，不是「有权限但前端隐藏」。`BillingLedgerPanel.tsx` 里的 `isDomestic() && hasPermission(...)` 只是前端再兜底一层，两层共同生效。文件注释写明「新的市场特例往这里加，推送前用 `sync:permissions:check` 核对差异」——**如果本次改动涉及新增/调整 billing 权限点，必须同步检查该表要不要加条目，并跑 `sync:permissions:check` 确认前后端权限矩阵一致，不能只改前端 gate**。

**已用 PRD 原型源码核实（`modelgo_prd/src/App.tsx`，commit `a9cbff1`）——按真源优先级 PRD 原型 > 飞书文档 > 现状代码，这两点不需要再靠猜测或临时假设**：

1. **企业 Member 无 billing 访问权——已确认**。`canAccessBilling`（`App.tsx:3108`）：
   ```ts
   function canAccessBilling(tenant: Tenant, identity: ConsoleIdentity) {
     if (tenant.kind !== "enterprise") return true;   // 个人租户恒可见
     return isTenantWideRole(identity.role);          // 企业租户仅 owner/admin
   }
   function isTenantWideRole(role: TenantRole) {       // App.tsx:3075
     return role === "owner" || role === "admin";
   }
   ```
   侧边栏「账单与用量」分组（`App.tsx:5490-5494`）用同一个 `canAccessBilling` 过滤 `costGovernanceItems`，逻辑单一入口，不存在侧边栏隐藏但路由可访问的分裂实现。

2. **空间负责人不因该身份获得账单权限——已确认**。`canAccessBilling` 判断只看 `identity.role`（`owner/admin/member`），完全不读 `responsibleWorkspaceIds`。原型自带的示例账号 `tenant-paylinker` 就是这个场景的活样本（`App.tsx:640-646`）：`role: "member"` 但 `responsibleWorkspaceIds: ["workspace-paylinker-dev"]` 非空（即负责某工作空间的普通成员）——按 `canAccessBilling` 逻辑，这个账号在该租户下**没有**账单入口。与现状代码 `useTenantRole.ts` 里「空间负责人身份与租户财务权限分离」的注释结论一致，两源互相印证。

**仍需要实测才能过（PRD 原型不建模市场差异，前端代码是唯一源）**：
3. 海外市场（`.ai`）实测：登录 global 市场账号，确认发票 tab 从入口到直接访问路由都不可见——§3 的市场限定表决定了后端权限矩阵不下发这几个权限点，但「表里这么写」不等于「已推送生效」，需要用 `console-automation` 或原生浏览器实测 global 账号确认落地。
4. PRD §9「企业 Admin V1 同 Owner，除非后续企业策略单独限制」——原型 `isTenantWideRole` 把 owner/admin 合并判断，两者代码路径确实相同，此条已随 §1 一并核实，无需单独再测。

---

## 4. PRD 1.0.4 对照缺口（本次改动前需要拍板的点）

### 4.1 入账记录：列顺序 + 分页数 + 发票列
- PRD 明确列顺序（编号/时间/**余额桶/类型**/金额/渠道/状态，7列）与现状（编号/时间/**类型/渠道/余额桶**/金额/状态/**发票**，8列）不一致。
- PRD 明确「每页最多 10 条」（§8.6.1 + §13.3 验收标准），现状 `page_size: 15`。
- 「发票」列是否保留：PRD 主列表 7 字段没有发票列，若这是需求方后续反馈加的（类似 §60 行注释提到的「需求方#84」模式），需要找到对应单号确认，不能默认按 PRD 删除已上线字段。

### 4.2 低余额提醒——PRD 要求的租户级配置在账单页完全缺失
PRD §8.5 要求账单页余额区展示：开关 + 阈值输入 + 企业通知人多选（候选=当前租户 Owner/Admin，开启时至少保留 1 人）+ 个人租户默认通知本人 + 审计事件 `billing.low_balance.*`。

现状只有两处相关但都不对：
- `PreferencesTab.tsx`（账户设置页）里的 `lowBalanceAlertsEnabled` 是**全局个人偏好开关**，不是租户级、无阈值输入、无企业通知人多选。
- `MetricsSection.tsx`（总览页）只是**只读展示**低余额警示状态，不可配置。

→ 这是本次要动的最大一块新功能，不是「改现状」而是「从零建」，工作量要单独评估，别当成小修小补。

**后端接口现状（已查重，别重复开单）**：写接口缺口 `PATCH /tenants/{id}/billing/low-balance-alert` 已在 [#420](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/420)（PRD 联调阻塞打包单第 7 条，指派任杰）提过，但验收标准较粗。已按本文档核实出的细节（通知人候选校验=Owner/Admin、企业至少保留 1 人、个人租户默认口径、`GET .../balance` 缺通知人回读字段、审计事件三项）拆成独立子单 **[#528](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/528)**，指派凌霄，#420 已加评论说明第 7 条不再重复处理。**前端本次开工前先确认 #528 的接口是否已交付，别在接口没到位时先搭 UI 空转。**

### 4.3 发票票种 `overseas`——不是矛盾，是只读兼容分支，不要动它
现状 `InvoiceTitleType`（`types/invoice.ts`）比 PRD 多一个 `overseas`（国外 Invoice），类型注释写明「对照 test Swagger `invoice.*` schema 校准」——即后端 schema 本身存在这个枚举值。

**核实结论（已读代码确认，非猜测）**：`overseas` 在整个前端**只用于展示**（`ApplyInvoiceTab.tsx`/`InvoiceTitleTab.tsx`/`InvoiceRecordsTab.tsx` 的三处 label map），新增发票抬头表单（`InvoiceTitleTab.tsx:114-118` 的票种 `<Select>`）**只提供 `vat_normal`/`vat_special` 两个选项，`overseas` 从未开放给用户选择**。也就是说：
- 国内市场：发票 tab 可见，创建入口按政策收窄为普票/专票两种（与 PRD 一致）。
- 海外市场：发票 tab 及全部创建/查看权限被 §3 提到的市场限定表整体拿掉，用户根本看不到这个页面，`overseas` 更无从被创建。
- `overseas` 唯一可能出现的场景是**历史数据或非本 UI 路径写入的既存记录**，前端保留展示分支只是为了不让这类记录渲染报错。

**不需要「查历史单再决定删不删」——它本来就不是死代码，是故意保留的向后兼容展示分支，本次改动不用碰它**，除非需求方明确要求前端开放海外票种创建（那是新功能，需要新开单）。

### 4.4 失败态入账记录展示
PRD 状态枚举含 `failed`，现状 `STATUS_DESC`/`Badge variant` 判断只写了 `completed`（success 徽章）与其它一律 `warning`，未给 `failed` 单独样式和文案。

### 4.5 发票国内/海外区分——已向需求方确认，维持现状 ✅ 已解决（2026-07-27）
在《ModelGo Console 重构 PRD：账单管理页面（v0.1）》全文（含 §8.7 发票、§9 权限与数据口径）里搜索「海外/国外/global/市场/domestic/overseas」**零命中**。PRD 从头到尾把发票当成不分市场的统一能力写（§8.7.1「企业 Owner/Admin 和个人租户用户均可进入发票页签」——只按角色分，不按市场分），单看 PRD 文字容易误判为"海外也该有"。

**已向需求方确认口径**：产品侧没有设计海外发票流程，海外发票入口维持隐藏——即「国外没有发票能力」是明确的产品决定，不是本 1.0.4 PRD 的疏漏，也不是需要前端自行推断的模糊地带。

**结论：现状代码 `isDomestic()` + `PERMISSION_MARKET_RESTRICT` 的收窄行为是正确的，本次改动不需要动它**，§5 变更清单里对应项已从"待澄清"改为"确认维持现状"。

---

## 5. UI 变更记录（本次改动的具体清单——只有这些是真正要动手改的）

结合 §2～§4，字段口径基本已对齐、权限口径已用 PRD 原型源码核实一致，**剩下需要落地的纯粹是 UI 层的增删改**，逐条列出，按实现顺序排：

| # | 改动 | 位置 | 动作 | 依据 |
|---|---|---|---|---|
| 1 | **新增低余额提醒配置模块**（开关 + 阈值输入 + 企业 Owner/Admin 通知人多选 + 个人租户默认本人） | `BalanceCard.tsx` 余额区（PRD §7.2「余额桶与风险区」） | 新增（当前完全没有，见 §4.2）；**后端接口依赖 [#528](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/528)，开工前先确认已交付，别接口没到位就先搭 UI** | PRD §8.5 |
| 2 | 入账记录表格列顺序：`类型→渠道→余额桶` 改为 `余额桶→类型`，`渠道` 挪到金额后 | `BillingLedgerPanel.tsx` 表头+行渲染 | ✅ **已完成**（[#530](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/530)，commit `9a54bbc`，浏览器实测通过，已挪「待验证」） | PRD §8.6.1 + §13.3 |
| 3 | 「发票」列去留 | 同上 | ✅ **已确认删除并完成**——`git log` 挖到原实现单 [qa#433](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/433)（按 `modelgo_prd@b9fbec4` 快照实现），该快照是当前 HEAD 的祖先（隔 115 个提交），证明是 PRD 后续简化掉的，非前端自造；已开 [#530](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/530) 记录并随 #2 一起完成 | PRD 主列表无此列，PRD 后续版本简化所致 |
| 4 | 分页条数 `15 → 10` | `BillingLedgerPanel.tsx`（`page_size`） | ✅ **已完成**（随 #530 一起改，代码逻辑确认 `params?.page_size ?? 15` 正确取到传入的 10） | PRD §8.6.1 + §13.3 |
| 5 | 入账记录状态补 `failed` 态样式 + hover 文案 | `BillingLedgerPanel.tsx` `STATUS_DESC`/`Badge variant` 判断 | **暂缓**——查 Swagger 发现真实接口 `income-records.status` 只有 `success\|pending` 两态，压根没有 `failed`，PRD 文字的三态假设本身存疑，已在 [#529](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/529) 问后端是否存在失败态，回复前不做这项 | PRD §8.6.1 状态枚举，但与 Swagger 实测冲突，见下方新发现 |
| 6 | 渠道文案核对 `admin_recharge`（管理员充值）是否已接入 i18n | `channelLabel()` 用到的 locale key | **暂缓**——查出比"待核对"更大的问题：真实接口用短代码枚举（渠道 Swagger 未定义、余额桶用 `cash/grant/reward`），跟前端类型定义（`main/gift/reward`、`completed/processing`）完全对不上，只是现在页面还没切到真接口（`INCOME_RECORDS_ENDPOINT_READY=false`）才没炸；已开 [#529](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/529) 问后端，回复前不要切换开关也不要碰这几个映射 | PRD §8.6.1，但需先由 #529 澄清真实枚举 |
| 7 | 发票国内/海外范围 | `isDomestic()` gate + `PERMISSION_MARKET_RESTRICT` | **不改**，已向需求方确认维持现状（海外未设计发票能力） | 见 §4.5 |
| 8 | `overseas` 票种展示分支 | `InvoiceTitleTab.tsx` 等三处 label map | **不改**，已确认是故意的只读兼容分支 | 见 §4.3 |
| 9 | 充值预设档位/支付渠道（原型 4 档+仅支付宝 vs 现状 6 档+支付宝/微信/Stripe） | `TopUpModal.tsx` | **不改**，多渠道大概率是原型之后的真实需求扩展，倒退回原型是错误方向；仅记录差异 | 见 §1.1 |
| 10 | 发票抬头专票额外字段（注册地址/电话/开户行/账号） | `InvoiceTitleTab.tsx` `isSpecial` 分支 | 已开 [#531](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/531) 核实——`git log` 挖到原实现单 commit `4aa7c4c`（对照原型 `#/console/billing` 实现），当前原型 `BillingInvoiceTitle` 类型已无这 4 项，PRD §8.7.3.1 也未列出，大概率是 PRD 简化掉的，但改前需先确认后端是否真的没有这几个字段的存储需求（专票法定要素） | 见 §1.1 |
| 11 | 申请开票单页 modal vs 现状两步流程（列表→确认页） | `ApplyInvoiceTab.tsx` | **不改**，现状流程明显是原型之后的体验优化，不应对齐原型简化回去 | 见 §1.1 |
| 12 | 删除旧「充值记录/赠送余额明细/奖励记录」三页签 + 订单详情侧栏 | `index.tsx`、`BillingOrdersPanel.tsx`（已删）、`OrderBarcode.tsx`（已删）、`renderTierBadge.tsx`（已删） | ✅ **已完成**（commit `811835c`，浏览器实测确认页面只剩「余额概览」+「入账记录/发票」，已推 test 并构建成功 build #562） | PRD §2.1 明确把这套旧结构列为要解决的问题，入账记录表是替代方案 |

> **进度**：#2/#3/#4/#12 已完成并提交（[#530](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/530)，待验证，commit `9a54bbc`+`811835c`）。#5/#6 暂缓，等 [#529](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/529) 后端澄清真实枚举（发现比预期更大的契约不一致，见下方新发现）。#1 依赖 [#528](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/528)。#10 待 [#531](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/531) 核实。#7 已向需求方确认维持现状。#8/#9/#11 明确不动。

### 5.2 删除旧面板的已知副作用：「取消待支付充值订单」暂时没了入口
`BillingOrdersPanel.tsx` 删除时一并失去 UI 入口的还有「取消待支付充值订单」这个用户动作（`BILLING_RECHARGE_CANCEL` 权限点、`services/billing.ts` 的 `cancelRecharge` 函数）。

- **PRD 态度**：PRD 1.0.4 非目标（§4.2）明确不做「用户侧退款、红冲、作废重开」，但**没有直接提及「取消一笔还未支付成功的订单」是否要保留**——这在语义上更接近"撤销一次尚未生效的操作"，不是退款/红冲那类不可逆财务操作，PRD 没把它当成同一类事情讨论。
- **现状处理**：`cancelRecharge` 服务函数本身未删（避免打 `permission-catalog` 权限目录的连带影响，删权限点是更大范围的改动，不在本次删除范围内），只是暂时没有任何 UI 会调用它。
- **待确认**：是否需要在别处（比如充值弹窗自己的历史记录里，或入账记录的行内操作）补一个取消入口，还是产品侧本来就打算让待支付订单只能等自然过期、不需要用户主动取消。**这个点还没找到需求方确认，先记录在这里，不要假设"没有=不需要"就默认关闭。**

### 5.1 新发现：`income-records` 真实接口枚举与前端类型定义不一致（Swagger 实测）

准备切换 `INCOME_RECORDS_ENDPOINT_READY` 开关前查了 Swagger（`credits.IncomeRecord`），发现现状前端代码从没对齐过真实交付的字段：

| 字段 | Swagger 实际枚举 | 前端类型定义（`services/billing.ts`） | 差异 |
|---|---|---|---|
| `bucket` | `cash \| grant \| reward` | `IncomeBalanceBucket = 'main' \| 'gift' \| 'reward'` | `main`≠`cash`，且与同域名下 `balance/breakdown` 接口用的 `main/gift/reward` 命名不一致（两个接口对同一概念用了两套代码） |
| `status` | `success \| pending`（无 `failed`） | `IncomeRecordStatus = 'completed' \| 'processing'` | 完全不重叠，切真接口后 `rec.status === 'completed'` 永远为 false |
| `channel` | 仅 `type: string`，无 enum 列表 | 假设 `alipay/admin_recharge/coupon/activity_grant/referral_program` | 无法确认真实值，i18n key 目前是短名 `admin/promo/activity/referral`，对不上就会显示英文原始值 |

**现在页面没炸的原因**：`INCOME_RECORDS_ENDPOINT_READY=false`，一直没切到真接口，还在用充值+赠送记录客户端拼出来的旧数据（用的是旧枚举，凑巧能跑）。**这是个哪天有人手滑打开开关就会立刻显示错的隐藏坑**，已开 [#529](https://gitlab.ops.modelgo.com/qa/ai-quality-platform/-/issues/529) 让后端澄清三个字段，回复前不要动这个开关，也不要现在就去改 #5/#6。

---

## 维护约定
- 真源仍是飞书 PRD + 现状代码；本文档发现与真源对不上时，以真源为准并顺手修文档。
- PRD 改版后按本目录 README 重跑同步。
