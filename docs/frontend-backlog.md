# 前端细分场景 / 漏洞待办（console-web · 纯前端视角）

> 目的：沉淀「用户提出的 / 变更后暴露的 / 还没做的」**纯前端**细分场景，避免散落在对话里丢失。
> 记录口径与看板一致：**场景 → 现状 → 漏洞(缺什么) → 怎么做 → 关联接口/单据 → 优先级**。
> 命名与 key 规范见 `src/config/console-routes.ts` 头注（路由/菜单/权限/埋点四者同源）。
> 状态：⬜ 未做 / 🟡 部分 / ✅ 已做（保留供追溯）/ ⛔ 阻塞（等后端）。

---

## 1. 账号入口与强绑定（双域名双入口）

### 1.1 注册/登录 双域名双入口切割 ✅（记录口径）
- **现状**：市场按域名判定（`src/lib/market.ts`：`modelgo.com`/`.cn`→domestic，`modelgo.ai`→global，env `VITE_MARKET` 优先）。
  - **国内 domestic**：登录/注册**统一为手机号一键入口**（`login` 走 `PhoneAuth`，`signup` `DomesticSignupRedirect` 重定向 `/login`）；手机号必填。
  - **海外 global**：邮箱入口（`login` 邮箱登录、`signup` `EmailSignupPage`）；邮箱必填。
- **口径固定**：入口切换在页面级 `market === 'domestic' ? ... : ...`（避免组件内 early-return 造成 hooks 数量不一致，见 signup/index.tsx 注释）。
- **待留意漏洞**：`auth/sms-code/login`（手机号校验即登录）**后端端点尚未存在**（`services/auth.ts` TODO/QA#293），国内一键登录依赖它——属后端缺口，前端已就位。

### 1.2 手机号强绑定（domestic）✅
- **现状**：`PhoneBindingGuard` + `RequiredPhoneBindingDialog`（`components/auth/`）在 DashboardLayout 挂载，domestic 且 `account.phone` 为空时强制绑定；`bindPhone(phone, code)` → `POST /account/phone/bind`；发码 `auth/sms-code/send` + `SliderCaptcha`。

### 1.3 邮箱绑定（global / 账户设置）⛔ 阻塞（本次变更暴露的核心漏洞）
- **场景**：海外邮箱入口 / 账户设置里，用户**未绑定邮箱**时需要能自主补绑（邮箱必填侧的对称能力）。
- **现状漏洞**：账户设置「邮箱地址」未绑定时**只读展示「未绑定」，无补绑入口**（`BasicInfoTab.tsx`）；`services/account.ts` **没有 email 绑定接口**——只有 auth 层 `auth/email-code/send` + `verify`（登录/注册用），缺账户级 `POST /account/email/bind`（对称 `phone/bind`）。
- **怎么做**：
  1. 后端补 `POST /account/email/bind { email, code }`（对称手机号），成功后 `GET /account/profile` 回新邮箱——**需建单给后端**（尚未建）。
  2. 前端：`services/account.ts` 加 `bindEmail`；`BasicInfoTab` 未绑定态给「绑定邮箱」入口（发码→验码→绑定），复用 `SliderCaptcha` + `auth/email-code/send`/`verify`。
  3. MECE 返回分支：成功 / 验证码错·过期 / 邮箱被他人占用 / 已绑（不支持自主改绑，口径同手机号） / 格式非法。
- **关联**：手机号绑定 `bindPhone`（对称参考）；auth `email-code/send`·`verify` 已就绪。
- **任务单**：前端 #410 / 后端端点 #411（均含 MECE 场景描述）。
- **优先级**：中（海外注册/账户完整度依赖）。

---

## 2. 微信收银台页面优化 ⬜
- **文件**：`src/pages/billing/WechatCashierPage.tsx`
- **现状漏洞**：整页**硬编码 hex**（`#07c160` 微信绿、`#1f2329`/`#86909c`/`#f0f1f2` 等），**仅浅色、未适配深色主题**；与全站 token/双主题体系脱节。
- **怎么做**（保留微信品牌绿前提下）：
  - 容器/文字/边框走 `--mg-*` token + 补 `dark` 分支；仅「微信绿」作为品牌强调色保留（可提为局部常量）。
  - 核对三态呈现：`pending`（二维码+倒计时轮询）/ `paid`（成功态）/ 缺参兜底（missingTitle）——态样式一致、双主题都验。
  - 响应式：窄屏二维码/按钮不溢出；复制(已迁 `CopyButton`)、返回交互保留。
- **任务单**：#412（含 MECE 场景 + 本场景埋点）。
- **优先级**：中（国内充值主路径，体验+暗色）。

---

## 3. 其他已知前端缺口（本轮盘点，纯前端可推进的）

### 3.1 安全护栏 v1.0.3 重构 🟡 P0（roadmap V1.0.3）— 主体已上线
- **已做**（`df6f139` 已合并 + 发 test，按 PRD 原型 `GuardrailsPage@9009` 重建）：4 摘要卡（全局/个人/Key/提额）+ 全局/个人/Key 三段表 + 按 `aggregation_scope` 派生三档预算展示 + 各段搜索/状态开关/空态 + derive.ts；浏览器实测真数据渲染 OK；vitest 28/28。
- **剩余（纯前端）**：详情抽屉预算编辑仍是「单条」（`currentBudgetPolicy` 单数），需改为**按 aggregation_scope 三档分别编辑/替换**（`replace_budget_policy_id`），对齐原型全局护栏三档编辑。**三档后端已支持，无冲突**（见 #379 更正）。
- **后端 gap（已提）**：#378 护栏模型缺 `updated_by` actor（原型「最近更新」列要 操作人+时间，现只有时间）；scope/kind 现由 `is_default`+assignment+metadata 派生，等 #378 显式字段。**注**：原型护栏页**无独立审计 section**（#381 audit 端点虽已交付，但护栏页不需要该 UI，别加）；三层生效预览在 **API Keys 页**（非护栏页）。
- **任务单**：后端 #378/#379/#380/#381；前端抽屉三档编辑待建单。

### 3.2 埋点补全（PRD 主流程未记录的场景）🟡
- **现状**：已接 `@model-go/track`，迁了 4 个转化点（api_keys:create / workspace:create / billing.recharge:create / org:create）。
- **范围区分**：#394 是 **PRD 已列**的总览/导航 13 事件（另一条线，QA 已有单）；**本项专补 PRD 主流程没记录的**——各页 `trackPageView(menu_key)` 未铺开、边缘/变更动作（邮箱绑定、收银台三态、API Keys 停用/启用/变更负责人/详情、护栏增删改）、失败态 success/fail 分事件。
- **约束**：key 一律复用权限/菜单体系，禁止另起命名（见 `console-routes.ts` 规范）。
- **任务单**：#413（本单，PRD 主流程外补点）；#394（PRD 已列，非本单）。

### 3.3 时区（显示时区）🟡（前端就绪，等后端）
- 前端读写接线已做（seed 后端>local>浏览器 + 保存 PATCH，`cc4d993`），等后端 `ui.timezone` 字段。
- **任务单**：#409（后端字段，含 MECE）。

### 3.4 API Keys 剩余 ⛔（等后端）
- 轮转 UI 已 gate `can_rotate`，等 **#385**（rotate 端点+rotation_required）；`已达限额/已过期` 状态回显等 **#407**；create 传 scope/key_type 口径 **#382**。
- **任务单**：后端 #385/#407/#382；前端 #358（进行中）。

---

## 维护约定
- **每条场景必须挂对应任务单**（QA 看板），单里写 **MECE 需求场景描述** + 该场景自己的埋点（PRD 主流程没记录的就在单里补）；文档只做索引，细节以单为准。
- 新增条目按上面结构写；做完标 ✅ 并保留（追溯用），彻底废弃再删。
- 涉及后端的挂后端单号；纯前端项直接开工，遵守 `console-routes.ts` 命名规范 + `DESIGN.md`。
