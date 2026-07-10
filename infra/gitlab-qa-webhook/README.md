# GitLab QA Issue Notifier

接收 `qa/ai-quality-platform`（project ID `1`）的 GitLab Issue Hook。仅当任务状态标签变化时，向 ModelGo 飞书群发送通知。

## Worker Secrets

- `GITLAB_WEBHOOK_TOKEN`：校验 GitLab 18.9 的 `X-Gitlab-Token`。
- `FEISHU_WEBHOOK_URL`：ModelGo 飞书群机器人地址。

真实值统一从 CortexOS `secret_vault` 注入，禁止写入仓库、命令日志或 GitLab Issue。

## GitLab 配置

在 project ID `1` 的 `Settings → Webhooks` 添加 Worker URL，只勾选 `Issue events`，并配置与 Worker 相同的 Secret token。
