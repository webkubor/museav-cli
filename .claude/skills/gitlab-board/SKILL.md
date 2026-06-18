---
name: gitlab-board
description: Use when managing the QA task board on GitLab — query board columns, list/move issues, create issues with TestMgr metadata. The QA board is at https://gitlab.ops.modelgo.com/groups/qa/-/boards.
---


# GitLab QA Board

## ⚠️ 前置条件

- `glab` CLI 已认证 `gitlab.ops.modelgo.com`（`glab auth status --hostname gitlab.ops.modelgo.com`）
- 目标 group：`qa`（ID 8），board ID：2（"Development"）
- 所有操作通过 `glab api` 执行，不直接调 curl

## 看板结构

| GitLab Label | TestMgr 状态 | 看板列 |
|-------------|-------------|-------|
| `已认领` | todo | 第 1 列 |
| `进行中` | in_progress | 第 2 列 |
| `待验证` | blocked | 第 3 列 |
| `已完成` | done | 第 4 列 |

## 操作

### 查看看板全貌

```bash
# 获取 board 列表结构和各列 issues 数量
glab api "groups/qa/boards/2/lists" --hostname gitlab.ops.modelgo.com

# 按标签获取 issues（带详细信息）
glab api "groups/qa/issues?labels=待验证&per_page=20" --hostname gitlab.ops.modelgo.com

# 获取单个 issue 详情
glab api "projects/1/issues/43" --hostname gitlab.ops.modelgo.com
```

### 移动 issue（换列 = 换标签）

```bash
# 例如：将 issue 43 从"待验证"移到"已完成"
# 先获取当前 labels，替换标签
glab api -X PUT "projects/1/issues/43" \
  --hostname gitlab.ops.modelgo.com \
  --field "labels=已完成"

# 同时保留其他业务标签（BUG、Feature 等），只改状态标签：
# 先查当前 labels，手动构造新 labels 数组
glab api -X PUT "projects/1/issues/43" \
  --hostname gitlab.ops.modelgo.com \
  --field "labels=BUG,已完成"
```

### 创建 issue（带 TestMgr 元数据）

```bash
# 最小创建
glab api -X POST "projects/1/issues" \
  --hostname gitlab.ops.modelgo.com \
  --field "title=问题标题" \
  --field "description=详细描述" \
  --field "labels=BUG,待验证"

# 完整创建（含 TestMgr 迁移元数据）
glab api -X POST "projects/1/issues" \
  --hostname gitlab.ops.modelgo.com \
  --field "title=[冒烟测试] 具体问题" \
  --field "description=## 问题描述
...
---
### TestMgr 迁移信息
- 类型：BUG
- 优先级：high
- 严重级别：major
- 版本：V0.1" \
  --field "labels=BUG,待验证"
```

### 分配责任人

```bash
# 分配（assignee_id 单数，不是 assignee_ids[]）
glab api -X PUT "projects/1/issues/43" \
  --hostname gitlab.ops.modelgo.com \
  --field "assignee_id=8"

# 取消分配
glab api -X PUT "projects/1/issues/43" \
  --hostname gitlab.ops.modelgo.com \
  --field "assignee_id=0"
```

### 关闭 issue

```bash
glab api -X PUT "projects/1/issues/43" \
  --hostname gitlab.ops.modelgo.com \
  --field "labels=TASK,已完成" \
  --field "state_event=close"
```

### 搜索 issues

```bash
# 按关键词搜索
glab api "projects/1/issues?search=邀请页面&per_page=10" --hostname gitlab.ops.modelgo.com

# 全部 issues
glab api "groups/qa/issues?per_page=30" --hostname gitlab.ops.modelgo.com
```

## Issue 字段映射（TestMgr → GitLab）

| TestMgr 字段 | GitLab 字段 | 说明 |
|-------------|------------|------|
| type (bug/task) | labels（BUG/Feature） | 放入 labels 数组 |
| status (blocked→) | labels（待验证） | 状态标签 |
| priority | 无直接字段 | 可写入 description 元数据 |
| severity | 无直接字段 | 可写入 description 元数据 |
| version | milestone | 可选，关联里程碑 |
| assignee | assignee_ids | 责任人 |

## 项目列表

QA group 下主要项目：

| 项目 | ID | 说明 |
|------|----|------|
| ai-quality-platform | 1 | AI 质量平台（主项目，29 个 open issues） |
| online-inspection | 4 | LLM online inspection |
| modelgo-api-tests | 27 | modelgo 接口自动化测试 |

默认项目 ID = 1（ai-quality-platform）。

## 约定

1. **状态标签互斥**：每个 issue 同一时间只能有一个状态标签（`已认领`/`进行中`/`待验证`/`已完成`）。移动列时先去掉旧状态标签。
2. **保留业务标签**：修改状态时保留 BUG/Feature 等业务分类标签。
3. **description 元数据**：TestMgr 迁移过来的 issue 在 description 末尾有 `<!-- testmgr:type=... -->` HTML 注释和 `### TestMgr 迁移信息` 区块，不要删除或修改这些内容。
4. **禁止 DELETE**：不删除 GitLab issues，已完成的任务改为 `已完成` 标签后关闭（`state_event=close`）。
5. **assignee 格式**：`glab api --field 'assignee_id=8'`（单数），不要用 `assignee_ids[]`，glab 不支持该数组格式。

## 踩坑记录

| 问题 | 正确做法 |
|------|---------|
| `assignee_ids[]=8` 不生效 | 用 `assignee_id=8`（单数） |
| 中文标签 URL 参数导致 500 | 中文标签不要放 query string，改用 `--field` 或在结果中过滤 |
| `per_page=50` 截断数据 | QA group 有 60+ issues，用 `per_page=100` |
| `glab api` 响应带额外错误文本 | 管道前加 `2>/dev/null`，或直接保存到文件再解析 |
| 取消分配 | `--field 'assignee_id=0'` |
| 关闭 issue | `--field 'state_event=close'` + 更新标签为 `已完成` |
