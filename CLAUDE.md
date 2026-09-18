---
name: ui-review-polish
description: Use when auditing, reviewing, or polishing an existing interface across visual hierarchy, accessibility, responsive behavior, motion, UX writing, color, and final product quality.
updated: 2026-06-03
last_used: ~
use_count: 0
---

> ## ⚠️ 入场先读（比下面所有规则都优先）
> 1. `PROJECT-BRIEF.md` — 冷启动快照（8 个有效命令、真源优先级、PRD V1.0.3 限制）
> 2. `docs/COLLABORATION.md` — 协同 SOP（worktree/认领锁/提单格式/UI 测试/验证闭环）
> 3. **分支定位（2026-09-03 owner 拍板，之前的口口相传不算）**：
>
>    | 分支 | 定位 |
>    |:---|:---|
>    | `main` | 生产 |
>    | `test` | 测试环境集成分支（只进不出，见下方红线） |
>    | `release/vX.Y.Z` | 版本集成分支，功能先进这里（现存 `release/v1.0.6`、`release/v1.0.7`；早期叫 `feature/v1.0.x-*`） |
>    | `hotfix/*` | 不等版本节奏的临时 / 紧急需求 |
>
>    功能流向：**worktree 分支 → 版本分支 → 合入 `test` 走测试环境**；
>    上线是**另一条腿**：版本分支（`release/vX.Y.Z`）→ `main`。
>    所以开 worktree 时 base 用**版本分支**、收尾也推回版本分支；**何时把版本分支合进
>    `test` 由 owner 按版本节奏决定，agent 不要自己合**。
>
>    🔴 **版本阶段口径（2026-09-14 owner 明确，动单前先确认当前是哪一档）**：
>    **同一时刻不同版本处在不同阶段，单子的状态标签要跟着版本走，不是跟着「我做完了」走。**
>
>    | 版本 | 阶段 | 单子做完后挪到 |
>    |:---|:---|:---|
>    | **1.0.6** | **提测中** | `待验证` —— 可以交 QA |
>    | **1.0.7** | **开发中** | **保持 `进行中`** —— 不交 QA、不挂 `待验证` / `待上线` |
>
>    「我验完了」≠「可以交 QA 了」。**版本何时进入提测是 owner 的节奏决定的**，
>    agent 把活干完、把证据写进单子即可，不要替 owner 推进流程阶段。
>    2026-09-14 踩过：客服（1.0.7）我跑完验收就挪 `待验证`，当天这张单被三个人
>    在「进行中 / 待review / 待上线 / 待验证」之间拨了 7 次，看板上的进度完全不可信。
>
>    **接单第一步是定版本，不是直接改代码**（同日 owner 纠正）：先判断这张单属于哪个
>    版本、该在哪个分支改，再动手。单子里没写版本时按模块归属 + 代码在哪个分支判
>    （例：`prd46#1012` 正文一个版本号都没有，但 `discovery/` 36 个文件只在
>    `release/v1.0.6`/`v1.0.7`/`test` 上、`main` 只有 1 个 ⇒ 1.0.6 线）。
>    我为此白跑过两次：`#996` 拿 1.0.6 当基线改了半天，`#1010` 分析完才发现
>    代码早在 1.0.6 里躺着、根本不用重写。
>
>    🔴 **红线：`test` 禁止合并到 `main`。** `test` 是测试环境的集成分支，只进不出 ——
>    同一时刻它可能同时压着多个版本的代码（2026-09-14 实例：`test` 里既有待上线的
>    1.0.6，又有刚进测试、一条 AC 都没验过的 1.0.7 智能客服）。`test → main` 会把
>    没验收的版本一起带上生产，而且带了什么**在 diff 里看不出来**。上线只认
>    「哪个版本分支合进 main」这一条路径，一次一个版本、可追溯、可回滚
>    （main 上那条 `26b8ceff Revert "Merge release/v1.0.6 into main"` 就是按版本
>    整批回滚的，能干净回滚正因为进去的是一个版本而不是 test 的混合体）。
>
>    ⚠️ 本仓 `.git/hooks/pre-commit` 目前仍会提示「origin/main 有 N 个提交不在
>    origin/test 里 …… 整批上线时 test→main 不能快进」—— 那句话按旧口径写的，
>    **不要照着它去合 test→main**；`main → test` 方向的回流仍然是对的。
>
>    临时需求走 `hotfix/*`：从 `main` 分出，验完合 `main`，再回流 `test` 与当前版本分支
>    ——它的意义就是绕开版本节奏，所以不要挂在版本分支上做。
>
>    ⚠️ `cs wt <名> --base <分支>` 取的是**本地**分支，可能落后远端。开之前先
>    `git fetch origin <分支>`，或直接 `--base origin/<分支>`。2026-09-03 踩过：
>    基线旧了一天，改动全打在旧代码上，sed 一个都没匹配到，白改一轮才发现。
>
> 4. **默认在主检出切分支，不要习惯性开 worktree**（2026-09-18 owner 纠正，推翻此前的「默认开」）
>
>    此前这条写的是「worktree 默认开、不是确认有并发才开」，理由是本仓多 agent 并发。
>    实践证明代价大于收益：**开这一步每次都做到了，删这一步长期没人做**。
>    2026-08-28 清点挂着 4 个僵尸 worktree；2026-09-18 owner 再次清点，
>    我一天内开了 7 个分支/worktree 做 5 个单，其中 2 个从头到尾零提交、
>    3 个 worktree 零改动，最老的僵尸 7 天没动过。owner 原话：
>    「wt 搞个毛，本地一堆 wt 的意义在哪里」。
>
>    **判据：worktree 只解决「我需要同时在两个分支上干活」。** 串行做完一个再做下一个，
>    `git checkout` 就够了 —— 每个 worktree 要软链 node_modules、装依赖、删的时候
>    还得先 `worktree remove` 再 `branch -D`，换来的隔离性一次都用不上。
>
>    并发冲突用**别的手段**防，不靠 worktree：
>    - 动手前 `git status` + `git branch --show-current` 看一眼主检出在谁手里
>    - 主检出停在别人的分支上、或有别人未提交的改动 → **这时才开 worktree**
>    - 提交前 `git fetch` 确认没人往同一分支推了新东西
>
>    **合并同类项**：多个单改的文件不重叠时，一个分支做完全部，一次合并一次发布。
>    2026-09-18 那 5 个单里真要改代码的只有 2 个、文件完全不重叠，本该一个分支收工。
>
>    **纯合并/回流动作（sync、backflow）一律不开 worktree** —— 那本来就是几条 git 命令。
>
>    **收尾是 MR 参数，不是记忆力**：建 MR 一律带 `--remove-source-branch`，
>    合并后远端分支自动消失，本地 `git branch -d`。开了 worktree 的先 `worktree remove`。
>    定期体检：`bash scripts/branch-hygiene.sh`（列出已合并未删的分支与零改动的僵尸 worktree）。

> ## 🚦 UI 改动开工前置（硬性 · 先做再动手）
> 治「不读规范就动手」——本仓 UI/组件/样式任何改动，先按序做：
> 1. **`bash scripts/ui-guard.sh --rules`** → 一条命令列出机器实际会拦的全部约束（BLOCK 阻断提交 / WARN 提醒）。**这是最短路径**：清单从门禁实现里提取，不会与代码漂移，比读 249 行 DESIGN.md 可靠。写之前扫一眼，就知道边界在哪。
> 2. `cs flow frontend` → 拿到必读规则与禁止项；细节与「为什么」查 `cs rule frontend_design_standard` + 本仓 `DESIGN.md`
> 3. **先查「有什么」再动手：`src/components/ui/COMPONENTS.md`**（自动生成，`node scripts/gen-ui-inventory.mjs`）。
>    下面第 4 条的铁律教的是**怎么用**，这份清单答的是**有什么**——40 个现成组件，
>    以及藏在 props 里的能力。**搜能力词，别搜组件名**：要「进度条流光」搜 `流光`
>    （是 `ProgressBar` 的 `flow`），要「毛玻璃浮层」搜 `玻璃`（是 `.mg-float`）。
>    2026-09-08 连踩两次：自己拿 `<i>` + scaleX 造了个进度条，而 `ProgressBar flow`
>    早有；又差点重写图表 tooltip 的表面，而 `.mg-float` 早在。**手写一个已存在的
>    组件比写得丑更糟**——样式分叉、主题漏一套、无障碍缺、下次改规范时改不到你这份。
> 4. **组件铁律**：主操作用 `Button variant="brand"`，禁止手写 `<button className="bg-brand-*">`；卡片用 `.mg-tile`，勿拿 `bg-mg-fill-0` 凑层次；圆角只用 `rounded-sm/md/lg/full`（**禁 `rounded-xl/2xl/3xl`**，它们是禁用刻度＝直角）；图标按用途三选一：**模型/厂牌 logo 用 `@model-go/icons`**（私有库，与运营后台共用同一份 vendor 别名索引与厂牌主色；渲染统一走 `<ModelIcon>`，别直接 import 图标包）；通用 UI 图标用 `react-icons`；`@lobehub/icons` 仅限私有库还没收的第三方标识（OAuth 登录的 GitHub/Google/微信等），新增前先确认私有库里没有。
>    **浮层铁律**：弹窗/下拉/气泡一律用 `ui/` 下的 `Select`、`Popover`、`DropdownMenu`、`Dialog`、`Modal`、`Sheet`、`Tooltip`，**禁止原生 `<select>`**（下拉列表由操作系统渲染，半透明且不跟随主题，CSS 一行都够不着），也别自己 absolute/fixed 定位手搓浮层（每次都要重踩背景透读、层级压不住、ESC 出不去）。ui-guard 已硬拦这两类。
>    ⚠️ **「1:1 还原 PRD」到底还原什么 —— 逐维度定死，别再临场判断**（2026-09-03 owner 澄清）：
>
>    | 维度 | 真源 | 说明 |
>    |:---|:---|:---|
>    | **布局** | **PRD 原型** | 元素放在哪、层级结构、区块顺序、同排还是分行 |
>    | **业务场景** | **PRD 原型** | 交互流程、状态机、边界条件、空态与失败态 |
>    | **字段** | **PRD 原型** | 展示哪些数据、文案、单位、空值规则 |
>    | **信息层级** | **PRD 原型** | 谁比谁重要、谁该先被看见（**但实现值一律用控制台 token**） |
>    | 视觉数值 | 控制台 `DESIGN.md` + token | 具体色值 / 字号 / 圆角 / 间距 / 阴影 |
>    | 组件形态 | 控制台 `ui/*` | 用什么控件，下拉 / 弹层 / 表格怎么实现 |
>
>    「信息层级按 PRD、数值用控制台 token」这一条是关键，两个真实例子：
>    - 模型发现入口在原型里是**品牌色强调**（它是引流去新页面的唯一入口）→ 层级照搬，
>      但用 `Button variant="brand-outline"`（`--brand-base` 派生），不照抄原型的 `rgb(49,92,201)`；
>      双市场与明暗四象限因此自动跟随。
>    - 模型发现页的字号层次（配角 10 / 正文 12 / 卡片标题 17）照搬原型 —— 需求方当初的原话是
>      「为啥字体都一样大，没有主次关系」；但每一档的**值**都指向 `--mg-font-size-*`，
>      页面只保留档位的语义名（见 `discovery-tokens.css`）。
>
>    反过来最常犯的错是**把原型的实现也搬进来**：原型是独立小项目，用原生控件和自写浮层，
>    1:1 照搬 DOM 会把这些一起搬进来——2026-09-03 模型发现页就是这么留下两个原生 select
>    和一个手写 popover 的；同一次移植还留下一条 `.model-discovery-page button { font: inherit }`,
>    把本页 44 个控件里 12 个的字号从 14px 静默击穿成 16px（已加门禁阻断，见
>    `scripts/check-css-tokens.mjs` 的简写重置规则）。
>    ⚠️ **也别照搬原型的数值**：原型的字号/间距是在**原型的假数据**上调的。发现页模型名在原型里是「GPT-5.5」，真实接口给的是 70 个字符的「Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)」——照搬原型的 18px 直接撑爆整列。**比例关系可以学（主角显著大于配角），数值必须在真实数据上重调**。反过来也一样：拿「体系最小档 12px」去套原型的高密度小字，会把主角压成正文、整行糊掉，两次我都犯过。
> 4. 提交前 UI 门禁 `scripts/ui-guard.sh` 会硬拦上述违规；**完成前必须浏览器验证**（engineering_baseline §4.2 结构化验收），禁止"没验就说完成"。
>    验证不是"截图看一眼"，跑 **`scripts/ui-runtime-audit.js`**：把它的内容注入目标页执行（chrome-devtools 的 `evaluate_script` / playwright 的 `browser_evaluate`），一次拿到横向滚动、文本溢出无兜底、同容器字号挤档、浮层背景透读、同组条长无区分度五项。**这五项静态门禁一条都抓不到**——它们只在真实数据 + 真实容器宽度下暴露，源码里看不出违规。`ok:false` 就是没做完。测之前把窗口调到 1024 与 1440 各跑一次，窄屏才暴露收缩链问题。
> 5. **布局/排版对标现状，不对标原型视觉（前置，别只靠最后验证）**：原型只给「功能 + 交互」，它自身的视觉 ≠ 本控制台视觉。布局、排版、间距、组件用法的真源是**现状控制台**——动手前先挑一个现有最像的页/模块（同类 表格/表单/抽屉/卡片/筛选条）当参照，照它的结构 + `ui/*` 组件 + `DESIGN.md` + token 排；别照原型视觉、也别凭空排。PRD 没 UI 方向是正常的（PRD 给功能，UI 方向的真源是现状代码）。UI 验证应是**开工选参照 + 中途对着它比**，不是最后才发现排版不对。
> 6. **动业务模块前先读 `docs/ui-reference/<module>.md`**（现有：`api-keys`、`guardrails`）——里面是该模块的 UI 框架 + 字段文案（照 PRD 原型常量）+ 不同身份（owner/admin/space owner/member）的显示差异，是开工对齐的提炼，省掉每次全量扫代码。⚠️ 它是**衍生文档非真源**，冲突时以 PRD 原型 + 现状代码为准；PRD 改版后按 `docs/ui-reference/README.md` 重跑同步。

> ## 🧭 真源 & 交付铁律（硬性 · 治「不知信哪个源」+「不知交付没」两大返工坑，2026-07-11）
> 1. **每个模块钉唯一真源**，动手前先声明「本模块以 X 为准」。真源候选：PRD 原型 `modelgo_prd/src/App.tsx`、飞书对应设计文档、现控制台代码、Swagger。冲突优先级 **PRD 原型 > 飞书文档 > 现代码**；命名一律 PRD 原型（租户/工作空间，非组织/项目）。定稿 PRD 与需求方新单冲突 → 贴证据回需求方澄清，不自行选边。
>    - **飞书 PRD 真源在哪 & 怎么读**（别猜位置）：《ModelGo PRD by Release》，space `7636726268473543858`，根节点 `QR0Bw915SinU8Lkr67LcrEdpnyd`。读正文：`lark-cli --profile feishu-company api GET "/open-apis/docx/v1/documents/<node>/raw_content"`（见 skill `frontend-api-verify` / 记忆 `prd-by-release-tree`）。各页 node：企业&空间管理 `NDEBwSPQzifUdhkDgDwcIy3CnXe`｜左侧导航&总览 `JssswUWbOiNOpDkm9rLciE0qnSf`｜角色权限 `DGpFwOZEciHpZ1km5JmcHhkinfe`｜用量统计 `ZTrYwm0x0iC882kMopwccQKbnXb`｜调用日志 `YQSrw9MplixXNJkFflWcRyrhnnf`｜安全护栏产品模型 `UFBxwgdYmiHVhLk2SZtc5kJVnBh`｜安全护栏v0.1 `Ieplwa8Y7idSjyk1WSiclByRnN9`｜API Keys `VxSCwa6QMiPMYGkeyrUcaYXQnRc`。
>    - ⚠️ 上面 node token 会随 PRD 改版新增/失效；对不上时用 `lark-cli ... /open-apis/wiki/v2/spaces/7636726268473543858/nodes --params '{"parent_node_token":"<父>"}'` 重新列。
>    - 注：官网（website）是**另一个产品**，不在本仓/本树；桌面那些 `首页-文案参考.md` 等是临时稿、非 PRD，别当真源。
> 2. **「交付」= 接口在 test 可打通，不是「代码写完」**。后端单挪「待验证」前，交付方在 test 打一枪确认路由注册 + 返回正常；前端联调前先 Swagger/实打确认接口存在，**别按看板状态盲信**（例 #385 标待验证但 rotate 打出 40401）。状态与 test 不符 → 带请求/响应证据退回后端，不静默兜底。判接口新旧看 paths 实测，别看 `swagger info.version`（静态注解）。
> 3. **自决门槛**：飞书 PRD + 原型代码两源都查过且都没相关信息，才可以问用户；任一源有依据（含能从现代码推断）就自己定、不问。查 Swagger/代码是本职，不是问的理由。
> 4. **开关单只认真源、不认标签、不横跳**：关/开单前用 代码/Swagger/联调 验，`已完成/待验证` 标签正反都不信；纯前端我实测过 / API 我联调过的可关；一个单只走一次开→关，拿不准先留待验证+备注，别先动作再回退。
> 5. **前端对后端有要求 → 必须落 API 单**：用了后端字段/端点/枚举/行为（含写「原型/待后端」）就建对应后端单并在代码注释挂单号；建单前按模块查重，一模块一单；契约按现有代码为准；格式 页面→接口→问题→缺什么 + 验收 checkbox + 指对模块 owner（护栏/提示词检测=邵一鸣、用量/日志/总览口径=凌霄、通用 API=任杰）。
> 6. **有待联调的 → 全联调、不问要不要**：能验的验（通过关 / 未交付带数据证据退回）；验不了的（并发/破坏性/纯后端内部）当场注明原因归后端+QA，不静默跳过。
> 7. **回复只给核心、不废话**：问啥答啥，别铺完整链路/背景，细节等追问。

# UI Review Polish

Use this when the user says the UI is ugly, too AI-like, unclear, not polished, not responsive, too bland, visually noisy, or needs review before shipping.

## Decision Boundary

Choose this skill when:
- The main task is diagnosis, review, or targeted polish of an existing interface.
- You need to decide whether the fix is visual direction, layout, copy, motion, accessibility, color, or responsive behavior.
- The user asks for "review", "audit", "make it better", "高级感", "不好看", "太丑", "像 AI", "适配", "动效", "文案不清楚", or "打磨".

After diagnosis:
- If the screen is product/app UI inside a framework, apply `framework-product-ui`.
- If the screen is a public website or landing page, apply `css-website-design`.

## Review Order

1. Purpose: what should the user understand or do first?
2. Hierarchy: is the primary content/action visually dominant for the right reason?
3. Layout: spacing, alignment, grouping, density, card use, responsive constraints.
4. Typography: scale, weight, line length, label clarity, truncation, overflow.
5. Color: semantic roles, contrast, accent discipline, theme token usage.
6. Interaction: hover/focus/active/disabled/loading/error states, keyboard path.
7. Motion: only purposeful transitions; no bounce/elastic gimmicks.
8. UX writing: labels, errors, empty states, button text, duplicate copy.
9. AI slop scan: generic gradients, glassmorphism, glowing dark UI, decorative orbs, repeated icon cards, hero metric templates.

## Output Shape

For review-only tasks, lead with findings:
- Severity: P0/P1/P2/P3
- File or screen reference when available
- Problem and concrete fix

For implementation tasks:
- Make the smallest coherent polish pass that fixes the root visual issue.
- Verify layout at desktop and mobile sizes when a browser target exists.
- Mention any remaining design debt separately from completed fixes.
---
name: framework-product-ui
description: Use when improving or building product UI inside an existing component framework such as shadcn/ui, Radix, Ant Design, Naive UI, React Native Paper, or an internal design system. Keep the framework's component model and tokens as the source of truth.
updated: 2026-06-03
last_used: ~
use_count: 0
---

# Framework Product UI

Use this for app, SaaS, dashboard, console, admin, CRM, editor, mobile app, or repeated workflow UI when the project already has a UI framework or design system.

## Decision Boundary

Choose this skill when:
- The repo already uses a UI framework, component library, or design tokens.
- The work is inside an app workflow: tables, forms, filters, dashboards, settings, editors, detail pages, sidebars, modals, drawers, command palettes, toolbars.
- The main problem is information hierarchy, interaction density, component state, accessibility, or workflow efficiency.

Do not choose this for:
- Marketing websites, official sites, portfolio pages, brand landing pages, or editorial pages whose quality mostly comes from CSS composition. Use `css-website-design`.
- Pure review with no implementation direction. Use `ui-review-polish`.

## Operating Rules

1. Inspect the current component system first: package dependencies, existing components, CSS variables, theme tokens, layout primitives, and examples already in the repo.
2. Preserve the framework's semantics. Prefer existing Button, Input, Dialog, Select, Table, Tabs, Drawer, Toast, Menu, Tooltip, and Form components over custom HTML.
3. Design within product constraints: dense but readable layouts, predictable navigation, clear state, keyboard accessibility, responsive behavior, and fast repeated actions.
4. Use tokens and variants. Do not hardcode colors, spacing, or one-off styles unless the local system has no equivalent and the value is promoted into a token.
5. Avoid marketing-page composition inside tools. No oversized heroes, decorative card gardens, gradient-orb backgrounds, or nested cards for operational screens.

## Product UI Checklist

- Navigation: user can move between list, detail, edit, settings, and empty/error states without dead ends.
- Data density: tables, cards, and forms are scannable without looking sparse or cramped.
- Controls: use familiar controls for the job: segmented controls for modes, tabs for view switching, menus for option sets, switches/checkboxes for binary settings, sliders/inputs for numeric values.
- States: loading, empty, disabled, active, selected, error, success, and destructive states are visible and consistent.
- Responsive: compact layouts preserve primary actions and do not hide critical workflows.
- Accessibility: labels, focus states, keyboard paths, contrast, and hit targets are checked.

## Output Shape

When implementing, return:
- The design intent in one short sentence.
- The concrete components/paths changed.
- Any framework constraints kept or fixed.
- Verification run: build/typecheck/lint/browser check when available.

<!-- agent-eyes:begin -->
## 运行时视野（vite-plugin-agent-eyes 自动维护，勿手改此块）

本项目 dev 期把**真实**请求/响应、报错、控制台、交互轨迹写到 `log/`。
**排查前端/接口/登录/样式问题前先读它，不要从源码或类型定义反推。**

```bash
ls log/                        # 有哪些端口在跑
cat log/<port>/api-calls.log   # 真实请求体 + 响应体
cat log/<port>/errors.log      # 报错（聚合去重，最新在最上）
```

| 想知道 | 读哪个 |
|---|---|
| 接口返回什么字段、值是什么 | `<port>/api-calls.log` ← **字段真源，类型定义和注释都不是** |
| 哪里报错了 | `<port>/errors.log` |
| 用户点了什么才出错 | `<port>/interaction.log` |
| 登录/cookie/CORS/302 | `<port>/proxy-<host>.log` |
| 当前登录的是谁 | `<port>/auth-state.json`（脱敏画像，无 token） |
| 页面长什么样 | `<port>/snapshots/`（PNG + DOM 快照） |
| 提交被门禁拦了 | `log/guard-report.json` |

注意：大响应体在日志里会被截断，整份 JSON 解析会失败，按单个 item 的花括号配平解析。
日志每次 dev 启动清空，看到的就是本次。改完 vite 配置要重启 dev 再验。
完整说明见 `log/README.md` 与 `node_modules/vite-plugin-agent-eyes/AGENT_GUIDE.md`。
<!-- agent-eyes:end -->
