# mg-frontend-skill · ModelGo 控制台前端 Skill（主入口）

> 给所有用 AI 写 console-web 代码的人（前端/后端/PD/任何 agent）：**在 AI 写第一行代码之前，把本文连同引用的真源喂给它**。
> 本目录只做「入口 + 路由」，事实真源在各引用文件里——**冲突时以真源为准，别信本文的摘要**。

## 触发场景（When）

命中任意一条，先读本 Skill 再动手：

- 新增/修改 `modelgo-console-web` 的页面、组件、样式、交互；
- 后端/PD 用 AI 搭 console 相关的原型或工具页；
- 联调后端接口、消费新字段；
- 修 UI bug、对齐 PRD。

## 项目识别（本仓是什么）

| 项 | 值 |
|---|---|
| 定位 | ModelGo 客户控制台（独立 SPA，登录后管理 API Keys/用量/账单/工作空间/模型体验） |
| 技术栈 | React 19 + Vite 8 + TypeScript 6 + Tailwind 4（token 化）+ Radix + 自有 `src/components/ui/*` |
| 状态/数据 | zustand + TanStack Query 5；服务层 `src/services/*.ts` |
| 路由/国际化 | react-router-dom 7；i18next（中英双语，文案进 `src/locales/`） |
| 视觉源 | npm 包 `modelgo-design-tokens`（`--mg-*`/`--brand-*`/`--radius-*`），双端品牌由 `data-market` 切换 |
| 包管理 | pnpm（勿用 npm/yarn） |
| 部署 | Jenkins（test/prod/prod-global 三 job），测试环境走 `test` 分支 |

⚠️ **AI 默认偏好 ≠ 本仓选型**：不要引入 Next.js、shadcn/ui、lucide-react、Ant Design、Semi（已彻底移除）、MUI 或任何未审计的组件库/图标库。

## 硬约束概要（Don't · 完整版见 [reference/aicoding-rules.md](./reference/aicoding-rules.md)）

1. 主操作用 `<Button variant="brand">`，**禁止**手写 `<button className="bg-brand-*">`；
2. 卡片用 `.mg-tile` / `<Card>`，勿拿 `bg-mg-fill-0` 凑层次；
3. 圆角只用 `rounded-sm/md/lg/full`（`rounded-xl/2xl/3xl` 是禁用刻度）；
4. 颜色一律 token（`--mg-*`/`--brand-*`），禁硬编码 hex（例外：语义状态色、box-shadow rgba）;
5. 图标只用 `react-icons` 或 `@lobehub/icons`；模型身份展示必须 `<ModelIcon>`；
6. 每页标题用 `<PageHeader>`，禁止覆盖其间距；页面外层统一 `space-y-6`；
7. 无权限 = 隐藏入口；有权限没数据 = 空态引导；仅 PRD 明确的互斥项才置灰；
8. 复用优先：先翻 `src/components/ui/*`（30+ 现成组件）再考虑新建。

**门禁是机器执行的**：`scripts/ui-guard.sh` 提交时硬拦 1-5 的违规；pre-commit 跑类型+规范快检（无 cs 环境自动降级 tsc+eslint）。

## 真源优先级（写码前先对源）

**PRD 原型（`../modelgo_prd/src/App.tsx`，本地源码直接读）> 飞书 PRD 文档 > 现状代码**。
- 命名以 PRD 为准：租户（tenant）/工作空间（workspace），**禁止**「组织/项目/业务空间」；
- 原型只给功能+交互；**布局排版的真源是现状控制台**——动手前找同类现有页当参照（见 [reference/component-templates.md](./reference/component-templates.md) 参照页表）；
- API 真源是 Swagger（`https://modelgo-web-api.test.modelgo.com/swagger/doc.json`），别按看板状态盲信接口存在。

## 快速开始

```bash
pnpm install               # 装依赖（自动装 git hooks；pre-commit 无 cs 环境自动降级 tsc+eslint）
pnpm dev                   # http://localhost:5175，/api 代理到 test 后端
bash scripts/ui-guard.sh   # 提交前 UI 门禁（pre-commit 自动跑）
pnpm lint && npx tsc --noEmit
```

**完成 ≠ 编译通过**：UI 改动交付前必须走 [ego-lite 浏览器验证](./reference/ui-verification.md)（双主题/真实数据/截图留证），这是硬性 DoD。

## 目录路由（Map）

| 想知道 | 去哪 |
|---|---|
| 完整硬性约束（每条带 why） | [reference/aicoding-rules.md](./reference/aicoding-rules.md) |
| 技术选型矩阵/决策树 | [reference/tech-selection.md](./reference/tech-selection.md) |
| 标准样板（列表页/表单/Service+Hook）+ 参照页表 | [reference/component-templates.md](./reference/component-templates.md) |
| **UI 自动化验证（ego-lite/mg-verify）+ 完成的定义 DoD** | [reference/ui-verification.md](./reference/ui-verification.md) |
| 命名/目录/注释/Git 提交规范 | [reference/coding-standards.md](./reference/coding-standards.md) |
| 设计 token / 视觉铁律全文 | 仓根 [`DESIGN.md`](../../DESIGN.md)（真源） |
| 模块级 UI 框架+字段+角色差异 | [`docs/ui-reference/`](../ui-reference/)（真源，现有 api-keys/guardrails） |
| 多仓工作区地图 | [reference/domain-repository-map.json](./reference/domain-repository-map.json) |
| 术语表 | [reference/glossary.md](./reference/glossary.md) |
| 各能力 owner 对接路由 | [reference/contacts.md](./reference/contacts.md) |
| 协同 SOP（worktree/认领/提单/验证闭环） | [`docs/COLLABORATION.md`](../COLLABORATION.md)（真源） |
