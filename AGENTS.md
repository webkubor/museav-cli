# AGENTS.md — Agent 冷启动入口（Codex / GPT / Gemini / 任意 CLI）

> **唯一入口**：`PROJECT-BRIEF.md`
> 本文件只做指针，不重复内容。详细规则统一走 PROJECT-BRIEF.md。

## 开工三步

```bash
# ① 读项目快照
cat PROJECT-BRIEF.md

# ② 读协同 SOP
cat docs/COLLABORATION.md

# ③ 涉及前端 UI / 样式 / 图标 / 组件时，必须读本地 UI 真源
cat DESIGN.md

# ④ 读全局规则（按需）
cs rule agent_governance
cs rule coding_conventions
cs rule engineering_baseline
```

## 协同

详见 `docs/COLLABORATION.md`

## 真源

- 接口 → Swagger `https://modelgo-web-api.test.modelgo.com/swagger/doc.json`
- 功能/交互 → PRD 原型 `@modelgo-prd/src/App.tsx`（`cs path` 查路径）
- UI 方向 → `DESIGN.md` + 现状控制台代码（不对标原型视觉）
- UI 依赖 → `modelgo-design-tokens`、`react-icons`、`@lobehub/icons` 的使用边界见 `DESIGN.md#Local UI Dependency Matrix`
- 命名 → PRD 原型（租户/工作空间，非组织/项目）

<!-- agent-eyes:begin -->
## 运行时视野（vite-plugin-agent-eyes 自动维护，勿手改此块）

本项目 dev 期把**真实**请求/响应、报错、控制台、交互轨迹写到 `log/`。
**排查前端/接口/登录/样式问题前先读它，不要从源码或类型定义反推。**

```bash
ls log/                        # 有哪些端口在跑
cat log/<port>/api-calls.log   # 真实请求体 + 响应体
cat log/<port>/errors.log      # 报错（聚合去重，最新在最上）
```

| 想知道 | 读哪个 |
|---|---|
| 接口返回什么字段、值是什么 | `<port>/api-calls.log` ← **字段真源，类型定义和注释都不是** |
| 哪里报错了 | `<port>/errors.log` |
| 用户点了什么才出错 | `<port>/interaction.log` |
| 登录/cookie/CORS/302 | `<port>/proxy-<host>.log` |
| 当前登录的是谁 | `<port>/auth-state.json`（脱敏画像，无 token） |
| 页面长什么样 | `<port>/snapshots/`（PNG + DOM 快照） |
| 提交被门禁拦了 | `log/guard-report.json` |

注意：大响应体在日志里会被截断，整份 JSON 解析会失败，按单个 item 的花括号配平解析。
日志每次 dev 启动清空，看到的就是本次。改完 vite 配置要重启 dev 再验。
完整说明见 `log/README.md` 与 `node_modules/vite-plugin-agent-eyes/AGENT_GUIDE.md`。
<!-- agent-eyes:end -->
