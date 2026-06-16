# modelgo-console-web 冷启动卡片

## 项目是什么

ModelGo 客户控制台，从官网（website）拆出的独立 SPA。用户登录后管理 API Keys、用量、账单、工作区等。

## 环境

| 环境 | 地址 |
|------|------|
| 本地开发 | `pnpm dev` → `http://localhost:5175`，`/api` 代理到 `modelgo-web-api.test.modelgo.com`（test.modelgo.com 网关已收紧白名单返回 invalid domain，勿用） |
| 测试 | `https://console.test.modelgo.com`（`pnpm build:test`） |
| 生产-国内 | `https://console.modelgo.com` |
| 生产-海外 | `https://console.modelgo.ai` |

## API 文档

Swagger：`https://modelgo-web-api.test.modelgo.com/swagger/doc.json`

## 概念统一（必须遵守）

- **组织** = tenant（API 字段 `tenant_id`）— 一个账号最多 5 个
- **项目** = workspace（数据层字段 `workspace_id`）— 隶属于某个组织
- **UI 文案命名**：workspace 实体中文统一显示「项目」，英文显示「Workspace」；数据层、字段名、路由仍用 workspace/workspace_id
- **禁止使用"业务空间"**

## 关键约定

- **无 Mock**：MSW 已彻底移除（含 `src/mocks`、`public/mockServiceWorker.js`、依赖），接口直连后端（dev 走 vite proxy，test/prod 走域名）
- **本地日志（agent 自愈遥测）**：用 npm 包 **`vite-plugin-agent-eyes`**（`agentDebugger()` + `agentProxy()`，配在 vite.config）。三类流落盘到 `log/`（运行时生成、不入库、启动清空、自描述见 `log/README.md`）：`api-calls.log`（API 全量+体）、`errors.log`（API 失败 + 前端运行时错误，前端经 `src/lib/dev-error-reporter.ts` POST `/dev/log`）、`proxy.log`（Cookie/Set-Cookie/status 等 fetch 看不到的网络层）。排查 bug 先读这三个。
- **认证**：`SessionLoader` 启动时拉 `/api/v1/auth/session`；未登录 → `ProtectedRoute` 重定向 `/login`
- **双端品牌**：`data-market` 挂在 `<html>` 上，`domestic` = indigo，`global` = emerald；Logo 文件在 `public/brand/`
- **Semi Design 主色**：通过 `--semi-color-primary` CSS 变量注入，在 `src/index.css` 按 `[data-market]` 切换
- **颜色**：所有颜色用 Semi Design CSS token，禁止硬编码 hex（保留语义状态色 green/red/yellow 和 box-shadow rgba）
- **pageItems<T>()**：`src/lib/utils.ts`，处理后端返回 CursorPage 或直接数组的兼容
- **页面布局规范**：每页用 `<PageHeader>` 做标题，**禁止传 `className="mb-0"` 之类覆盖其间距**——间距由组件统一管（自带 `mb-6`），页面外层容器统一 `space-y-6`（或 `flex flex-col gap-6`）。标题到首卡的标准间距即由这两者叠加而来，曾因 5 个页面私自 `mb-0` 导致标题贴卡（33d7fc6 修复）

## 导航架构（侧边栏两段式）

**Tenant 级**（切换工作区不影响）：总览、用量分析、账单、设置
**工作区级**（切换工作区内容随之变）：API Keys、安全护栏、可观测性、项目管理（含成员）

## 客服 AI 聊天 API

接口：`POST /api/v1/agent/chat`
SSE 事件：`start` → `delta`(流式) → `done`(完整答案 + conversation_id) → `error`
持久化：localStorage `modelgo_cs_history`、`modelgo_cs_conversation_id`
组件：`src/components/customer-service/`，挂载在 DashboardLayout 全局

## 完成度（2026-06-11）

✅ 基础设施：认证守卫、品牌系统、接口代理、构建配置、客服聊天浮窗
✅ 页面：Dashboard、API Keys、工作区管理、用量分析、日志、账单、安全护栏、可观测性、邀请管理、组织管理（多组织）、账号设置、Auth 全套
✅ Dashboard KPI 全部接口联调：余额/本月消费/请求数/Token 均已接入真实 API

## 更多上下文

`cs search modelgo` 或读 `~/Documents/memory/projects/modelgo.md`
