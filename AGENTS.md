# AGENTS.md — 本项目非-Claude Agent（codex/gpt/gemini…）冷启动协议

> Claude Code 读 `CLAUDE.md`；其它 CLI（codex/gpt/gemini/opencode…）读本文件。
> 两者指向**同一真源**，不重复内容——本文件只是入口指针。

## ⚠️ 动手前强制三步（不可跳过）

```bash
cs brief                 # 1. 项目信息 + 可用命令 + 进行中任务（冷启动快照）
cs flow <task-type>      # 2. 任务类型 → 该读哪些规则（frontend/bugfix/deploy/board…）
cs rule <规则名>          # 3. 读具体规范（frontend_design_standard / commit_convention / …）
```
**cs 是脑与规则的唯一入口**：查知识 `cs search`、决策前 `cs think --for "<决策>"`、记踩坑 `cs retro`。不猜路径、不记结构。

## 本项目真源

- **项目约定**：本仓 `CLAUDE.md`（环境/API/概念/导航/部署）+ `DESIGN.md`（UI 铁律）。
- **UI 改动**：先 `cs flow frontend` + `cs rule frontend_design_standard`；提交前 `scripts/ui-guard.sh` 门禁 + 浏览器验证。
- **接口真源**：Swagger `https://modelgo-web-api.test.modelgo.com/swagger/doc.json`；PRD 原型 `modelgo_prd/src/App.tsx`。

## 🔒 多 agent 协同（防重复改/返工/打架）——必守

同一仓可能有多个 agent（不同 CLI/session）在跑。动看板任何单前：

```bash
S=~/.claude/skills/gitlab-board/agent-claim.mjs
node $S status                  # 开工先看别人在改哪个单（进行中 + 认领信息）
node $S claim <iid> --mode ...  # 动单前认领；被别的活 session 锁住 → 别碰，换一个
node $S release <iid> --to ...  # 收工释放
```
- 认领锁只管「谁做哪个单」；**并发 agent 必须各自 git worktree 隔离，别挤同一个工作树**（否则 git/build 层照样打架）。
- 看板：qa/ai-quality-platform(project 1，我的工单) + shared/modelgo_prd(project 46，PM 派单)。

## 决策与交付纪律（详见 cs rule / CLAUDE.md）

- 决策前先 `cs think --for`；能自决就自决（真源+规则能推出动作即做），只在外发·不可逆要确认、或真无依据时问。
- 「交付」= 接口在 test 可打通，不是代码写完；前端对后端有要求必须落 API 单。
- 提单/需求用 SCQA（背景-冲突-问题-方案）讲清「为啥改/怎么改/改成啥」。
- 提交规范走 `cs rule commit_convention`（中文 + Conventional + MECE）。
