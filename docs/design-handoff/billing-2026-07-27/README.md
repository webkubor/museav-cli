# 账单管理 UI 精修 — Claude 开发交付包

## 任务边界

- 页面：`/billing`（账单管理）。
- 用户：租户财务负责人；要快速确认可消费金额、发起充值/兑换、查看入账与发票。
- 不改信息架构：保留导航、面包屑、页头、余额卡、三个余额桶、低余额提醒、账单/发票 Tab、筛选器、表格、兑换码弹窗、充值弹窗。
- 不改接口、权限、文案语义、业务交互或扣款顺序。
- 允许为响应式可读性调整同一区块内部的换行与控件宽度；这不是重排页面模块。

## 证据与素材

| 素材 | 用途 |
|---|---|
| [当前桌面页](assets/current-desktop.png) | 1440px 现状与结构真源 |
| [当前移动页](assets/current-mobile.png) | 390px 现状；暴露金额和操作区的挤压 |
| [当前兑换弹窗](assets/current-redeem-modal-desktop.png) | 小型表单 Modal 的现状 |
| [当前充值弹窗](assets/current-recharge-modal-desktop.png) | 金额预设和支付方式的现状 |
| [当前移动充值弹窗](assets/current-recharge-modal-mobile.png) | 390px Modal 边界与按钮密度 |
| [选定视觉方向](assets/concept-quiet-action-selected.png) | 视觉参考，**不**可当作像素级代码真源 |
| [备选：克制账本](assets/concept-restrained-ledger.png) | 可借鉴余额桶边框与表格分隔 |
| [拒绝：精密资金](assets/concept-precision-finance-rejected.png) | 不采纳余额桶装饰图标；可借鉴筛选器完整文案 |

截图均来自测试账号，金额与记录仅用于视觉验证，不是产品演示数据或文案来源。

## 决策

选择「轻量操作（quiet action）」：让金额、主操作、选中状态成为仅有的高对比元素，其余内容用间距、分隔线与字重组织。

| 方向 | 结论 | 原因 |
|---|---|---|
| 克制账本 | 备选 | 层级清楚，但部分余额桶边框过强。 |
| 精密资金 | 拒绝 | 引入余额桶图标，增加没有业务含义的视觉元素。 |
| 轻量操作 | **采用** | 最贴近现有 ModelGo 组件、视觉噪音最小，且适合桌面/移动端共用。 |

设计锚点：以 Swiss 的网格、数字与细分隔线作为表面纪律；实现仍严格使用本项目 `DESIGN.md` 与 `src/styles/tokens.css` 的现有 ModelGo token，不替换品牌色、不引入第二套设计系统。

## Claude 实现说明

### 1. 账户余额（`BalanceCard.tsx` + `billing.css`）

- 保留现有主/赠送/奖励三个按钮与点击筛选行为。
- 可消费总额是全页数字主角：`tabular-nums`、紧凑字距、无发光或渐变文字；货币符号降一级。
- 仅选中的余额桶使用 `brand` 边框与极浅 `fill` 背景；未选中桶保持 `bg-card-bg + border-mg-border`，不使用语义图标、渐变、玻璃效果或新增说明。
- 三个桶的标签、金额基线与 InfoTip 对齐；零余额不能看起来像禁用态。
- 刷新为现有紧凑图标次操作，保留 `aria-label` 与 `title`；兑换码为 outline，充值为唯一 `Button variant="brand"`。

### 2. 小屏修复（`BalanceCard.tsx`）

当前 390px 截图中“账户余额”被操作区压成逐字换行；这是 P1 可读性问题。

- `<640px`：余额卡头改为同一模块内自然折行，标题占整行，刷新/兑换/充值在下一行；桌面保持当前同行布局。
- 余额总额使用响应式字号并保持单行：推荐 `clamp(1.625rem, 7.5vw, 2.25rem)`、`tabular-nums`、`whitespace-nowrap`。不得因测试环境的大数字溢出或拆行。
- 三个余额桶继续纵向堆叠（现有 `grid-cols-1 sm:grid-cols-3`）；金额与标签不截断。

### 3. 低余额提醒（`LowBalanceAlert.tsx`）

- 不改变“说明在左、阈值/开关在右”的桌面布局。
- 用现有边框、文本层级与间距缩小空白感；不添加图表、进度条或新状态卡。
- 小屏保留原顺序并允许通知人、阈值、开关自然换行；控件最小触达尺寸不低于现有 `h-9/h-10`。

### 4. 账单明细（`BillingLedgerPanel.tsx` + `billing.css`）

- Tab 用品牌色下划线表达选中；不可把整行 Tab 做成卡片。
- 三个筛选 Select 在桌面端提供足够最小宽度，必须完整显示“全部余额桶”，禁止截断成“全部余…”。
- 表头可用极浅中性底或细分隔线；时间/渠道/编号为次级文本，金额保持 `tabular-nums`，入账正数和状态 chip 继续使用现有语义 token。
- 表格不改列、不改数据模型；移动端继续放在已有横向滚动容器中，筛选器允许换行，不能压缩到不可读。

### 5. 弹窗（`TopUpModal.tsx`、`PromoRedeemForm.tsx`）

- 保留现有字段、预设金额、支付渠道、提交文案与成功/错误流。
- Modal 使用现有 `rounded-lg`、`bg-card-bg`、`border-mg-border`、`Button`；不要新增渐变、品牌图、插画或营销横幅。
- 充值：金额预设的选中态仅为 `brand` 描边 + 浅填充；支付渠道仅表达真实的渠道选中态；底部“前往支付”是唯一满宽品牌按钮。
- 兑换：保持一输入框 + 一提交按钮；输入框获得焦点时使用 `brand` 焦点环，禁用按钮状态可辨。
- 390px：Modal 宽度保持 `calc(100vw - 32px)` 以内，内边距可降为 16px，但金额预设仍为 3 列且按钮不溢出。

## 不可违反的实现约束

- 颜色、圆角、阴影、字体一律使用现有 `--mg-*` / `--brand-*` token 或对应 Tailwind 语义类；禁止硬编码 hex、裸圆角、`rounded-xl/2xl/3xl`。
- 不新增卡片、图表、余额桶图标、装饰性背景、玻璃拟态、渐变文本或虚构数据。
- 复用现有 `Button`、`Modal`、`InfoTip`、筛选与表格组件；不要为本页另造通用组件。
- 不动 API、React Query key、权限码、i18n key、收款渠道与业务计算。

## 建议改动文件

1. `src/pages/billing/BalanceCard.tsx`
2. `src/pages/billing/LowBalanceAlert.tsx`
3. `src/pages/billing/BillingLedgerPanel.tsx`
4. `src/pages/billing/TopUpModal.tsx`
5. `src/pages/billing/PromoRedeemForm.tsx`
6. `src/pages/billing/billing.css`

先阅读现有测试：`formatBalance.test.ts`、`TopUpModal.test.tsx`、`promo-errors.test.ts`；视觉精修不得改变它们所覆盖的行为。

## 验收

- [ ] 1440px：所有原有区块、字段、操作与顺序不变；“充值”是唯一强主操作。
- [ ] 1440px：三个筛选器全文可见；表格金额、类型、状态可一眼扫描。
- [ ] 390px：账户余额标题不逐字断行；巨额余额单行且不溢出；余额桶、按钮与提醒区可读。
- [ ] 390px：充值 Modal 不超出屏幕，六个金额预设、支付渠道与提交按钮完整可操作。
- [ ] 桌面：兑换与充值 Modal 均有清楚的标题、焦点、禁用和关闭状态。
- [ ] 浅/深色及国内/海外市场均只通过现有 token 切换，无硬编码导致撞色。
- [ ] `cs check test`、`scripts/ui-guard.sh` 通过；以测试账号在目标环境完成桌面/移动端的浏览器复核。

