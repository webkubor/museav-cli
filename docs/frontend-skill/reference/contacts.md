# 问题对接路由（各能力 owner）

> 提单前先按模块查重（一模块一单）；格式：页面 → 接口 → 问题 → 缺什么 + 验收 checkbox。
> 先讲业务场景（SCQA：背景-冲突-问题-方案）再给技术改动。

| 领域 | Owner | 提单去处 |
|---|---|---|
| 前端（console-web） | webkubor（王恩波） | frontend/modelgo-console-web 或对应 bug 单 |
| 通用后端 API / catalog 数据 | 任杰（xionrenjie） | qa/ai-quality-platform，标 `[后端]` |
| 安全护栏 / 提示词检测 / FakeLLM | 邵一鸣（shaoyiming） | 同上 |
| 用量 / 日志 / 总览口径 / observer | 凌霄（duanlingxiao） | 同上 |
| 需求 / PRD / 验收 | yujianfeng（PD） | shared/modelgo_prd |

## 边界约定

- 前端用了后端字段/端点/枚举（含「先按原型做、等后端」）→ **必须落 API 单**并在代码注释挂单号；
- 联调发现后端数据/契约异常 → 当场建单指后端，**不做前端兜底**；
- 后端单验不了（并发/纯内部行为）→ 注明原因归还后端+QA，不静默跳过；
- 已完成/已关闭的单（尤其后端 API 单）不改状态不插手。
