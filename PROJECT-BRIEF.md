# ModelGo 控制台 — Agent 冷启动快照

> 本文件是 agent 进入本项目的**唯一第一入口**，替代 `cs brief` 的噪音输出。
> `cs brief` 显示的是全局 CortexOS 状态（包含个人 agent 舰队任务），与本项目无关。
> 本文件只保留公司项目相关内容。

## 1. 分层注入顺序（动手前必读）

```
① 本文件（project-brief.md）  ← 项目上下文 + 有效命令
② cs rule agent_governance    ← 全局行为准则（core principles + UI 铁律 + 非破坏性变更红线）
③ cs rule coding_conventions  ← 编码约定
④ cs rule engineering_baseline ← 工程基线（含 worktree 隔离 §4.1）
⑤ 本仓 CLAUDE.md              ← 交付铁律 + 自决门槛 + UI 真源优先级
⑥ 本仓 DESIGN.md              ← UI 具体约束（颜色/圆角/组件/token 包/图标库/Agent UI Pre-flight）
⑦ Swagger                     ← 接口真源（禁止自行推测 API）
⑧ gitlab-board SKILL          ← 看板操作（认领/移动/创建 issue）
```

**禁止跳过**：步骤⑤（CLAUDE.md）包含「交付=接口在 test 可打通」「开关单不认标签」等铁律，这些不在 cs rule 里，必须读。

## 2. 有效 cs 命令（只有这 8 个）

| 命令 | 用途 | 何时用 |
|:---|:---|:---|
| `cs brief` | 快速看进行中任务（仅参考） | 想扫一眼全局时 |
| `cs flow <type>` | 任务路由 → 该读哪些规则 | 不确定该走哪个流程时 |
| `cs rule <规则>` | 读具体规范 | 需要查编码/工程/安全规则时 |
| `cs check test` | 类型 + lint + 构建三项检查 | 提交前必跑 |
| `cs wt <branch>` | 一键开隔离 worktree + 装依赖 | **任何代码改动前默认开**，不等确认有并发才开（本仓常年有巡检/其他 session 并发，等发现冲突就晚了） |
| `cs dev` | 启动 dev server + 日志 | 本地调试 |
| `cs secrets get` | 取 modelgo 测试账号 | 需要登录测试环境时 |
| `cs retro` | 记录踩坑 | 发现新坑时 |

**其他 43 个 cs 命令与本项目无关**（board/hermes/nanzhu/image/wechat 等是个人生活侧工具）。

## 3. 项目真源（冲突时按此顺序）

| 优先级 | 真源 | 内容 |
|:---|:---|:---|
| 1 | PRD 原型 `modelgo_prd/src/App.tsx` | 功能 + 交互（命名以原型为准：租户/工作空间，非组织/项目）。**版本范围见 `CLAUDE.md` 入场第 3 条** |
| 2 | 飞书 PRD 文档 | 需求描述。**版本范围见 `CLAUDE.md` 入场第 3 条** |
| 3 | `DESIGN.md` + 现控制台代码 | 视觉 token、组件、图标库、布局/排版用法（UI 方向对标现状代码，不对标原型视觉） |
| 4 | Swagger | 接口契约（是否有 API，以此为准，禁止推测） |

**「1:1 还原 PRD」的边界**：布局 / 业务场景 / 字段 / 信息层级 → PRD 原型；具体视觉数值与组件形态 → 控制台 `DESIGN.md` + token + `ui/*`。逐维度的定义与两个实例见 `CLAUDE.md` 入场第 4 条的表（2026-09-03 owner 澄清，别再临场判断）。

**真源冲突判例**：
- Swagger 说有字段但 test 没返回 → 以 test 实测为准，带 curl 证据开单钉后端
- 原型视觉 vs 现状代�� → UI 方向对标现状代码，原型只负责功能交互
- 需求方新要求 vs 已定稿 PRD → 贴证据回需求方，不自行选边

## 4. 看板体系

| 看板 | 地址 | 用途 |
|:---|:---|:---|
| QA 任务看板 | `qa/ai-quality-platform` (project 1) | 开发/BUG 单 |
| PRD 派单 | `shared/modelgo_prd` (project 46) | PM 需求单 |

**看板操作**：加载 `gitlab-board` skill，使用 `glab issue` 原生命令；生产验收失败必须走 `docs/COLLABORATION.md` 的「生产验收 → QA → 回归 Loop」，附 SCQA、脱敏接口证据与截图。

## 5. 多 Agent 协同 → `docs/COLLABORATION.md`

**别在主检出当前分支上直接写代码/提交** —— 先切新分支（`fix/<iid>-<简述>` 等，从当班版本分支切）。
**worktree 用不用，判据只有一条：要不要同时在两个分支上干活**；串行做单 `git switch` 就够，
**只有主检出停在别人的分支上、或有别人未提交的改动时才开 `cs wt`**（判据与理由见 `CLAUDE.md` 入场第 4 条，
2026-09-18 owner 已推翻此前的「默认开」）。并发开发的完整 SOP（认领锁 / 冲突处理 / 实战雷区），详见 `docs/COLLABORATION.md`。

## 6. PRD 基线维护（机制）

**版本号不写在这里** —— 当期版本、阶段与发版日的定义处是 `CLAUDE.md` 入场第 3 条；
飞书「PRD by Release」的对应版本节点下挂该版全部 PRD。本文件只留下面这条机制，不复述版本。

**基线一改，两处一起改**：`CLAUDE.md` 入场第 3 条的版本阶段表 + `src/main.tsx` 的 `PRD_VERSION`
（埋点按它归因，**滞后会把新版本的数据算到老版本头上**；2026-09-03 发现它停在 v1.0.3，
2026-09-22 又发现 `release/v1.0.7` 上仍是 `v1.0.6` —— 同一个坑踩了两次）。

此前这里写「只做 V1.0.3」已过时——它曾导致按 1.0.3 口径保留了 PRD 1.0.4 §8.4 已废除的「奖励余额转入主余额」功能。范围有疑问先查飞书 PRD by Release 对应版本节点，别照本文件的历史结论。如有疑问见 `docs/frontend-backlog.md`。

## 7. 交付标准

- 「交付」= 接口在 test 可打通，不是代码写完
- 前端对后端有要求 → 必须落 API 单，代码注释挂单号
- 开关单只认真源实测，不认看板标签

## 8. 项目注册

```
cs path → 4 个项目已注册
  @modelgo-console-web → 本仓库
  @modelgo-prd         → PRD 原型
  @modelgo-controller  → 后端
  @social-hub          → 个人项目（忽略）
```
