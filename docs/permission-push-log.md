# 权限目录推送记录（catalog sync changelog）

> **重要边界**：前端 sync 推的是**权限目录（有哪些 permission ID + 菜单归属）**；
> **"哪个角色被授予哪些权限" 是后端授权矩阵（角色 seeding / 存量租户回填），前端 sync 不管**。

## 权限闭环（每次改权限走完这三步才算闭环）

1. **推送**：改 `src/config/permissions.ts` / `permission-catalog.ts` → `sync:permissions:cn` / `:global`。
2. **记录**：在下表补一条（日期 / catalog_version / 变更 / 关联单 / 推送结果）。
3. **验证真实到手权限**（闭环关键——推了 ≠ 到手）：
   - **真实接口回调（首选）**：读 agent-eyes 日志 `log/<port>/api-calls.log`，取最近 `GET auth/session` 的 `granted` 数组，看后端**实际回调**给该账号的权限 ID。
   - **受控单角色**：`node .claude/skills/console-automation/mg-login.mjs <account> --get /auth/session`。
   - **对齐判定**：real granted **==** 本次推的目录？
     - 目录有、granted 无 → **后端授权/存量租户回填没跟上**（`--dry-run` 回"无新增/更新/废弃"可证目录已齐）→ **别 re-push**，指后端。
     - 目录里都没有 → 前端没推 → **re-push**（前端自己的锅）。

> `dry-run`：`bun run scripts/sync-permissions.ts --dry-run --market china|global`。

## 推送记录

| 日期 | catalog_version | 变更 | 关联 | 推送 | 真实回调验证 |
|---|---|---|---|---|---|
| 2026-07-15 | 1.1.0 | 新增 `resource_labels`（资源组中文名，随 sync 下发） | console#15 | 两市场 apply code 0 | — |
| 2026-07-15 | 1.2.0 | API Key 权限按「类型 × 动作」全细分 | 需求方#68 | apply | — |
| 2026-07-16 | 1.3.0 | 护栏管理动作按「分类 × 动作」细分：新增 `guardrails.{global,member,key}:{edit,delete}` | 需求方#57 §11（`ee24908`） | 目录已 apply（dry-run 无变更）| ⚠️ 见下（闭环未合）|

## 已知未闭环：1.3.0 授权矩阵滞后（后端）

- **目录**：`guardrails.{global,member,key}:{edit,delete}` 已推齐（dry-run 无变更）。
- **真实回调验证（eye 日志 + mg-login）**：同为 **owner** 角色，两租户结果不同——
  - `api-test-static-owner`（租户 01kt3y7s…，eye 日志）：细粒度 edit/delete **全部到手** ✓
  - `modelgo-qa-test01`（租户 01ktrb46…，#85 复现，mg-login）：细粒度 **全部没到手** ✗，只有 legacy 通用 `guardrails:edit/delete`
- **结论**：后端只把细粒度授权补给了部分租户，**存量租户 `modelgo-qa-test01` 没回填** → 需求方 #85（owner 建完护栏无法编辑/删除/停用）。
- **闭环出口**：后端单 **qa/ai-quality-platform#490**（护栏 enforce 迁移 + 授权补齐 + 存量租户 backfill，指派凌霄）。后端补齐后，重跑第 3 步真实回调验证 == 目录，闭环合上。
