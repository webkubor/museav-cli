# 代码规范（命名 / 目录 / 注释 / Git）

## 命名

- **产品命名以 PRD 原型为准**：租户（tenant）、工作空间（workspace，列表页可叫「空间管理」）；**禁止**「组织/项目/业务空间」。数据层字段名保持 `tenant_id`/`workspace_id`；
- 组件 PascalCase，hook `useXxx`，服务函数动宾（`listModels`/`createApiKey`）；
- 后端契约字段 snake_case（`system_prompt`/`max_tokens`），前端不要擅自驼峰化；
- i18n key 按模块分层（`modelsExperience.settings.saveFailed`），中英两份都要加。

## 目录

```
src/
├── components/ui/        # 通用组件（复用优先，新组件先落这里）
├── components/<域>/      # 跨页面业务组件（如 customer-service）
├── pages/<模块>/         # 页面 + 页面级组件/样式（模块内 components/ styles/）
├── features/<域>/        # 领域 hooks/组件（models 等）
├── services/             # HTTP 层（一个域一个文件）
├── hooks/                # 通用 hooks
├── lib/                  # request/utils/埋点等基础设施
├── stores/               # zustand
├── types/ interfaces/    # 类型（响应/请求分开）
└── locales/              # zh.json / en.json
```

## 注释

- 只写「代码本身说不出的约束」：为什么这么做、依据哪条 PRD/哪张单（挂 `#单号`）、踩过什么坑；
- 不写「下一行在干什么」式注释；
- 前端依赖后端未交付能力时，注释挂对应 API 单号。

## Git

- **提交格式**：`type(scope): 中文动宾描述`，type ∈ feat/fix/refactor/chore/docs/style/test/ci/perf/merge；**禁纯英文 commit**；fix/feat 建议挂 `#单号`。commit-msg 钩子硬校验；
- **分支流**：日常改动开隔离 worktree（`fix/<名>`、`feat/<名>`，基于 `origin/test`）→ 自测过 → 合 `test` 分支 → push → Jenkins 发测试环境；生产 = `test` 快进 `main` + 打 tag（`console-web-prod-YYYYMMDD[-n]` 或语义版本）→ 触发 prod + prod-global 两个 job；
- **push 前先 fetch+rebase**（多 session 并发，别人可能刚推过）；
- 已合并分支即删（本地+远端+worktree）；
- pre-commit：类型+规范快检（`scripts/pre-commit-check.sh`，无 cs 自动降级 tsc+eslint）+ `ui-guard.sh` UI 门禁。全量构建在 CI。
