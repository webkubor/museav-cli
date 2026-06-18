---
name: deploying-modelgo
description: Use when asked to deploy, redeploy, retrigger, or verify deployment of a ModelGo web project (modelgo-console-web, modelgo-global-web, modelgo-web 等) via Jenkins (jenkins.ops.modelgo.com), or when a Jenkins build fails with errors like ERR_PNPM_IGNORED_BUILDS and needs diagnosis.
---


# ModelGo Jenkins 部署与验证

## Overview

最短路径：定位 job → API 触发 → 后台轮询 → 失败拉日志诊断 / 成功打健康检查 → `cs notify` 发结果通知。
全程 API 自助，不开浏览器、不找运维。

## 凭证（先查，禁止问用户）

按全局规则走 `cs secrets`；交互模式不可用时直接读真源 `~/Documents/CortexOS/secrets/jenkins.md`：

```bash
AUTH="wangenbo:<jenkins.md 中的 API token>"
```

Git 拉取凭证（如需配 Jenkins credential）用 `secrets/gitlab.md` 的 `glpat-` token，类型选 Username with password——Jenkins API token 不能当 Git 凭证。

## 1. 定位 job 与参数

URL 模式：`https://jenkins.ops.modelgo.com/job/<env>/job/<项目名>/`，env 目前为 `test`。

```bash
# 列出 job（tree 参数含 []，curl 必须带 -g，否则 exit 3）
curl -sg -u "$AUTH" "https://jenkins.ops.modelgo.com/job/test/api/json?tree=jobs[name]"
# 触发前先确认真实参数名，不要假设
curl -sg -u "$AUTH" "$JOB/api/json?tree=property[parameterDefinitions[name,defaultParameterValue[value]]]"
```

已知：modelgo-global-web 参数为 `GIT_BRANCH`（默认 `main`），实测于 2026-06。

## 2. 触发 + 轮询

```bash
JOB="https://jenkins.ops.modelgo.com/job/test/job/modelgo-global-web"
# 触发，期望 201；Location header 是 queue 项，可精确防并发串号
# (此处勿用 awk 的位置变量——skill 带参调用时 $1/$2 会被参数替换吞掉)
Q=$(curl -sg -D- -o /dev/null -X POST -u "$AUTH" "$JOB/buildWithParameters?GIT_BRANCH=main" | grep -i '^location:' | cut -d' ' -f2 | tr -d "\r")
# queue 项落地后可拿到本次 build 号（排队期 executable 为空，需重试几次）
curl -sg -u "$AUTH" "${Q}api/json" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('executable',{}).get('number'))"
```

轮询用 run_in_background 的循环（每 15s 查 `$JOB/<号>/api/json?tree=building,result`），不要前台 sleep。正常构建 2-3 分钟；5 秒内 FAILURE = install/checkout 阶段挂了。

## 3. 失败诊断

```bash
curl -sg -u "$AUTH" "$JOB/<号>/consoleText" | grep -nE "ERR|ERROR|error"
```

| 症状 | 根因与修法 |
|------|-----------|
| `ERR_PNPM_IGNORED_BUILDS` | pnpm v11 不认 `onlyBuiltDependencies`（package.json/lockfile/.npmrc 三处都无效）。改（不存在则新建）`pnpm-workspace.yaml` 的 `allowBuilds: {包名: true}`。生效后即使 node_modules 是缓存态也会当场补跑构建脚本，无需清缓存。builder 实测为 v11 行为（2026-06）；可并存旧键 `onlyBuiltDependencies` 兼容 v10- |
| install 后 `Already up to date` 但仍报错 | builder workspace 持久化，no-op install 不会重跑任何脚本；修复必须走 `allowBuilds`（见上），`force=true` 写 .npmrc 在 builder 上无效 |
| 想清 workspace / 改流水线 | 死路：wangenbo 无 Configure/Replay 权限，`devops/cicd` 仓库无读权限。一切修复走项目仓库提交 |
| 本地复现 pnpm 行为 | `CI=true pnpm install`（绕过 TTY purge 确认）；装完查 `node_modules/.modules.yaml` 的 `ignoredBuilds` |

修复流程：改项目仓库 → **本地先验证**（CI=true pnpm install / pnpm build:test）→ commit+push → 回到第 2 步重触发。

## 4. 成功验证（必做，绿了 ≠ 完成）

三条全满足才算部署成功：

1. build `result == "SUCCESS"`
2. 日志含 `successfully rolled out`（Deploy 阶段是 `kubectl -n test set image` + `rollout status`）
3. 健康检查 200：

```bash
curl -s -o /dev/null -w "%{http_code}" "https://global-web.test.modelgo.com/check-health"
```

**陷阱：`*.test.modelgo.com` 是泛解析**，网关对任意子域（包括不存在的）的 `/` 和 `/check-health` 都回 200。鉴别真假：

```bash
curl -s "https://<域名>/" | head -c 40
# {"message": "invalid domain"} = 无路由(假); HTML = 真实应用
# 网关对未知域名的 /check-health 也回 {"message": "ok"}, 真应用多为空体或自有格式
```

## 5. 通知（验证通过后必做）

```bash
cs notify "✅ 部署成功: <项目名> #<build号> (<commit短哈希>) → <测试域名> 健康检查通过" --from claude
```

默认发个人 ai-team 群；用户明确要求发公司群时加 webhook 参数（见 `cs notify --help` 的 modelgo 群）。失败需要用户介入时同样发通知说明卡点。

## 附录：域名映射

域名以项目 README「环境与域名」一节为准（命名不规则，不要瞎猜），已验证映射（2026-06 实测）：

| Jenkins job (test/) | 本地目录 | 测试环境域名 |
|------|------|-------------|
| modelgo-global-web | modelgo-global-web | global-web.test.modelgo.com |
| modelgo-web | modelgo-domestic-web | web.test.modelgo.com |
| modelgo-console-web | modelgo-console-web | console.test.modelgo.com |
| modelgo-controller-web | modelgo-controller-web | **admin**.test.modelgo.com |
| modelgo-doc-web | doc-web | doc.test.modelgo.com |
| modelgo-{agent,billing,controller,model-gateway,observer,permissions,web-api} | （后端） | 无独立子域，走网关/集群内部 |

## Common Mistakes

- 构建绿了就报成功——必须打 `/check-health` 和首页
- 域名 200 就当部署目标存在——泛解析网关任何子域都 200，必须看响应体（见第 4 节）
- 凭 nextBuildNumber 猜 build 号——并发触发会串号，用 queue Location 精确解析
- 不查 parameterDefinitions 就硬编码参数名——参数名错了 Jenkins 不报错，静默用默认值
- 在 Jenkins 网页上排查——API consoleText 更快且可 grep
- 把失败归因于缓存/版本前，先本地 `CI=true pnpm install` 复现取证
