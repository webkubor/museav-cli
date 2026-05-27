# modelgo-console-web 冷启动卡片

## 项目是什么

ModelGo 客户控制台，从官网（website）拆出的独立 SPA。用户登录后管理 API Keys、用量、账单、业务空间等。

## 环境

| 环境 | 地址 |
|------|------|
| 本地开发 | `pnpm dev` → `http://localhost:5175`，`/api` 代理到 `test.modelgo.com` |
| 测试 | `https://console.test.modelgo.com`（`pnpm build:test`） |
| 生产-国内 | `https://console.modelgo.com` |
| 生产-海外 | `https://console.modelgo.ai` |

## API 文档

Swagger：`https://modelgo-web-api.test.modelgo.com/swagger/doc.json`

## 关键约定

- **无 Mock**：MSW 已完全移除，接口直连后端（dev 走 vite proxy，test/prod 走域名）
- **认证**：`SessionLoader` 启动时拉 `/api/v1/auth/session`；未登录 → `ProtectedRoute` 重定向 `/login`
- **双端品牌**：`data-market` 挂在 `<html>` 上，`domestic` = indigo，`global` = emerald；Logo 文件在 `public/brand/`
- **市场检测**：`VITE_MARKET` 构建变量 → 域名匹配 → 默认 global
- **Semi Design 主色**：通过 `--semi-color-primary` CSS 变量注入，在 `src/index.css` 按 `[data-market]` 切换

## 完成度（2026-05-27）

✅ 基础设施：认证守卫、品牌系统、接口代理、构建配置
✅ 页面：Dashboard（KPI hardcoded）、API Keys、Workspaces、Auth 全套
❌ 占位页面：/usage、/logs、/pay-as-you-go、/token-plan、/invoices、/settings/account、/settings/alarms

## 更多上下文

`cs search modelgo` 或读 `~/Documents/memory/projects/modelgo.md`
