# 多 Agent 协同 SOP — Claude Code + Codex 并发开发

> 适用：Claude Code / Codex CLI 在本项目并发改代码。
> 原则：代码隔离 > 任务互斥 > 知识统一。三层缺一不可。

## 1. 代码隔离：worktree（物理层，最先做）

### 为什么必须隔离

共用主工作树会导致：
- **互踩 stash**：A agent `git stash` → B agent `git stash pop` 拿到的不是自己的
- **撕裂 node_modules**：pnpm 的 `runDepsStatusCheck` 发现 lockfile 和 node_modules 不匹配 → pre-commit 门禁全挂
- **环境撕裂**：`CI=true pnpm install` 修复。**禁止 `--no-verify` 绕过**

### 操作

```bash
# 一键创建隔离 worktree + 自动装依赖
cs wt feat/my-feature-branch

# 手动方式（如果 cs wt 不可用）
git worktree add -b feat/my-branch ../wt-my-branch main
cd ../wt-my-branch && ln -s ../modelgo-console-web/node_modules .
```

### 收工

```bash
# 代码合入后清理
git worktree remove ../wt-my-branch
```

## 2. 任务互斥：看板认领锁（任务层）

### 两个看板

| 看板 | Project ID | GitLab 地址 | 用途 |
|:---|:---|:---|:---|
| QA 任务看板 | 1 | `qa/ai-quality-platform` | 开发单 / BUG 单 |
| PRD 派单 | 46 | `shared/modelgo_prd` | PM 需求单 |

### 标签流转

```
已认领 → 进行中 → 待验证 → 已完成
```

业务标签：`TASK`（需求）、`BUG`（缺陷）、`Feature`（功能）、`前端就绪`（前端完成待后端/QA）

### 操作流程

```bash
S=~/.claude/skills/gitlab-board/agent-claim.mjs

# ① 开工：看谁在做什么
node $S status

# ② 认领（发现空闲单）
node $S claim 293 --mode execute --branch feat/my-branch

# 被锁住时会拒绝：
# ❌ #293 已被认领中，别动：session=xxx branch=xxx mode=execute at=xxx

# ③ 完成 → 移到「待验证」
node $S release 293 --to 待验证

# 或移到「已完成」并关闭
node $S release 293 --to 已完成
```

### 认领锁规则

- 锁 = GitLab issue 打「进行中」标签 + 指派自己 + 结构化评论
- 锁过期时间：**1 小时**（`STALE_MS = 1h`）
- 超时未 release → 锁自动过期，其他 agent 可接管
- 「已完成」/「待验证」状态的单**禁止重新认领**（防拖回）

### 跨看板 iid 撞车

两个看板的 issue 编号可能相同，必须指定 `--project`：

```bash
node $S claim 100 --project 1   # QA 看板
node $S claim 100 --project 46  # PRD 看板
```

### 需求单的来源

| 来源 | 渠道 | 内容 |
|:---|:---|:---|
| PM 需求 | 飞书 PRD 文档（space `7636726268473543858`）| 产品需求描述 |
| PRD 原型 | `@modelgo-prd/src/App.tsx`（`cs path` 查路径）| 功能 + 交互原型代码 |
| GitLab 看板 | `shared/modelgo_prd`（project 46）| PM 派发的需求单 |
| BUG | `qa/ai-quality-platform`（project 1）| 测试/线上反馈的缺陷 |

**agent 不自行创建需求**。需求从 PRD 原型或飞书文档翻译成开发单，落到 GitLab 看板后 agent 认领执行。

### 团队指派（含 GitLab ID）

| GitLab ID | username | 角色 | 负责模块 |
|:---|:---|:---|:---|
| 8 | `webkubor` | 栖洲·前端 | 控制台全部（UI + 接口联调） |
| 4 | `xionrenjie` | 任杰·后端 | 通用 API |
| 6 | `duanlingxiao` | 凌霄·后端 | 用量/日志/总览口径 |
| — | — | 邵一鸣·后端 | 护栏/提示词检测 |
| 5 | `yujianfeng` | 于建峰 | 需求梳理 |

> 建卡指派用 `-f assignee_id=<id>`（单数），别用 `assignee_ids[]`。

**前端对后端有要求 → 必须落 API 单**。代码注释挂单号，按模块指对 owner。

### 提单格式（SCQA 结构，说人话别抽象）

```bash
H=gitlab.ops.modelgo.com

glab api -X POST "projects/1/issues" --hostname $H \
  -f title="[Console] 调用日志-空间视图缺 scope 参数" \
  -f description="$(cat <<'EOF'
## SCQA

**S 现状：** 调用日志页 `/logs` 的空间视图，负责人需要看到所管空间全员记录。

**C 问题：** `GET /api/v1/model-logs` 只有 `workspace_id`（单空间）和 `account_id`（单人）两个筛选维度，表达不了「我负责的多个空间的全部人」。

**Q 做什么：** 新增 `scope` 参数，`scope=owned` 表示当前用户负责的所有空间的记录。

**A 期望：**
- 接口：`GET /api/v1/model-logs`
- 新增参数：`scope`（string，枚举 `owned`）
- 返回：`scope=owned` 时返回 `account_id` 归属空间负责人管理的全部空间记录
- 权限：非空间负责人传 `scope=owned` → 403

## 验收标准

- [ ] `GET /api/v1/model-logs?scope=owned` 空间负责人调用返回所管空间全部记录
- [ ] 普通成员调用 `scope=owned` 返回 403
- [ ] 不传 `scope` 行为不变（向后兼容）

## 不做什么

- 不需要连带改审计导出格式（那是另一个单）
EOF
)" \
  -f labels="TASK,优先级：中,待处理" \
  -f assignee_id=6
```

**格式铁律**：
- SCQA 四段必须完整，结论先行（A 先说期望再给接口细节）
- 每条要求 = **一个接口** + **具体字段名** + **期望返回值和状态码**
- 多个接口 → 分别列 SCQA，互不重叠（MECE）
- 验收标准写成 `- [ ]` checkbox，每条能独立验证
- 别引用文件路径/行号（工单可能躺几天，代码位置会变）

### 评论格式（转单/待澄清/闭环）—— SCQA 结构

**转后端时，每条要求必须落到具体接口+字段+期望值。**

```bash
glab api -X POST "projects/1/issues/{iid}/notes" --hostname gitlab.ops.modelgo.com \
  -f body="$(cat <<'EOF'
## SCQA

**S 现状：** 调用日志页 `/logs` 的空间视图，负责人需要看到所管空间全员记录。

**C 问题：** `GET /api/v1/model-logs` 只有 `workspace_id`（单空间）和 `account_id`（单人）两个筛选维度，表达不了「我负责的多个空间的全部人」。

**Q 做什么：** 新增 `scope` 参数，`scope=owned` 表示当前用户负责的所有空间的记录。

**A 期望：**
- 接口：`GET /api/v1/model-logs`
- 新增参数：`scope`（string，枚举 `owned`）
- 返回：`scope=owned` 时返回 `account_id` 归属空间负责人管理的全部空间记录
- 权限：非空间负责人传 `scope=owned` → 403

## 验收标准

- [ ] `GET /api/v1/model-logs?scope=owned` 空间负责人调用返回其一览空间的全部记录
- [ ] 普通成员调用 `scope=owned` 返回 403
- [ ] 不传 `scope` 行为不变（向后兼容）

## 不做什么

- 不需要连带改审计导出格式（那是 #15）
EOF
)"

glab api -X PUT "projects/1/issues/{iid}" --hostname gitlab.ops.modelgo.com \
  -f labels="TASK,待澄清"
```

**格式铁律**：
- 每条要求 = **一个接口** + **具体字段** + **期望行为**，不混在一起
- 多个接口 → 分别列 SCQA，互不重叠（MECE）
- 对方不需要推理就能直接动手

**修复完成 → 闭环：**

```bash
glab api -X POST "projects/1/issues/{iid}/notes" --hostname gitlab.ops.modelgo.com \
  -f body="修复 commit: <sha> | 构建号: #<n> | 测试地址: https://console.test.modelgo.com"
glab api -X PUT "projects/1/issues/{iid}" --hostname gitlab.ops.modelgo.com \
  -f labels="TASK,待验证"
```

## 3. 冲突处理

### 代码冲突

| 场景 | 处理 |
|:---|:---|
| 两个 agent 同时改同一个文件 | 先认领的改，后认领的等 release 再改 |
| 看板同一个单被两个 agent 抢 | `agent-claim` 锁拒绝后到者 |
| PRD 原型 vs 现状代码 打架 | UI 方向对标现状代码，功能对标 PRD 原型 |
| 需求方新要求 vs 已定稿 PRD | 贴证据回需求方，不自行选边 |

### 真源冲突优先级

```
PRD 原型 > 飞书文档 > 现状控制台代码
```

- Swagger 说有字段但 test 没返回 → 以 test 实测为准，带 curl 证据开单
- 看板标签说「待验证」但接口打不通 → 带请求/响应证据退回后端

## 4. 交付标准

- 「交付」= 接口在 test 可打通，不是代码写完
- 前端对后端有要求 → **必须落 API 单**，代码注释挂单号
- 开关单**只认真源实测，不认看板标签**

## 5. UI 测试账户管理

### 获取测试账号

```bash
# 所有测试/生产账户（JSON 数组）
cs secrets get secret://modelgo/accounts

# 只看关键字段
cs secrets get secret://modelgo/accounts | python3 -c "import sys,json;[print(a['env'],a['email'],a['password']) for a in json.load(sys.stdin)]"
```

字段：`env`(test/prod) · `email` · `password` · `role` · `note`

### Dev 环境一键登录

本地 `pnpm dev` 后，浏览器控制台执行：

```js
await window.__mg_login('email@test.com', 'Password01')
// 返回 { ok: true, email, tenantId } 或 { ok: false, error }
```

实现位于 `src/lib/dev-auth.ts`，仅 DEV 模式挂载，生产构建 tree-shake。

### Agent 自动化测试

```js
// Playwright / CDP evaluate
await page.evaluate(() => window.__mg_login('test@example.com', 'password'))

// 导航工具（dev 环境可用）
await page.evaluate(() => window.__mg_nav.to('api-keys'))
await page.evaluate(() => window.__mg_nav.menus())  // 列出所有菜单
```

实现位于 `src/lib/dev-agent-tools.ts`，暴露 `window.__mg_nav`。

## 6. 实战雷区（动手前必读）

1. **PWA 缓存**：部署后浏览器可能显示旧版 → 验部署前先注销 ServiceWorker + 清缓存，核对页脚 commit hash
2. **Jenkins 双发布线**：国内 `prod/modelgo-console-web` + 国外 `prod-global/`，两条都要触发
3. **React Query key 碰撞**：同一 queryKey 在不同页面存不同形状会崩溃 → 新查询前 grep 该 key 的既有消费方
4. **测试 mock 竞态**：`useTenantRole→listTenants` 若没 mock 会发真请求 → 40101 → `clearAuth()` 异步洗掉下个用例的 store → 单跑过连跑挂

## 7. 快速参考卡

```bash
# 冷启动三板斧
cat PROJECT-BRIEF.md              # 项目快照
S=~/.claude/skills/gitlab-board/agent-claim.mjs
node $S status                       # 看谁在做什么

# 领任务 → 隔离 → 干活
node $S claim <iid>                  # 认领
cs wt feat/<分支名>                   # 创建隔离 worktree
# ... 写代码 ...

# 提交前
cs check test                        # 类型 + lint + 构建
cs search <关键词>                    # 查项目文档和规则

# 收工
node $S release <iid> --to 待验证    # 释放锁
```

## 8. 真源阅读指南

### 模块 UI 参考（改业务模块前先读）

改 API Keys / 安全护栏等业务模块前，先读 `docs/ui-reference/<module>.md`（现有 `api-keys.md`、`guardrails.md`）——已提炼好该模块的 **UI 框架 + 字段文案（照 PRD 原型常量）+ 不同身份（owner/admin/space owner/member）显示差异**，省掉每次全量扫代码。

⚠️ **衍生文档、非真源**：冲突时以 PRD 原型 + 现状代码为准；PRD 改版后按 `docs/ui-reference/README.md` 重跑同步。新增模块参考放同一目录并更新其清单 + 本节。

### PRD 飞书文档

**必须用 `--profile feishu-company`（企业版账户）**——其他账户没有该文档空间的访问权限。

```bash
# 三个账户，只有 feishu-company 能读 ModelGo PRD：
#   default         → 飞书个人（王恩博）
#   feishu-company  → 飞书企业（王恩博）← ModelGo PRD 在这
#   lark-company    → Lark 海外（webkubor）

# PRD 文档树（space 7636726268473543858），各页 node token：
#   企业&空间管理: NDEBwSPQzifUdhkDgDwcIy3CnXe
#   左侧导航&总览:  JssswUWbOiNOpDkm9rLciE0qnSf
#   角色权限:       DGpFwOZEciHpZ1km5JmcHhkinfe
#   用量统计:       ZTrYwm0x0iC882kMopwccQKbnXb
#   调用日志:       YQSrw9MplixXNJkFflWcRyrhnnf
#   安全护栏:       UFBxwgdYmiHVhLk2SZtc5kJVnBh / Ieplwa8Y7idSjyk1WSiclByRnN9
#   API Keys:       VxSCwa6QMiPMYGkeyrUcaYXQnRc

# 读取正文
lark-cli --profile feishu-company api GET \
  "/open-apis/docx/v1/documents/<node_token>/raw_content"

# 如果 node token 失效，重新列出子节点
lark-cli --profile feishu-company api GET \
  "/open-apis/wiki/v2/spaces/7636726268473543858/nodes" \
  --params '{"parent_node_token":"<父node>"}'
```

### Swagger 接口

```bash
# 拉最新 Swagger JSON
curl -s https://modelgo-web-api.test.modelgo.com/swagger/doc.json | jq '.paths | keys'

# 检查单个接口
curl -s https://modelgo-web-api.test.modelgo.com/swagger/doc.json | jq '.paths["/api/v1/model-logs"]'

# 契约自检（与本地生成代码对比）
pnpm check:api-contract
```

### out-of-scope 知识库

`~/.claude/skills/gitlab-board/out-of-scope/` 存放被否决需求的决策记录。处理需求方看板新 issue 时，**先扫一遍这个目录**，按概念相似匹配（不是关键词匹配），避免同一个需求换个说法又被重新论证一遍。

### PRD 版本约束

**当前目标：PRD V1.0.3**。飞书 PRD 文档已更新到 V1.0.4，但本项目只实现 1.0.3 范围内的功能。

**铁律**：
- 认领需求前先确认该功能属于 1.0.3 还是 1.0.4
- 1.0.4 独占功能 → 不实现、不开单、不自行扩展
- 不确定归属 → 读对应飞书 PRD 页面的版本标注，或在 issue 里问

**开工时记录 PRD 版本**：
- 认领需求单时，记下 PRD 原型当前 commit：`git -C $(cs path | grep modelgo-prd | awk '{print $NF}') log --oneline -1`
- 在 GitLab issue 评论里标注「基于 PRD V1.0.3，commit: <hash>」
- 如果 PRD 更新了已有功能 → 开新需求单，不静默覆盖

## 9. 验证闭环

### 代码层

```bash
cs check test              # 类型 + lint + 构建
scripts/ui-guard.sh        # UI 门禁（圆角/颜色/组件违规拦截）
```

### 浏览器验证

```bash
# 加载 browser-verify skill，走完整验收流程：
# ① 登录（window.__mg_login）
# ② 按验收标准逐条浏览器实测
# ③ 截图存证
# ④ 输出验收报告
```

### 部署后再验

```bash
# 1. 触发部署
cs flow deploy

# 2. 确认构建成功（核对 checkout commit == 你的修复 commit）
cs secrets run --env JENKINS_TOKEN=secret://jenkins/modelgo -- \
  curl -fsS "https://jenkins.ops.modelgo.com/job/test/job/modelgo-console-web/<buildNo>/api/json"

# 3. 打开测试环境浏览器验证（⚠️ 先清 PWA 缓存）
# 4. 页脚核对 commit hash
```

## 10. 收工清理

```bash
# ① 确认代码已合入 main
git checkout main && git pull

# ② 清理 worktree
git worktree list                # 查看所有 worktree
git worktree remove <path>       # 逐一清理

# ③ 删除本地分支（可选）
git branch -d feat/<分支名>

# ④ 确认认领锁已释放
node $S status | grep <iid>      # 确认不在「进行中」
```
