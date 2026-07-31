# 技术选型矩阵（What）

> 原则：**内部已有 > 仓内已装 > GitHub 成熟包 > 手撸**。AI 偏好的开源主流搭配（Next.js/shadcn/lucide/Antd）不等于本仓选型。

## 选型矩阵

| 需求 | 用这个 | 不要用 | 说明 |
|---|---|---|---|
| UI 组件 | `src/components/ui/*`（Button/Modal/SideSheet/Table/Tabs/Select/Switch/KpiCard/PageHeader/EmptyState 等 30+） | shadcn、Antd、Semi（已移除）、MUI | 缺什么先问要不要补进 ui/*，不页面内自绘 |
| 无头交互原语 | Radix UI | headlessui | Dialog/Popover/DropdownMenu 已封装 |
| 样式 | Tailwind 4 + `--mg-*` token | styled-components、CSS Modules 新增、内联 style | token 值来自 npm 包 `modelgo-design-tokens`；页面级独立 css 仅 models/billing 等既有文件延续 |
| 图标 | `react-icons`（Lu 系）、`@lobehub/icons`（模型厂商） | lucide-react、手写 SVG | 模型识别一律 `<ModelIcon>` |
| 服务端状态 | TanStack Query 5（`src/hooks/`、`src/features/*/hooks/`） | 手写 useEffect+fetch | staleTime 按数据变化频率给 |
| 客户端状态 | zustand（模块级 store） | Redux、Context 滥用 | 跨路由持久化场景用它（如体验工作台） |
| 请求 | `src/lib/request.ts` 的 `get/post/put/del` | 裸 fetch/axios | 统一注入 X-Tenant-Id/CSRF/traceparent，错误信封统一解析 |
| 路由 | react-router-dom 7（`src/router/index.tsx`） | — | 新页面记得挂权限路由 |
| 图表 | Recharts 3 | echarts、d3 手撸 | 用量分析页有现成模式可抄 |
| 国际化 | i18next，文案进 `src/locales/zh.json` + `en.json` | 硬编码中文 | 每次调用时取值，别模块加载期缓存 |
| 表单校验 | 组件内轻校验 + 后端 field_errors 透出 | 引入表单库 | 本仓表单密度低，不值得上库 |
| 日期/工具 | 先查 `src/lib/utils.ts`（pageItems/trimPriceZeros 等） | 重复造 | 通用工具优先装成熟 npm 包 |

## 决策树

```
需要一个 UI 能力
├─ ui/* 有现成组件？ → 直接用（改 props 优于新建）
├─ Radix 有原语？ → 封装进 ui/* 再用（提 PR 时说明）
├─ GitHub 有 >2k star 成熟包且体积可控？ → 装包（先看 license）
└─ 都没有 → 手写，但样式全走 token，且落在 ui/* 里可复用
```

## 版本基线（2026-07，以 package.json 为准）

React 19 · Vite 8 · TS 6 · Tailwind 4 · TanStack Query 5 · zustand 5 · react-router 7 · Recharts 3 · i18next 26

## 环境

| 环境 | 地址 | 分支 |
|---|---|---|
| 本地 | `pnpm dev` → localhost:5175（/api 代理 test 后端） | — |
| 测试 | console.test.modelgo.com | `test` |
| 生产国内 | console.modelgo.com | `main` + tag（Jenkins prod/） |
| 生产海外 | console.modelgo.ai | `main` + tag（Jenkins prod-global/，**两个 job 都要发**） |
