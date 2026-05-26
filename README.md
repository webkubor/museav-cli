# modelgo-console-web

ModelGo 独立的客户中心/控制台前端项目，覆盖 `console.modelgo.com`（国内·词元共生）和 `console.modelgo.ai`（海外·ModelGo）两个市场的控制台与鉴权入口。

本仓库基于 **Vite 8 + React 19 + TypeScript + Semi Design** 搭建。

---

## 🔗 团队研发真源入口 (AI 联调必读)

为了避免信息偏差，API、设计及文档请严格以团队统一在线文档为准：

### 1. 团队知识库 (飞书 Doc)
*   **主题色系设计规范**：[飞书设计文档](https://ocny5azjudjs.feishu.cn/docx/ZBSTdpOukohJVOxPKNDcGb6DnIc)
*   **前端 HTTP 请求头注入清单**：[请求头注入规范](https://ocny5azjudjs.feishu.cn/wiki/ZtDewaaqFiclOFkWnUscEs8CnNg)
*   **开发者文档站域名 (国内)**：`https://doc.modelgo.com`
*   **开发者文档站域名 (海外)**：`https://doc.modelgo.ai`

### 2. 项目 API 真源 (Swagger)
*   **Web API Swagger**：[Modelgo Web API Swagger](https://modelgo-web-api.test.modelgo.com/swagger/index.html)
    *   *覆盖范围*：官网、客户中心、账号登录、工作区管理、计费套餐、API Keys、调用审计日志等所有前端接口。
*   **接口契约自检**：
    在新项目根目录下执行以下命令，可直接自动拉取并核对 Swagger 最新接口契约：
    ```bash
    pnpm check:api-contract
    ```

---

## 🛠️ 本地接口联调与错误审计 (Dev Logger)

控制台项目集成了**高度智能的本地开发请求错误拦截日志插件**：

### 1. 错误审计日志 (`.dev-errors.log`)
*   **只在本地开发环境生效**，该日志文件已被 `.gitignore` 排除，不上传 git。
*   当您在本地开发联调（启动 `pnpm dev`）时，所有失败的 API 请求（Query/Mutation 报错）会自动记录追加到项目根目录下的：
    ```text
    .dev-errors.log
    ```
*   **查看方式**（在遇到接口报错时，第一步必看此文件，不要盲目猜）：
    ```bash
    cat .dev-errors.log
    ```
*   每次重启 `pnpm dev` 时，该日志文件会自动清空，只保留本次开发会话的日志，帮助 AI Agent 和开发者快速定位接口入参或状态问题。

---

## 🌐 环境、市场与子域名映射

控制台通过入口域名动态解析“国内”和“海外”两个市场，并允许在 Header 联动展示不同的品牌信息。

### 环境变量映射表

| 变量 | 说明 | 测试环境默认值 | 生产环境默认值 |
| :--- | :--- | :--- | :--- |
| `VITE_MARKET` | 本地开发初始市场默认值 | `domestic` | 未设置 |
| `VITE_SITE_URL` | 官网主站根 URL | `https://test.modelgo.com` | `https://modelgo.ai` |
| `VITE_DOMESTIC_CONSOLE` | 国内客户端控制台地址 | `https://test.modelgo.com` | `https://console.modelgo.com` |
| `VITE_GLOBAL_CONSOLE` | 海外客户端控制台地址 | `https://test.modelgo.ai` | `https://console.modelgo.ai` |
| `VITE_DOMESTIC_API_DOMAIN` | 国内 API 接口网关域名 | `test.modelgo.com` | `modelgo.com` |
| `VITE_GLOBAL_API_DOMAIN` | 海外 API 接口网关域名 | `test.modelgo.ai` | `modelgo.ai` |

---

## 🚀 启动与构建命令

```bash
# 1. 安装项目所有依赖
pnpm install

# 2. 启动本地开发服务 (支持 HMR)
pnpm dev

# 3. 静态类型校验与生产环境打包 (运维 CI/CD 使用)
# 测试环境打包 (加载 .env.test)
pnpm build:test

# 生产环境打包 (加载 .env.production)
pnpm build:production
```

---

## 🎨 Semi Design 页面排布与规范

控制台采用 **Semi Design** 作为默认 UI 系统。在新增/开发组件时，请遵守以下设计与行数规范：
1. **物理隔离与防“屎山”**：单组件文件代码尽量控制在 **300 行** 内。复杂的表格逻辑、弹窗表单应提取到独立子组件中，禁止在单一页面拼凑庞大 UI。
2. **零 CSS 手写**：Semi Design 拥有极度全面的布局及样式原语，优先使用内置组件属性（例如 `<Table bordered={false}>`、`<Button theme="solid">` 等）实现极简云平台风格，尽量避免手写 ad-hoc 样式，以保证后台控制台的美学一致性。
