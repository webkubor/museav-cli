# modelgo-console-web · 客户中心

覆盖国内（`console.modelgo.com` · ModelGo）和海外（`console.modelgo.ai` · ModelGo）两个市场的控制台与鉴权入口。运行时通过 `VITE_MARKET` 或域名自动判断市场，切换对应的品牌、主题色、API 域名和文档地址。

**负责人：** webkubor

---

## 🌐 线上资源

| 资源 | 国内（domestic） | 海外（global） |
| :--- | :--- | :--- |
| **官网** | [modelgo.com](https://modelgo.com) | [modelgo.ai](https://modelgo.ai) |
| **客户中心** | [console.modelgo.com](https://console.modelgo.com) | [console.modelgo.ai](https://console.modelgo.ai) |
| **说明文档** | [doc.modelgo.com](https://doc.modelgo.com) | [doc.modelgo.ai](https://doc.modelgo.ai) |

**API 接口文档（全接口真源，所有市场共用一套 Swagger）：**

🔗 [https://modelgo-web-api.test.modelgo.com/swagger/index.html](https://modelgo-web-api.test.modelgo.com/swagger/index.html)

> 覆盖范围：官网、客户中心、账号登录、工作区管理、计费套餐、API Keys、调用审计日志等所有前端接口。
> **是否有 API，以此 Swagger 为准，禁止自行推测或编造。**

### 当前 API 联调基准

| 字段 | 值 |
| :--- | :--- |
| Swagger JSON | `https://modelgo-web-api.test.modelgo.com/swagger/doc.json` |
| 拉取日期 | `2026-06-02` |
| API Title | `Modelgo Web API` |
| API Version | `1.2` |
| Swagger 格式 | `2.0` |
| Paths / Operations | `81 / 101` |
| Spec SHA-256 | `914c3fb15d84698333ada9c29fa00f459b1b1696328386cc2ef62d4ee3fef6f0` |

更新接口联调前必须先执行 `pnpm check:api-contract`。如果 `API Version`、`Paths / Operations` 或 `Spec SHA-256` 变化，必须同步更新本表，避免不知道当前前端对接的是哪一版 Swagger。

---

## 技术栈

| 层 | 选型 |
| ---- | --------------------------------------- |
| 构建 | Vite 8 + TypeScript |
| 框架 | React 19 + React Router v7 |
| UI | Tailwind CSS v4 + Radix UI + 自有 `src/components/ui/*` |
| HTTP | Fetch + TanStack Query v5 |
| 状态 | Zustand |
| 图标 | react-icons + @lobehub/icons（模型厂商），**禁用 lucide-react** |
| 国际化 | react-i18next |

---

## 🤖 AI 开发规范与工具（用 AI 写本仓代码前必读）

**统一约束 SSOT = 公司 skill 仓的 `mg-frontend`**（硬约束/选型矩阵/标准样板/验证 DoD，一处维护全员生效）：

```bash
# 安装到本地 agent（Claude Code / Codex 通用），装完 AI 写码前会自动预载规范
npx git+ssh://git@gitlab.ops.modelgo.com/shared/ai-skills.git -- --skill mg-frontend
```

> 真源关系：skill 是入口与路由；视觉细则真源在本仓 `DESIGN.md`，模块级 UI 参考在 `docs/ui-reference/`，协同 SOP 在 `docs/COLLABORATION.md`。冲突以真源为准。
> 机器门禁：pre-commit 自动跑 类型+规范快检（无 cs 环境降级 tsc+eslint）+ `scripts/ui-guard.sh` UI 铁律硬拦。

**推荐安装 ego-lite（UI 验证 DoD 的标准工具）**：AI Agent 专属隔离浏览器空间、复用你的登录态，UI 改动交付前的浏览器实测（双主题/截图留证/交互验证）都靠它。

- 下载：<https://lite.ego.app/>（macOS，装完首次引导会把 `ego-browser` 命令注册到 PATH）
- 验证可用：`command -v ego-browser`
- 用法与验证清单见 skill 内 `references/ui-verification.md`

---

## 双市场规则

### 1. 市场判断

```ts
// src/lib/market.ts
getMarket() → 'domestic' | 'global'
```

| 来源 | 规则 |
| ---- | ---- |
| `VITE_MARKET` 环境变量 | 本地/测试构建显式指定 |
| `window.location.hostname` | 生产环境运行时按域名推断 |

### 2. 品牌与主题色

| 市场 | 品牌名 | 主色 |
| ---- | ------ | ---- |
| domestic（国内） | ModelGo | 靛紫 `#6743fd` |
| global（海外） | ModelGo | 翠绿 `#00d68f` |

所有组件只使用语义 token（`--brand-base`、`--brand-light` 等），禁止硬编码颜色值。

### 3. API 域名

| 市场 | 生产 API |
| ---- | -------- |
| domestic | `api.modelgo.com` |
| global | `api.modelgo.ai` |

`src/lib/request.ts` 中 `apiBaseUrl()` 取值逻辑：

1. 优先读 `VITE_API_URL`（本地/测试构建显式配置）
2. 为空时，通过 `getMarketConfig(getMarket()).apiDomain` 运行时推断（生产走此路径）

所有业务请求经统一实例发出，路径前缀为 `api/v1/`，业务代码只传相对路径。

---

## 🛠️ 本地接口联调

### Dev Logger（错误审计日志）

启动 `pnpm dev` 后，所有失败的 API 请求会自动追加到项目根目录的 `.dev-errors.log`（已 gitignore，仅本地生效，重启自动清空）：

```bash
cat .dev-errors.log
```

### API 契约自检

```bash
pnpm check:api-contract
```

在项目根目录执行，自动拉取并核对 Swagger 最新接口契约。

---

## ⚠️ 菜单 / 功能 / 版本更新 → 必须同步「权限 + 埋点」

> **单一真源 = 权限目录** `src/config/permission-catalog.ts`（菜单 `menu_key` + `Permission ID`）。
> 埋点 event key **复用**权限 key，零漂移——权限目录一改，埋点目录随之对齐，**没有独立的埋点同步**。

**每次新增/改动 菜单、按钮动作、功能，或发版前，按序做：**

1. **改权限目录**：在 `permission-catalog.ts` 补 `menu_key`；动作按钮在 `src/config/permissions.ts`（`PERMS`）补 `permission_id`，并挂到菜单 `actions` / 角色矩阵。
2. **埋点复用同一 key**（`src/lib/track.ts`，禁止另造 key）：
   - 按钮动作：`trackAction(PERMS.XXX)` → event key = `permission_id`
   - 页面浏览：`trackPageView(menuKey)` → page = `menu_key`
   - 无权限对应的自定义事件：`trackEvent('xxx:yyy')`（沿用冒号约定）
   - 可测性：`{...trackable('api_keys:create')}` 落 `data-track`（= 埋点 key，供 QA/自动化定位，不另维护 test id）
   - 顶层契约字段（#423）：`view_mode/source/result/error_code/is_space_owner` 按场景补
3. **同步到后端**（把权限目录 upsert 到 controller，埋点 key 目录随之对齐）。**推送分国内/国外两条命令**（见下「权限推送」）。

**漏同步的后果**：新按钮/页面没进权限目录 → 角色矩阵漏授权、埋点无 key 上报不了、QA 的 `data-track` 也定位不到。

### 权限推送（sync:permissions）· 现状

**推送目标恒为测试环境**（单一域名 `modelgo-controller.test.modelgo.com`）；上线由服务器把测试库提生产，**不推生产**。

**三条命令**（用 `npm run`，别用 `pnpm run`——pnpm 的 `runDepsStatusCheck` 会在 node_modules 漂移时拦住要清空重装）：

```bash
npm run sync:permissions:check     # ① 推送前核对:打印 国内/国外 菜单权限差异,不推
npm run sync:permissions:cn        # ② 推国内菜单(含发票等国内特例) market=china
npm run sync:permissions:global    # ③ 推国外菜单(剔除国内特例)     market=global
# 每条可加 -- --dry-run 只对账不写 / -- --check 仅本地校验
```

**推送的数据结构**（`scripts/sync-permissions.ts` → `POST /menu-permissions/catalog/sync`）：

`market` 与 `catalog_version` 走 **query 参数**（后端 body schema 严格，不接受 body 里多余字段）；`body` 只放**按该市场过滤后**的目录三段：

```jsonc
// URL: POST /menu-permissions/catalog/sync
//   ?dry_run=false        预览用 true(只对账不写)
//   &market=china|global  市场:决定 body 是否含发票等国内特例
//   &catalog_version=1.0.0 目录版本(见下「全量更新」)

// body:
{
  "source": "modelgo-console-web",        // 来源标识,固定
  "menus": [                              // 菜单列表(按 market 过滤后)
    {
      "key": "billing",                   // 菜单 key,受 MENU_KEY_PATTERN 约束
      "name": "账单管理", "name_en": "Billing",
      "scope": "tenant",                  // tenant | workspace | settings
      "view_permission": "billing:view",  // 该菜单可见所需权限 ID
      "actions": ["billing.recharge:create", ...]  // 该菜单下按钮动作权限 ID(国外已剔发票)
    }
  ],
  "permissions": [                        // 权限定义(仅上面 menus 引用到的)
    { "permission_id": "billing:view", "granularity": "menu", "description": "查看账单管理" }
    // granularity: menu | page | action
  ]
}
```

**版本号 · 全量更新**（`PERMISSION_CATALOG_VERSION`，`permission-catalog.ts`）：

- 结构性改动(增删菜单/权限、改市场归属)时**手动 bump** `PERMISSION_CATALOG_VERSION`(SemVer)。
- 语义:后端见 `catalog_version` **变化** → **全量刷新**该市场目录(丢弃旧的、以本次推送为准);**不变**则走增量对账(返回 `has_changes` / `created_*` / `deprecated_*`)。
- 用途:结构大改后用 bump 版本强制全量,避免增量遗留脏数据。

**国内/国外菜单权限怎么区分**（单一真源,`src/config/permission-catalog.ts`）：

- 默认：一个权限**两市场都有**。
- 市场特例：在 `PERMISSION_MARKET_RESTRICT` 里标该权限只属于哪些市场。例——发票仅国内：
  ```ts
  export const PERMISSION_MARKET_RESTRICT = {
    [PERMS.BILLING_INVOICE_VIEW]:  ['china'],
    [PERMS.BILLING_INVOICE_APPLY]: ['china'],
    // …
  }
  ```
- `catalogPayloadForMarket(market)` 按此过滤:`:cn` 带发票、`:global` 自动剔除。
- 前端运行时同理用 `isDomestic()` 隐藏国外没有的按钮（如发票 tab）。
- **新增市场特例**：往 `PERMISSION_MARKET_RESTRICT` 加一行 → `sync:permissions:check` 就能在「仅国内/仅国外」里看到 → 确认无误再推。

> 输出 `"has_changes": false` = 后端已一致。`check` 示例:国内 10 菜单/51 权限、国外 10 菜单/47 权限、仅国内 = billing.invoice.*（4）。

### 业务 key 命名规范（正则强约束）

权限 ID / 埋点 key 统一格式（`src/config/permissions.ts` 的 `PERMISSION_ID_PATTERN`，由 `validatePermissionCatalog()` 逐条校验，不合规 `--check` 直接报「非法 Permission ID」）：

```
/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*:[a-z][a-z0-9_]*$/
```

= **`资源[.子资源]:动作`**

- 冒号左 = 资源域，`.` 嵌套子资源（`billing.invoice`、`billing.invoice_title`）
- 冒号右 = 动作
- 全小写 **snake_case**，首字符字母，只允许 字母/数字/下划线
- 菜单 key 另受 `MENU_KEY_PATTERN` 约束

**三档粒度 `granularity`：**

| 档 | 用途 | 样例 |
| :--- | :--- | :--- |
| `menu` | 菜单可见 | `api_keys:view` |
| `page` | 子页可见 | `billing.invoice:view` |
| `action` | 按钮动作 | `api_keys:create`、`billing.invoice:apply` |

**动作动词用收敛词表**（复用现有、别造近义词）：`view / edit / create / manage / delete / transfer / withdraw / rotate / revoke / reveal / rename / redeem / export / download / disable / change_owner / cancel / apply`。埋点复用同一 key，自动继承本规范。

---

## 环境变量

> 变量值必须来自已验证地址，禁止编造。

| 变量 | 说明 |
| :--- | :--- |
| `VITE_MARKET` | 本地/测试构建强制指定市场（`domestic` \| `global`） |
| `VITE_API_URL` | 显式覆盖 API Base URL（本地/测试用，生产留空） |
| `VITE_SITE_URL` | 官网根 URL |
| `VITE_DOMESTIC_API_DOMAIN` | 国内 API 域名（不含 `https://`） |
| `VITE_DOMESTIC_CONSOLE` | 国内客户中心地址 |
| `VITE_DOMESTIC_DOCS` | 国内说明文档地址 |
| `VITE_GLOBAL_API_DOMAIN` | 海外 API 域名（不含 `https://`） |
| `VITE_GLOBAL_CONSOLE` | 海外客户中心地址 |
| `VITE_GLOBAL_DOCS` | 海外说明文档地址 |
| `VITE_ICP` | ICP 备案号（仅国内生产） |
| `VITE_WX_MP_APP_ID` | 微信小程序 AppID |
| `VITE_WX_MP_APP_SECRET` | 微信小程序 AppSecret（仅 `.env.local`，不入库） |

### 三套环境矩阵

| 变量 | 本地开发 | 测试构建 | 生产构建 |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | 空（手动配置） | `https://modelgo-web-api.test.modelgo.com` | 空（运行时推断） |
| `VITE_SITE_URL` | `https://test.modelgo.com` | `https://test.modelgo.com` | 空（按市场回退到正式官网） |
| `VITE_DOMESTIC_CONSOLE` | `https://console.test.modelgo.com` | `https://console.test.modelgo.com` | `https://console.modelgo.com` |
| `VITE_DOMESTIC_DOCS` | `https://doc.test.modelgo.com` | `https://doc.test.modelgo.com` | `https://doc.modelgo.com` |
| `VITE_GLOBAL_CONSOLE` | `https://console.test.modelgo.com` | `https://console.test.modelgo.com` | `https://console.modelgo.ai` |
| `VITE_GLOBAL_DOCS` | `https://doc.test.modelgo.com` | `https://doc.test.modelgo.com` | `https://doc.modelgo.ai` |

---

## 🚀 启动与构建

### 登录账号

账号清单（test / prod，JSON 数组，支持多账户）存在 cs secrets，不落仓库明文：

```bash
cs secrets get secret://modelgo/accounts        # 全部账户
cs secrets get secret://modelgo/accounts | python3 -c "import sys,json;[print(a['env'],a['email'],a['password']) for a in json.load(sys.stdin)]"
```

字段：`env`(test/prod) · `email` · `password` · `role` · `note`。
本地一键登录（dev console）：`await window.__mg_login(email, password)`（见 `src/lib/dev-auth.ts`，仅 DEV 挂载）。

### 本地启动

```bash
pnpm install

# 本地开发（HMR）
pnpm dev

# 测试环境打包（加载 .env.test）
pnpm build:test

# 生产环境打包（加载 .env.production）
pnpm build:prod
```

---

## 📋 任务看板 & 开发流程

### 三个看板（按优先级）

| 看板 | 用途 | 优先级 |
| :--- | :--- | :--- |
| `shared/modelgo_prd` | **需求方**报的 BUG/需求（PD 提单） | 最高，优先处理 |
| `qa/ai-quality-platform` | QA 板：`[前端]`/`[后端]` 前缀分流 + owner 指派 | 次之 |
| `frontend/modelgo-console-web` | 前端内部任务跟踪 | 内部 |

| 看板列 | GitLab Label | 说明 |
| :--- | :--- | :--- |
| 待处理 | `已认领` | 已分配但未开始 |
| 进行中 | `进行中` | 开发/修复中 |
| 待验证 | `待验证` | 等待报单人/QA 验收 |
| 已完成 | `已完成` | 验收通过，关闭 |

业务标签：`BUG`（缺陷）、`TASK`（需求）、`Feature`（功能需求）、`前端就绪`（前端已完成待后端/QA）

### 单张任务的标准流程（摘要，全文见 [`docs/COLLABORATION.md`](./docs/COLLABORATION.md)）

```
领单/认领 → 开隔离 worktree（禁止直接在主检出 test 分支写码）
→ 对真源（PRD 原型 > 飞书 PRD > 现代码；API 以 Swagger 为准）
→ 开发 + 门禁（pre-commit 快检 + ui-guard）
→ ego-lite 浏览器验证（双主题/真实数据/截图，见 mg-frontend skill 的 ui-verification）
→ 合 test 分支 → push → Jenkins 发测试环境 → 在部署后的环境复验
→ GitLab 单贴 版本号+根因+截图 → 转「待验证」   ← 顺序不可反：先部署后改状态
```

- 前端用了后端未交付的字段/端点 → 必须落 API 单并在代码注释挂单号；
- 后端交付的待验证单 → 联调实测后才流转，不认标签只认真源。

**发现 API 错误（联调打不通 / 返回违反契约 / 后端字段缺失）怎么走**：

1. 先取证：读 `log/api-calls.log`（agent-eyes 落盘的请求/响应全量），别凭页面表象判断；
2. 判归属：归属判定表见 [`docs/COLLABORATION.md`](./docs/COLLABORATION.md)「生产验收 → QA → 回归 Loop」——请求路由/HTTP 状态/业务 code 违反契约归后端，展示与契约都异常算混合、同单拆清；
3. 落 API 单（建单前按模块查重，一模块一单）：格式 页面→接口→问题→缺什么 + 验收 checkbox，带 curl/请求响应证据；
4. 指对模块 owner（完整指派表见 [`docs/COLLABORATION.md`](./docs/COLLABORATION.md)「团队指派表」）：通用 API=任杰、用量/日志/总览口径=凌霄、护栏/提示词检测=邵一鸣；
5. 边界：别人建的纯后端单不代管、不擅自转派；前端不写兜底遮掩后端语义错误，开单钉死。

### 产品需求真源（飞书 PRD）

**优先级：PRD 原型 > 飞书 PRD 文档 > 现状代码**；命名一律以 PRD 原型为准（租户/工作空间，禁用组织/项目）。

| 真源 | 位置 | 用途 |
| :--- | :--- | :--- |
| PRD 原型源码 | [`shared/modelgo_prd`](https://gitlab.ops.modelgo.com/shared/modelgo_prd) → `src/App.tsx`（clone 到本地后直接读源码，勿开浏览器扒） | 功能/交互/字段文案/弹层形态 |
| 飞书 PRD | 《ModelGo PRD by Release》知识库（V1.0.x 累积基线，8 篇子 PRD） | 规格细节、验收标准（AC） |
| 现状控制台 | 本仓代码 + `DESIGN.md` + `docs/ui-reference/` | 布局排版与视觉的唯一真源 |

> 飞书各篇 node token 与 lark-cli 读法见仓根 `CLAUDE.md`「真源 & 交付铁律」（token 随改版会失效，不在本文复制）。
> 原型只给功能与交互——**它自身的视觉 ≠ 控制台视觉**，排版照现状同类页。

> 控制台 `platform-config` 页面的需求看板与 GitLab Board 对应，issue 状态同步。

### Task Skills（Agent 操作入口）

本项目所有任务管理操作通过以下 Skill 执行：

| Skill | 触发方式 | 用途 |
| :--- | :--- | :--- |
| `gitlab-board` | `/gitlab-board` | QA 看板全操作：查/创建/移动 issue、换列、分配责任人 |
| `testmgr-api` | `/testmgr-api` | TestMgr REST API：测试用例、任务、BUG、看板数据 |

#### gitlab-board

操作 `https://gitlab.ops.modelgo.com/groups/qa/-/boards` 的唯一 Skill。调用前置：`glab` 已认证 `gitlab.ops.modelgo.com`。

```bash
# 开工：直接喊 /gitlab-board，让 Agent 帮你查/建/移动 issue
# 或手动执行：

# 查指派给自己的 issue
glab api "issues?state=opened&scope=assigned_to_me&per_page=100" --hostname gitlab.ops.modelgo.com

# 查指派给自己的 BUG
glab api "issues?state=opened&scope=assigned_to_me&labels=BUG&per_page=100" --hostname gitlab.ops.modelgo.com

# 创建需求
glab api -X POST "projects/1/issues" --hostname gitlab.ops.modelgo.com \
  --field "title=[Console] 需求标题" --field "labels=TASK,已认领"

# 移动到「进行中」
glab api -X PUT "projects/1/issues/{iid}" --hostname gitlab.ops.modelgo.com \
  --field "labels=TASK,进行中"

# 完成并关闭
glab api -X PUT "projects/1/issues/{iid}" --hostname gitlab.ops.modelgo.com \
  --field "labels=TASK,已完成" --field "state_event=close"
```

#### testmgr-api

直连 `https://qa.ops.modelgo.com` 的 TestMgr REST API，管理测试用例、任务、BUG。

```bash
# 查 board 全貌
curl https://qa.ops.modelgo.com/api/testmgr/board

# 查所有版本
curl https://qa.ops.modelgo.com/api/testmgr/versions

# 任务列表
curl https://qa.ops.modelgo.com/api/testmgr/tasks
```

> 状态字段统一：`todo` / `in_progress` / `blocked`（显示为「待验证」）/ `done` / `canceled`。禁止发 DELETE 请求。

### Agent / CLI 入口

```bash
# 开工快照
cs brief

# 查看研发流程和规则
cs flow
cs rule
```

---

## 🎨 样式规范

### 原子类 @apply 封装

禁止在 JSX 标签上堆砌长串 Tailwind 原子类，需抽离到 `index.css` 的语义化 CSS 类中：

```css
/* ✅ index.css */
.welcome-banner-card {
  @apply flex items-center justify-between p-4;
  @apply bg-mg-bg-0 border border-mg-border rounded-xl shadow-sm;
}
```

```tsx
{/* ✅ JSX 只写语义类名 */}
<div className="welcome-banner-card">...</div>
```

### 飞书文档

| 文档 | 链接 |
| :--- | :--- |
| 前端设计文档 | [ModelGo 官网与客户中心前端设计文档](https://ocny5azjudjs.feishu.cn/wiki/XPxZwyr1Xinp71kVtxlcIVHQn0g) |
| HTTP 请求头注入清单 | [前端 HTTP 请求头注入清单](https://ocny5azjudjs.feishu.cn/wiki/ZtDewaaqFiclOFkWnUscEs8CnNg) |
| OAuth 快捷登录 | [OAuth 快捷登录 · 端到端配置手册](https://ocny5azjudjs.feishu.cn/wiki/Yh0lwqJ3TiDa6jkFIslcWCsXnGg) |
| 打包部署 | [前端项目打包部署说明](https://ocny5azjudjs.feishu.cn/wiki/GMgPwHjqiiTnhGkom1ecCSZRnTc) |
| 微信开放平台 | [微信开放平台 · 网站应用申请材料清单](https://ocny5azjudjs.feishu.cn/wiki/M8a0wGI5ZivsIvk7TJDcdk6FnJf) |
| Claude Code 钩子 | [Claude Code 上线前检查钩子手册](https://ocny5azjudjs.feishu.cn/wiki/UjNFwdR0hi0FHLkNvgpcXOfInXg) |

---

## ☠️ 已踩过的雷(实战教训,动手前读)

1. **验证部署先破缓存**:本项目是 PWA,ServiceWorker 会缓存旧 bundle——部署成功但浏览器仍显旧版。**验部署必先注销 SW/清 caches,并核对页脚 commit hash**(侧栏底部 `v0.6.0 · <sha>`)。
2. **Jenkins 双发布线**:`prod/modelgo-console-web` 只发**国内**(console.modelgo.com),国外(console.modelgo.ai)在 **`prod-global/`** 目录下——发版极易漏发国外,两条都要触发。
3. **Jenkins 构建 SHA 别读第一个**:build 的 actions 里第一个 `lastBuiltRevision` 是 devops/cicd 流水线库,**项目 SHA 要认 remoteUrls 为本仓库的那条**。
4. **React Query 同 key 只许一种形状**:同一 queryKey 在不同页面存不同形状(数组 vs 分页对象)会互相污染缓存 → 页面崩溃(需求方 #44 根因;#60 又扫出一处)。新查询前 grep 该 key 的既有消费方。
5. **测试必须 mock 全被挂载 hook 的 service**:页面挂载的 hook(如 useTenantRole→listTenants)若没 mock,会发**真网络请求** → 40101 → `clearAuth()` **异步**洗掉下一个用例刚 setState 的 store——跨用例竞态、单跑过连跑挂、极难排查(guardrails 测试实案)。
6. **多 agent 并发必须 worktree 隔离**:共用工作树会互踩 git stash、把 node_modules 与 lockfile 撕裂(pre-commit 的 `runDepsStatusCheck` 全挂)。并行改动各自 `git worktree add` + symlink node_modules;环境撕裂用 `CI=true pnpm install` 重装修复,别一路 `--no-verify` 绕。
7. **前端不替后端遮丑**:后端把 id 塞进 `*_name` 字段、国外站返 `site:"china"` 这类语义污染——**不写兜底遮掩,开单钉死后端**(带 curl 铁证)。品牌/入口类已用「生产域名前置锁定」免疫(`marketLockedByDomain`),platform-config 不得覆盖。

---

## 关联项目

| 项目 | 仓库 | 说明 |
| ---- | ---- | ---- |
| 官网 | `modelgo-web` | 纯营销站 |
| 控制台 | `modelgo-console-web` | 本项目，客户中心 |
| 文档站 | `doc-web` | VitePress |
