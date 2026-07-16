# 权限目录推送记录（catalog sync changelog）

> 每次改 `src/config/permissions.ts` / `permission-catalog.ts` 并 `sync:permissions` 推送后，在此补一条。
> **重要边界**：前端 sync 推的是**权限目录（有哪些 permission ID + 菜单归属）**；
> **"哪个角色被授予哪些权限" 是后端授权矩阵（角色 seeding），前端 sync 不管**。
> 排查"某角色没权限"先分清是①目录缺 ID（前端 re-sync）还是②角色没授予（后端授权矩阵）。
> 判定命令：`bun run scripts/sync-permissions.ts --dry-run --market china|global`，
> 回"无新增/更新/废弃"= 目录已齐 → 是后端授权问题，别再推目录。

| 日期 | catalog_version | 变更 | 关联 | 推送 |
|---|---|---|---|---|
| 2026-07-15 | 1.1.0 | 新增 `resource_labels`（资源组中文名，随 sync 下发） | console#15 | 两市场 apply code 0 |
| 2026-07-15 | 1.2.0 | API Key 权限按「类型 × 动作」全细分 | 需求方#68 | apply |
| 2026-07-16 | 1.3.0 | 护栏管理动作按「分类 × 动作」细分：新增 `guardrails.{global,member,key}:{edit,delete}` | 需求方#57 §11（`ee24908`） | 目录已 apply（dry-run 无变更）|

## 已知未闭环：授权矩阵滞后（后端）

- **1.3.0 细粒度护栏 edit/delete**：目录 ID 已推齐，但**后端角色授权矩阵未授予**这些细粒度权限给任何角色（owner/admin/member 的 `guardrails.{scope}:{edit,delete}` 全 False，只保留 legacy 通用 `guardrails:edit/delete`）。导致 #85：企业 owner 建完护栏无法编辑/删除/停用。→ 后端单 qa/ai-quality-platform#490（护栏 enforce+授权补齐，指派凌霄）。
