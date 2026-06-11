# modelgo-console-web 冷启动卡片

## 项目是什么

ModelGo 客户控制台，从官网（website）拆出的独立 SPA。用户登录后管理 API Keys、用量、账单、工作区等。

## 环境

| 环境 | 地址 |
|------|------|
| 本地开发 | `pnpm dev` → `http://localhost:5175`，`/api` 代理到 `test.modelgo.com` |
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
- **本地日志**：`scripts/dev-logger-plugin.ts` 开 `/dev/log` 接口，前端 POST 落盘到 `log/`。API 失败 → `[api][failed]`（dev-errors.log）；前端运行时错误经 `src/lib/dev-error-reporter.ts` 上报 → `[frontend][uncaught|rejection|console]`
- **认证**：`SessionLoader` 启动时拉 `/api/v1/auth/session`；未登录 → `ProtectedRoute` 重定向 `/login`
- **双端品牌**：`data-market` 挂在 `<html>` 上，`domestic` = indigo，`global` = emerald；Logo 文件在 `public/brand/`
- **Semi Design 主色**：通过 `--semi-color-primary` CSS 变量注入，在 `src/index.css` 按 `[data-market]` 切换
- **颜色**：所有颜色用 Semi Design CSS token，禁止硬编码 hex（保留语义状态色 green/red/yellow 和 box-shadow rgba）
- **pageItems<T>()**：`src/lib/utils.ts`，处理后端返回 CursorPage 或直接数组的兼容

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
