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

**两个看板完成流程有区别：**

| 看板 | 完成流程 | 说明 |
|:---|:---|:---|
| QA 任务看板 | Open → 已认领 → 进行中 → 待验证 → 已完成 → Closed | BUG 必须带目标环境回归证据才可进入待验证；验收通过后再完成/关闭 |
| PRD 派单 | 进行中 → 待验证 → 已完成 | PM需求单，必须先待验证，PM验收后才能标记已完成 |

业务标签：`TASK`（需求）、`BUG`（缺陷）、`Feature`（功能）、`前端就绪`（前端完成待后端/QA）

### 操作流程

```bash
REPO=gitlab.ops.modelgo.com/qa/ai-quality-platform

# ① 开工：先看状态与负责人，已在进行中的单不并行接手
glab issue view 293 -R "$REPO" -c

# ② 认领并进入执行；一个单同一时间只能有一个状态标签
glab issue update 293 -R "$REPO" -l 已认领
glab issue update 293 -R "$REPO" -l 进行中 -u 已认领

# ③ 只有目标环境回归证据齐全，才能进入待验证
glab issue note 293 -R "$REPO" -m "<回归结论 + 截图 + 脱敏接口数据>"
glab issue update 293 -R "$REPO" -l 待验证 -u 进行中

# ④ QA 确认后完成并关闭
glab issue update 293 -R "$REPO" -l 已完成 -u 待验证
glab issue close 293 -R "$REPO"
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

### 后端/API 单子边界（硬性 · 前端 agent 不代管，2026-07-28）

治「agent 自作主张替用户分单/转派后端单」——出过真实事故：2026-07-24 某 session 以 `webkubor` 身份把一张纯后端问题单（qa/ai-quality-platform#519，observer SelectDB 查询延迟，后端 duanlingxiao 建的）**从 webkubor 转派给了后端负责人**，还以 webkubor 名义发了路由评论，用户本人从未过目这个决策，事后困惑「这单不是我前端的，你为啥去动」。

**铁律**：issue 明显不属于前端职责（纯后端 API / 性能 / 基础设施 / 数据库问题），且当前指派状态不是「前端 agent 自己卡住需要接力」而是别人建的/别人负责的单——**一律不碰**：

- 不改 `assignee_id`/`assignee_ids`
- 不以用户身份发评论做路由/转派决策
- 只在会话里告知用户「看到一张不属于前端范围的单，需要处理吗」，等用户明确指示再动

**唯一例外**：仍保留本文件已有的「看板认领锁」和 `~/.claude/CLAUDE.md` 的「看板任务接力」机制——前端 agent 自己因额度/工具/认证/能力卡在**自己名下**的单时，用 `patrol/enqueue.sh` 求助（这是求助，不是主动帮别人分单）。

### 缺陷处理决策流程（triage：判断先于操作，别一上来就改代码）

治「凭印象推、跳过取证、乱判归属」——处理任一需求方 bug/需求，**先按序决策再动手**：

1. **点透镜定方向**：`cs think --for "<这个决策>"` 先点第一性原理透镜（cs 是脑的真源，别自造框架）。判断先于操作——尤其"归前端还是后端""怎么改最小正确"这类分叉，不点透镜就下手＝返工。
2. **日志取证，别手搓**：装了 `vite-plugin-agent-eyes` 的项目，**所有接口数据都落 `log/`**（`api-calls.log` 全量请求+响应体、`errors.log`、`proxy.log`）——这是接口真源。排查先读日志，别凭页面表象或记忆猜。需要跑角色态用 `console-automation`（ego-lite 注入登录态）复现，产生的接口数据同样进 `log/`。
3. **按 ssot 判归属**：定位到「事实的单一真源」在哪，归属就在哪——
   - UI 显隐/gate 用错码、聚合当细粒度 → **前端**
   - 权限码没同步到后端 → 跑 `pnpm sync:permissions:check`/`--dry-run`（catalog SSOT）
   - 角色矩阵没授码、权限没按"所看空间"解析 → **后端契约**（RBAC/`/auth/session`）
   - ⚠️ 别停在第一层表象：#255「空间负责人少 tab」表面像前端 gate，实为 `/auth/session` 只按租户默认空间解析权限（后端契约缺口）——透镜（ssot）一点就现形。
4. **带证据 SCQA 转对人**（见下「生产验收 → QA → 回归 Loop」），指对模块 owner（团队指派表）。
5. **闭环回单**：修复→目标环境部署→带 commit、构建号、截图与接口结果回评→挪「待验证」。

### 生产验收 → QA → 回归 Loop（唯一执行路径）

线上或测试环境发现问题时，不允许只在对话里报结论、只写 retro，或先改代码后补单。必须按下面顺序闭环：

```text
目标环境验收
  → 结构化取证（截图 + 请求/响应）
  → 按 SSOT 判定前端 / API / 混合归属
  → 查重并创建 QA BUG（Open）
  → 修复单关联 BUG、提交与部署
  → 同一环境按原步骤回归
  → 证据回评（待验证）
  → QA 通过后已完成 / Closed
```

#### 1. 先给验收结论，再给证据

每次验收回复固定使用下面格式；没有截图、接口数据或目标环境，不能写“已验证”。

````md
## 验收结论

**状态：** 通过 / 失败 / 阻塞
**环境：** <test / production URL>
**范围：** <页面 + 用户操作 + 角色/模型/工作空间>
**QA 单：** <链接；未建则写“正在按下方证据创建”>

## 证据

### 界面
![成功态或失败态截图](<GitLab 上传后生成的 URL>)

### 接口
`<METHOD> <PATH>` → HTTP `<status>`，业务 `code=<code>`

```json
{
  "只保留定位所需字段": "禁止放 token、cookie、手机号、完整密钥或整段二进制 URL"
}
```

## 下一步

<建单 / 修复 / 等待依赖 / 回归；必须有明确责任边界>
````

截图必须取“用户真实看到的状态”，至少一张成功基线和一张失败态；先在 GitLab issue 编辑器上传图片，再使用编辑器生成的 Markdown 链接。接口 JSON 只摘录能证明问题的字段，凭证和签名 URL 一律脱敏。

#### 2. 判定归属，避免一单混根因

| 证据 | 归属 | 动作 |
|---|---|---|
| 接口字段/状态正确，页面漏渲染、状态错误或刷新后丢失 | 前端 | 建/认领前端 BUG，QA 单写清期望 UI 与回归步骤 |
| 请求路由、HTTP 状态或业务 code/字段违反契约 | API/后端 | 建 API BUG；前端不代替后端转派 |
| 前端展示与 API 契约都异常 | 混合 | 分成互相链接的两张单；每张只写一个根因与验收标准 |

HTTP 200 不等于业务成功：必须同时记录 HTTP 状态和响应体 `code`/错误字段。前端历史恢复类问题还要证明“消息接口是否有附件字段”和“前端是否实际请求附件展示 URL”。

#### 3. QA BUG 的 SCQA 模板

先用 `glab issue list` 在 `qa/ai-quality-platform` 查重；普通 BUG 只加 `BUG` 标签，保持 Open，不要创建即标“待验证”。一张单只对应一个可验证根因。

````md
## SCQA

**S 现状：** <环境、页面、角色、已确认的正常基线。>

**C 问题：** <用户看到什么；哪个接口返回什么；截图和 JSON 分别证明什么。>

**Q 做什么：** <只写这张单要消除的根因，不把相邻问题捆进来。>

**A 期望：**
- 接口：`<METHOD> <PATH>`
- 字段：`<request/response 字段名>`
- 行为：`<页面在成功、失败、刷新后各应显示什么>`
- 状态：HTTP `<status>` 且业务 `code=<value>`

## 复现步骤

1. <可从空会话开始的确定步骤>
2. <操作>
3. <刷新、恢复、切换或重试等关键状态转换>

## 证据

### 截图
![成功基线](<url>)
![失败态](<url>)

### 请求与响应（已脱敏）
```json
{
  "request": { "method": "<METHOD>", "path": "<PATH>" },
  "response": { "http_status": 200, "code": 0, "data": {} }
}
```

## 验收标准

- [ ] <原复现步骤在目标环境通过>
- [ ] <成功态截图与预期一致>
- [ ] <失败态有可理解反馈，不留空白 UI>
- [ ] <关键接口的 HTTP 状态、业务 code、字段符合 A>
- [ ] <刷新/历史恢复/重试等状态转换不回归>

## 不做什么

- <明确不属于该根因的相邻范围>
````

#### 4. 状态与回评固定格式

| 时机 | QA 单状态 | 必须写回的内容 |
|---|---|---|
| 发现并证据齐全 | Open | SCQA、截图、脱敏接口数据、影响范围 |
| 开始处理 | 已认领 → 进行中 | 分支/责任边界；不得把别人的后端单擅自转派 |
| 已部署到目标环境且原步骤回归通过 | 待验证 | commit、构建号、环境 URL、截图、接口结果 |
| QA 确认通过 | 已完成 → Closed | 最终验收时间和结论 |
| 复验失败 | 回到进行中 | 新证据、失败步骤、与旧证据的差异 |

回评必须用同一种格式，不能只写“已修复”：

```md
## 回归结论

**状态：** 通过 / 失败
**环境：** <URL>
**修复关联：** commit `<sha>` / 构建 `<build>`
**复现步骤：** <沿用原 BUG 的第 1–N 步>

## 证据
- 界面：<截图链接>
- 接口：`<METHOD> <PATH>` → HTTP `<status>`，`code=<code>`
- 关键字段：<字段和值，已脱敏>

## 状态动作
<移待验证 / 退回进行中；原因>
```

#### 5. GitLab 原生命令（禁止 `glab api`）

```bash
REPO=gitlab.ops.modelgo.com/qa/ai-quality-platform

# 创建 BUG：Open 泳道，只加 BUG 标签
glab issue create -R "$REPO" \
  -t "[生产][模块] 问题摘要" \
  -l BUG \
  -d "<按上方 SCQA 模板填写的 Markdown>"

# 回评与状态推进
glab issue note <iid> -R "$REPO" -m "<按上方回归结论模板填写>"
glab issue update <iid> -R "$REPO" -l 待验证 -u 进行中
glab issue update <iid> -R "$REPO" -l 已完成 -u 待验证
glab issue close <iid> -R "$REPO"
```

## 3. 冲突处理

### 代码冲突

| 场景 | 处理 |
|:---|:---|
| 两个 agent 同时改同一个文件 | 先认领的改，后认领的等 release 再改 |
| 看板同一个单被两个 agent 抢 | 以 issue 的 assignee、状态标签和最新评论为准；已在进行中的单不并行接手 |
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

### 部署流程

| 场景 | 开发分支 | 部署来源分支 | 流程 |
|:---|:---|:---|:---|
| 日常开发 | worktree（`fix/`·`feat/`） | test | worktree 里开发 → 合并进 test → test 分支部署测试环境 |
| 测试通过上线 | — | main | 合并 test → main → 部署线上 |
| 线上 hotfix | main | main | main 分支修复 → 部署线上 → 同步到 test |

> ⚠️ **`test` 是集成/部署来源分支，不是开发地**。别 `git checkout test` 直接在上面写代码——多个 session 共用同一工作树 + 同分支会互相踩（未提交改动串台、被迫 autostash rebase）。开发一律在隔离 worktree（见第 1 节），`test` 只接受**合并**。这与顶部「代码隔离 > 任务互斥」原则一致。

**日常开发流程：**
1. 开隔离 worktree + 分支：`cs wt fix/<名>`（或 `git worktree add -b fix/<名> ../wt-<名> origin/test`）
2. 在 worktree 里开发、提交（与其他 session 物理隔离，互不看见对方未提交改动）
3. 合并进 test：`git checkout test && git pull && git merge fix/<名> && git push origin test`
4. 触发测试环境部署：`test/modelgo-console-web`
5. **合并确认成功后立刻清理，别拖到「合并上线」才做**（治「分支只增不减，几十个 worktree 残留没人清」——2026-07-28 一次清理攒了 60+ 个已合并分支）：
   - 删 worktree：`git worktree remove ../wt-<名>`（worktree 还占着分支，删分支前必须先删它，否则 git 会拒绝）
   - 删本地分支：`git branch -d <名>`
   - 删远端分支：`git push origin --delete <名>`
   - 这三步是「合并进 test 就做」的日常收尾，不是「合并进 main 才做」的发布收尾——功能分支的生命周期到「进了 test」就结束了，没有理由在合并 main 前一直留着

**线上发布流程：**
1. 测试验证通过
2. 合并到 main：`git checkout main && git merge test && git push origin main`
3. 触发线上部署：`prod/modelgo-console-web`

**线上 hotfix 流程：**
1. 在 main 分支修复问题
2. 提交并推送 main
3. 触发线上部署（`prod/modelgo-console-web`）
4. 同步到 test 分支：`git checkout test && git merge main && git push origin test`
5. 触发测试环境部署（`test/modelgo-console-web`）

**分支清理：** 见上面「日常开发流程」步骤 5——分支合并进 test 就应清理，不用等到合并上线。

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

### UI 自动化测试

**工具：** ego-lite（Chromium 浏览器，AI Agent 友好）

**账户配置：** 本地 `.env.local` 存储测试账户（不提交到 git）

```bash
# 获取测试账户
cs secrets get secret://modelgo/accounts
```

**账户格式：**
```json
[
  {
    "env": "test",
    "email": "owner@test.com",
    "password": "xxx",
    "role": "owner",
    "note": "租户管理员"
  },
  {
    "env": "test",
    "email": "member@test.com",
    "password": "xxx",
    "role": "member",
    "note": "普通成员"
  }
]
```

**自动化流程：**
1. **先用 ego-lite 验本地端口**（默认 `http://localhost:5175`）：注入测试登录态或调用 `window.__mg_login`，按验收标准逐条执行并保留接口/DOM 证据。
2. 本地通过后，合并到 `test`、触发测试环境部署，并核对 Jenkins checkout commit 与修复 commit 一致。
3. **仍用 ego-lite 验测试站**：同一条验收路径必须在 `https://console.test.modelgo.com` 重跑；本地热更新通过不等于交付。
4. 只有测试站通过才可把 GitLab QA 单移为「待验证」；评论必须包含 SCQA、接口数据和截图/可视化证据。
5. 生产环境只在 `main` 发布后验证对应提交；未发布不得声称「测试和生产一致」。禁止把测试账号 cookie 注入生产。

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
5. **「照 PRD 还原页面」类任务，别边问边改**（2026-07-27 账单管理页教训）：这类任务真正的耗时不是代码量，是"先问答式排查、改完才发现漏了"来回绕。正确顺序是下面 §6.1 的一次性流程，不是每发现一处就单独走一轮问答-改码-验证。

### 6.1 「PRD 还原」标准流程（一次做完，不要分批问答）

1. **原型跑起来 + 通读全文本，不是逐项提问排查**：`pnpm --dir <prd仓库路径> dev` 启动原型，`get_page_text` 拿页面全部可见文字（弹窗也要点开逐个拿），和现状代码的同一页面全文本**并排比对**，一次性列出所有差异——包括标题、副标题、hint 文案这类容易被"只查功能字段、不查装饰文案"漏掉的点。逐条回答"这个功能对不对"永远会漏，通读全文本对比才不会漏。
2. **每条差异当场判三类，不是默认全改**：
   - PRD 明确要求且现状违反 → 改
   - 现状比 PRD 新/精细（大概率是 PRD 之后的真实需求演进）→ **不改**，`git log -S` 挖一下改动是哪个 commit/单号引入的，记录依据
   - 现状比 PRD 多、但背后接的是**真实后端能力/平台配置**（不是纯装饰性 UI）→ **不改**，判断方法不是查 git log 找演进依据，是查这段渲染逻辑是不是读 config/API 动态生成的（例如支付渠道列表来自 `useEnabledChannels()` 而非硬编码数组）——砍掉等于删掉一个已经接线的真实功能，和"删旧 UI 摆设"完全是两件事，别混为一谈自己拍板砍
   - PRD 没写、真源也没答案的产品范围问题（如"海外要不要有这个功能"）→ 问需求方，不要自己拍板，也不要用"PRD没提所以…"自己找补理由
3. **一次性把改的和不改的都列成清单**（结构：改动/位置/动作/依据），再动手，不要列一半就开始改一半。
4. **一口气把清单里"要改"的项全部写完，再统一跑一次 typecheck/lint/test + 浏览器验证**，不要改一项就验证部署一项——部署/构建这类有外部依赖的步骤本身就慢且可能失败（Jenkins 认证、node 版本等），拆成多次只会把这些摩擦成本乘倍。
5. **"完成"只有在推送到远端分支 + CI 构建成功 + commit hash 对上号之后才能说**，本地 worktree 或本地 dev server 验证过 ≠ 完成，只是"改对了但还没交付"，两者要在汇报里分清楚，不要用"完成"覆盖"改对了"。

## 7. 快速参考卡

```bash
# 冷启动三板斧
cat PROJECT-BRIEF.md                 # 项目快照
glab issue list -R gitlab.ops.modelgo.com/qa/ai-quality-platform
cs wt feature/<分支名>               # 创建隔离 worktree

# 认领 → 隔离 → 干活
glab issue update <iid> -R gitlab.ops.modelgo.com/qa/ai-quality-platform -l 已认领
glab issue update <iid> -R gitlab.ops.modelgo.com/qa/ai-quality-platform -l 进行中 -u 已认领
# ... 写代码 ...

# 提交前
cs check test                        # 类型 + lint + 构建
cs search <关键词>                    # 查项目文档和规则

# 收工：只有目标环境回归证据齐全才可移待验证
glab issue note <iid> -R gitlab.ops.modelgo.com/qa/ai-quality-platform -m "<回归结论 + 截图 + 接口证据>"
glab issue update <iid> -R gitlab.ops.modelgo.com/qa/ai-quality-platform -l 待验证 -u 进行中
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

**当前目标版本以当前 GitLab QA 单和对应 PRD 页面为准**。协同 SOP 不固化“只实现某个历史版本”的结论；开始实现前必须重新核验当前需求属于哪个版本范围。

**铁律**：
- 认领需求前先确认该功能属于当前验收版本及其边界
- 不在当前版本范围的功能 → 不实现、不开单、不自行扩展
- 不确定归属 → 读对应飞书 PRD 页面的版本标注，或在 issue 里问

**开工时记录 PRD 版本**：
- 认领需求单时，记下 PRD 原型当前 commit：`git -C $(cs path | grep modelgo-prd | awk '{print $NF}') log --oneline -1`
- 在 GitLab issue 评论里标注「基于 PRD <版本>，commit: <hash>」
- 如果 PRD 更新了已有功能 → 开新需求单，不静默覆盖

## 9. 验证闭环

### 代码层

```bash
cs check test              # 类型 + lint + 构建
scripts/ui-guard.sh        # UI 门禁（圆角/颜色/组件违规拦截）
```

### 浏览器验证

```bash
# 优先使用 ego-lite；本地端口优先于测试站，测试站优先于生产。
# ① http://localhost:5175：登录并按验收标准逐条实测，保留接口和 DOM 证据
# ② 合并 test + Jenkins 成功后：https://console.test.modelgo.com 重跑同一组用例
# ③ 用 EgoLite 截图或记录可视媒体/控件的实际加载状态
# ④ 仅 main 已发布时，再到生产核对同一 commit；否则明确标注“生产未验证”
```

### 部署后再验

```bash
# 1. 触发部署
cs flow deploy

# 2. 确认构建成功（核对 checkout commit == 你的修复 commit）
cs secrets run --env JENKINS_TOKEN=secret://jenkins/modelgo -- \
  curl -fsS "https://jenkins.ops.modelgo.com/job/test/job/modelgo-console-web/<buildNo>/api/json"

# 3. 先在 http://localhost:5175 用 ego-lite 完成本地验证
# 4. 再打开测试环境并用 ego-lite 重跑（⚠️ 先清 PWA 缓存）
# 5. 生产验证只允许在 main 发布后进行，并核对其部署 commit
```

## 10. 收工清理

这是**会话结束前的自查清单**，不是另一套独立的清理规则——真正「什么时候删分支」的判断标准只有一个，见 §4「日常开发流程」步骤 5（**合并进 test 就删，不等 main**）。这里只是收工前照着 `git worktree list` 过一遍，确认每个自己开过的 worktree 都已经按 §4 走完三步（删 worktree → 删本地分支 → 删远端分支），别漏。

```bash
# ① 看自己这次开了哪些 worktree，逐一确认是否已按 §4 清理
git worktree list

# ② 还没清理的，按 §4 补做（不是可选项）：
git worktree remove <path>
git branch -d <分支名>
git push origin --delete <分支名>

# ③ 确认认领锁已释放
node $S status | grep <iid>      # 确认不在「进行中」
```
