# 术语表

| 术语 | 定义 | 注意 |
|---|---|---|
| 租户 / tenant | 顶层组织实体，一个账号最多 5 个；API 字段 `tenant_id`，请求头 `X-Tenant-Id` | UI 文案禁用「组织」 |
| 工作空间 / workspace | 隶属租户的资源隔离单元；字段 `workspace_id` | UI 文案禁用「项目」「业务空间」 |
| 两段式导航 | 侧栏分 租户级（总览/用量/账单/设置）与 工作区级（API Keys/护栏/可观测/空间管理） | 切工作区只影响工作区级菜单 |
| 模型广场 / catalog | 公开模型目录（`/catalog/models`），卡片模态标签来自 `input/output_modalities` | |
| 模型体验 / playground | 在线试模型（对话/图像/音频/视频四类别、九任务枚举） | 类别与任务由模态**推导**（`modelExperienceTasks`），`experience_types` 已废弃 |
| 体验任务枚举 | text_to_text / image_to_text / video_to_text / text_to_image / image_to_image / text_to_audio / audio_to_text / text_to_video / image_to_video | 没有 video_to_video（「视频参考」不在 PRD 范围） |
| 暂未开放 | 模型推导任务集为空 → 广场卡片文案+体验按钮置灰（PRD §AC-13） | 不是独立开关字段 |
| 会话配置 / configs | 体验会话逐模型参数（`PUT /experience/sessions/{id}/configs/{modelId}`），键名 snake_case | 后端透明存储不校验，写错键静默丢弃 |
| 安全护栏 / guardrails | 内容安全策略，三 scope（全局/个人/Key） | 护栏命中是功能不是错误，别渲染成报错 |
| 双端品牌 / market | `data-market` = domestic（indigo）/ global（emerald），挂 `<html>` | 组件只引用 `--brand-*`，勿写死市场色 |
| mg-tile | 卡片容器类：实心 bg-0 + 淡边框 + 柔和阴影 | 毛玻璃只给浮层 |
| CursorPage | 后端游标分页信封（items + next_cursor） | 用 `pageItems<T>()` 兼容直接数组 |
| agent-eyes | 本地日志插件：`log/` 下 api-calls/errors/proxy 三类流 | 排 bug 先读日志再猜 |
| 待验证（看板） | 修复已部署到发现环境+复验通过，等报单人确认 | 先部署后改状态，顺序不可反 |
