# modelgo-console-web · 客户中心

覆盖国内（`console.modelgo.com` · 词元共生）和海外（`console.modelgo.ai` · ModelGo）两个市场的控制台与鉴权入口。运行时通过 `VITE_MARKET` 或域名自动判断市场，切换对应的品牌、主题色、API 域名和文档地址。

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
| 框架 | React 19 + React Router v6 |
| UI | Tailwind CSS v4 + Radix UI |
| HTTP | Fetch + TanStack Query v5 |
| 状态 | Zustand |
| 图标 | Lucide React |
| 国际化 | react-i18next |

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
| domestic（国内） | 词元共生 | 靛紫 `#6743fd` |
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

### 三套环境矩阵

| 变量 | 本地开发 | 测试构建 | 生产构建 |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | 空（手动配置） | `https://test.modelgo.com` | 空（运行时推断） |
| `VITE_SITE_URL` | `https://test.modelgo.com` | `https://test.modelgo.com` | 空（按市场回退到正式官网） |
| `VITE_DOMESTIC_CONSOLE` | `https://console.test.modelgo.com` | `https://console.test.modelgo.com` | `https://console.modelgo.com` |
| `VITE_DOMESTIC_DOCS` | `https://doc.test.modelgo.com` | `https://doc.test.modelgo.com` | `https://doc.modelgo.com` |
| `VITE_GLOBAL_CONSOLE` | `https://console.test.modelgo.com` | `https://console.test.modelgo.com` | `https://console.modelgo.ai` |
| `VITE_GLOBAL_DOCS` | `https://doc.test.modelgo.com` | `https://doc.test.modelgo.com` | `https://doc.modelgo.ai` |

---

## 🚀 启动与构建

```bash
pnpm install

# 本地开发（HMR）
pnpm dev

# 测试环境打包（加载 .env.test）
pnpm build:test

# 生产环境打包（加载 .env.production）
pnpm build:production
```

---

## 📋 任务看板 & AI Skills

### GitLab QA 看板

线上地址：[https://gitlab.ops.modelgo.com/groups/qa/-/boards](https://gitlab.ops.modelgo.com/groups/qa/-/boards)

Group: `qa`（ID 8） · Board: `Development`（ID 2） · 默认项目: `ai-quality-platform`（ID 1）

| 看板列 | GitLab Label | 说明 |
| :--- | :--- | :--- |
| 待处理 | `已认领` | 已分配但未开始 |
| 进行中 | `进行中` | 开发/修复中 |
| 待验证 | `待验证` | 等待 QA 验收 |
| 已完成 | `已完成` | 验收通过，关闭 |

业务标签：`BUG`（缺陷）、`TASK`（需求）、`前端就绪`（前端已完成待后端/QA）

> 控制台 `platform-config` 页面的需求看板与此 GitLab Board 对应，issue 状态同步。

### AI Skills 安装与更新

```bash
npx git+ssh://git@gitlab.ops.modelgo.com/shared/ai-skills.git
```

安装后 Claude/Codex 自动加载以下 skill：

| Skill | 用途 |
| :--- | :--- |
| `gitlab-board` | 查看/创建/移动 GitLab QA 看板 issue |
| `gotest` | Go 单元测试生成 |
| `testmgr-api` | TestMgr API 查询 |

常用操作（通过 `gitlab-board` skill）：

```bash
# 查看所有 open issues
glab api "groups/qa/issues?state=opened&per_page=100" --hostname gitlab.ops.modelgo.com

# 创建 issue
glab api -X POST "projects/1/issues" --hostname gitlab.ops.modelgo.com \
  --field "title=[Console] 需求标题" --field "labels=TASK,已认领"

# 移动 issue 到「进行中」
glab api -X PUT "projects/1/issues/{iid}" --hostname gitlab.ops.modelgo.com \
  --field "labels=TASK,进行中"

# 完成并关闭
glab api -X PUT "projects/1/issues/{iid}" --hostname gitlab.ops.modelgo.com \
  --field "labels=TASK,已完成" --field "state_event=close"
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

### 飞书设计规范

- **主题色系**：[飞书设计文档](https://ocny5azjudjs.feishu.cn/docx/ZBSTdpOukohJVOxPKNDcGb6DnIc)
- **HTTP 请求头注入清单**：[请求头注入规范](https://ocny5azjudjs.feishu.cn/wiki/ZtDewaaqFiclOFkWnUscEs8CnNg)

---

## 关联项目

| 项目 | 仓库 | 说明 |
| ---- | ---- | ---- |
| 官网 | `modelgo-web` | 纯营销站 |
| 控制台 | `modelgo-console-web` | 本项目，客户中心 |
| 文档站 | `doc-web` | VitePress |
