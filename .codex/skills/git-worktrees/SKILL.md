---
name: git-worktrees
description: 涉及任何代码变动（新功能、修复 bug、重构、实验性改动）时自动触发，默认在隔离的 git worktree 中开发——bug 修复用 fix/ 开头、新功能用 feature/ 开头；开发完成后询问用户合并到 test 还是 main 分支，合并后自动清理 worktree。也可通过 /git-worktrees 命令手动调用。
---

# Git Worktrees 隔离工作区

## 概述

在开始任何代码变动之前，确保工作在一个隔离的 git worktree 中，避免污染当前分支。

**默认行为：** 每当任务涉及任何代码变动（新功能、bug 修复、重构、实验性改动）时，**默认创建隔离 worktree**，无需询问用户是否使用。

**分支命名规则：**

- **bug 修复** → `fix/<简短描述>`（例如：`fix/login-crash`）
- **新功能** → `feature/<简短描述>`（例如：`feature/add-login`）
- 无法判断时，简要询问用户这是修复还是新功能，再据此命名。

**核心原则：** 先检测现有隔离状态，再创建，不重复创建。

---

## Step 0：检测是否已在隔离工作区

**在做任何操作之前，先检测当前是否已处于 worktree 中。**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**Submodule 保护：** `GIT_DIR != GIT_COMMON` 在 git submodule 里也成立。先排除：

```bash
# 如果有输出，说明在 submodule 内，按普通仓库处理
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**判断结果：**

- `GIT_DIR != GIT_COMMON`（且不在 submodule）→ 已在 linked worktree 中，**直接跳到 Step 3**，不重复创建。  
  报告：`已在隔离工作区 <path>，分支：<name>`
- `GIT_DIR == GIT_COMMON`（或在 submodule）→ 在主仓库检出目录，继续 Step 1。

---

## Step 1：确定分支类型与名称（默认创建）

当检测到当前处于主仓库，且任务涉及任何代码变动时，**默认创建隔离 worktree**，不再询问"是否使用 worktree"。

**判断变更类型并命名分支：**

- 任务是修复缺陷 / 报错 / 异常行为 → `fix/<简短描述>`
- 任务是新增能力 / 新特性 → `feature/<简短描述>`
- 若从任务描述无法判断是修复还是新功能 → 简要询问用户类型后命名。

确定分支名后直接继续 Step 2。

---

## Step 2：创建隔离工作区

### 目录选择优先级

按以下顺序确定 worktree 存放位置（用户明确指定的优先级最高）：

1. **用户明确指定的路径** → 直接使用
2. **项目已存在的 worktree 目录：**
   ```bash
   ls -d .worktrees 2>/dev/null   # 首选
   ls -d worktrees  2>/dev/null   # 备选
   ```
   两者都存在时用 `.worktrees/`
3. **默认值** → 项目根目录下的 `.worktrees/`

### 安全验证（项目本地目录必须执行）

**创建前必须确认目录已被 git 忽略：**

```bash
git check-ignore -q .worktrees 2>/dev/null || echo "未被忽略"
```

**若未被忽略：** 先将目录名加入 `.gitignore` 并提交，再继续。

```bash
echo ".worktrees/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .worktrees directory"
```

### 创建 Worktree

```bash
# BRANCH_NAME 形如 fix/login-crash 或 feature/add-login
BRANCH_NAME="<fix|feature>/<简短描述>"
WORKTREE_PATH=".worktrees/$BRANCH_NAME"

git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"
cd "$WORKTREE_PATH"
```

**权限失败处理：** 若 `git worktree add` 因沙箱权限失败，告知用户并改为在当前目录原地工作，然后继续 Step 3。

---

## Step 3：项目环境初始化

进入 worktree 后自动检测并安装依赖：

```bash
# Node.js
[ -f package.json ]       && npm install

# Go
[ -f go.mod ]             && go mod download

# Python
[ -f requirements.txt ]   && pip install -r requirements.txt
[ -f pyproject.toml ]     && poetry install

# Rust
[ -f Cargo.toml ]         && cargo build
```

---

## Step 4：验证基线状态

运行项目测试，确保工作区从干净状态开始：

```bash
# 根据项目类型选择
npm test         # Node.js
go test ./...    # Go
pytest           # Python
cargo test       # Rust
```

**测试失败时：** 报告失败详情，询问是继续还是先排查问题。

**测试通过时：** 报告就绪状态：

```
工作区已就绪：<完整路径>
分支：<branch-name>
测试：全部通过（<N> 个测试）
可以开始实现 <功能描述>
```

---

## Step 5：开发完成后询问合并目标

**开发完成（代码改动已提交到 worktree 分支）后，主动询问用户合并目标：**

> 开发已完成，分支 `<branch-name>` 是否需要合并？合并到哪个分支？
>
> - **test** → 合并到测试分支验证
> - **main** → 合并到主分支
> - **暂不合并** → 保留 worktree，后续再处理

**用户选择：**

- **合并到 test 或 main** → 继续 Step 6 执行合并与清理。
- **暂不合并** → 保留 worktree，报告分支与路径，结束。

合并前确保 worktree 内所有改动已提交：

```bash
git -C "$WORKTREE_PATH" status --porcelain   # 应为空
```

---

## Step 6：合并并自动清理

确认合并目标分支（`test` 或 `main`）后执行：

```bash
TARGET="<test|main>"           # 用户选择的目标分支
BRANCH_NAME="<fix|feature>/..." # worktree 分支

# 1. 回到主仓库根目录
cd <项目根目录>

# 2. 更新目标分支并合并
git checkout "$TARGET"
git pull --ff-only            # 若有远端，先同步
git merge --no-ff "$BRANCH_NAME"

# 3. 推送（如有远端）
git push
```

**合并冲突处理：** 若 `git merge` 出现冲突，**停止自动清理**，报告冲突文件并请用户决定如何解决。冲突解决并提交后再继续清理。

**合并成功后自动清理 worktree 与分支：**

```bash
# 4. 删除 worktree
git worktree remove .worktrees/"$BRANCH_NAME"

# 5. 删除已合并的分支
git branch -d "$BRANCH_NAME"
```

**报告完成状态：**

```
已合并 <branch-name> → <target>
已清理 worktree：.worktrees/<branch-name>
已删除分支：<branch-name>
```

---

## 快速参考

| 场景 | 操作 |
|------|------|
| 任何代码变动 | 默认创建 worktree（不再询问是否使用） |
| 任务是 bug 修复 | 分支命名 `fix/<描述>` |
| 任务是新功能 | 分支命名 `feature/<描述>` |
| 无法判断修复/新功能 | 简要询问类型后命名 |
| 已在 linked worktree 中 | 跳过创建（Step 0 检测到） |
| 在 submodule 中 | 按普通仓库处理（Step 0 保护） |
| `.worktrees/` 已存在 | 复用（验证已被 ignore） |
| `worktrees/` 已存在 | 复用（验证已被 ignore） |
| 两者都存在 | 用 `.worktrees/` |
| 都不存在 | 默认创建 `.worktrees/` |
| 目录未被 ignore | 先加入 .gitignore 并提交 |
| 创建权限失败（沙箱） | 告知用户，在当前目录原地工作 |
| 无 package.json / go.mod 等 | 跳过依赖安装 |
| 基线测试失败 | 报告失败，询问是否继续 |
| 开发完成 | 询问合并到 test / main / 暂不合并 |
| 合并成功 | 自动清理 worktree 与分支 |
| 合并冲突 | 停止清理，报告冲突请用户处理 |

---

## Worktree 生命周期管理

### 查看所有 worktree

```bash
git worktree list
```

### 手动清理（暂不合并或被丢弃时）

```bash
# 1. 切回主分支
cd <项目根目录>

# 2. 删除 worktree
git worktree remove .worktrees/<branch-name>

# 3. 删除分支
git branch -d <branch-name>
```

### 强制删除（未合并时）

```bash
git worktree remove --force .worktrees/<branch-name>
git branch -D <branch-name>
```

---

## 常见错误

### 在已有 worktree 中再次创建

- **问题：** 嵌套创建 worktree，造成混乱
- **修复：** 始终先运行 Step 0 检测

### 跳过 ignore 验证

- **问题：** worktree 内容被意外 git 追踪，污染仓库状态
- **修复：** 创建前必须执行 `git check-ignore`

### 分支命名不符合规则

- **问题：** 修复用了 feature/、新功能用了 fix/，破坏分支约定
- **修复：** 严格按 bug 修复 → `fix/`、新功能 → `feature/` 命名

### 基线测试失败时直接继续

- **问题：** 无法区分新引入的 bug 与已存在的问题
- **修复：** 测试失败时必须报告并征得用户同意后再继续

### 合并冲突时强行清理

- **问题：** 改动丢失，无法回溯
- **修复：** 出现冲突时停止清理，交由用户处理

---

## 禁止行为

- 已处于 linked worktree 时，**禁止**再次创建
- 项目本地目录未经 ignore 验证，**禁止**直接创建
- **禁止**违反分支命名规则（修复必须 `fix/`、新功能必须 `feature/`）
- **禁止**未经用户确认就自行决定合并目标分支
- 合并出现冲突时，**禁止**静默清理或丢弃改动
- 基线测试失败时，**禁止**静默继续

## 必须执行

- 每次代码变动任务开始前先运行 Step 0 检测
- 默认创建 worktree（任何代码变动），无需询问是否使用
- 按 `fix/` / `feature/` 规则命名分支
- 项目本地目录创建前验证 .gitignore
- 自动检测并安装项目依赖
- 验证测试基线
- 开发完成后询问合并目标（test / main / 暂不合并）
- 合并成功后自动清理 worktree 与分支
