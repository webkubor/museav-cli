# UI 参考（模块级）

给 **agent 开发前对齐用** 的模块级 UI 参考。每份文档按三段式写全，别只写布局：

1. **UI 框架** — 页面/抽屉/弹窗的布局结构、用到的 `ui/*` 组件、容器规则、参照区块
2. **字段文案** — 每个字段的标签、枚举值、占位/提示（**照 PRD 原型常量，不自造**）
3. **不同身份下的显示差异** — tenant owner / tenant admin / space owner / member 各看到什么、哪些入口/列/操作隐藏 or 置灰、空态

## ⚠️ 这是衍生文档，不是真源

真源永远是 **PRD 原型（`modelgo_prd/src/App.tsx`，功能）+ 现状代码（`src/pages/**`，视觉/布局）+ 后端 Swagger（接口）**。本目录只是把它们**提炼汇总**，方便开工前快速拿到全貌。**冲突时以真源为准。**

- **基线**：衍生自 PRD 原型 `modelgo_prd` commit `4ef7ee7`（2026-07-22）+ 现状代码，生成于 2026-07-24。
- **同步机制**：PRD 原型改版后，对应模块文档**重跑调研同步**（读最新原型 + 现状代码重新提炼），并更新头部基线 commit。发现文档与真源对不上 → 以真源为准并顺手修文档，别将错就错。

## 清单

| 文档 | 模块 | 对应代码 |
|---|---|---|
| [api-keys.md](./api-keys.md) | API Keys | `src/pages/api-keys/` |
| [guardrails.md](./guardrails.md) | 安全护栏 | `src/pages/guardrails/` |
| [billing.md](./billing.md) | 账单管理 | `src/pages/billing/` |

> 新增模块参考时：补一份 `<module>.md`（三段式齐全 + 头部基线标注），更新本清单，并确保入场必读（根 `CLAUDE.md` UI 前置 + `docs/COLLABORATION.md`）已挂钩指向本目录。
