#!/usr/bin/env bash
# scripts/pre-commit-all.sh
# ───────────────────────────────────────────────────────────────
# 提交期门禁清单的**唯一真源**（SSOT）。vite.config.ts 的 agentEyes({ git.precommit })
# 与 scripts/install-hooks.sh 都只调用本文件，不各自复述清单。
#
# 为什么要有它（2026-08-13）：门禁清单原先只写在 vite.config.ts 里，而那份清单只有
# 在「本机启动过一次 vite」时才会被 agent-eyes 写进 .git/hooks/pre-commit——只跑
# `pnpm install` 的人拿不到（install-hooks.sh 当时只装 commit-msg），等于门禁在
# 一部分人的机器上根本不存在。清单若同时抄在两处又必然漂移，所以收口到这里。
#
# 退出码：任一门禁非零即中断提交（`git commit --no-verify` 仍可临时跳过，那是
# git 的既有语义，堵不住也不该堵——CI 侧另有一道即可）。
# ───────────────────────────────────────────────────────────────
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

# 类型 + 规范快检（全量构建在 pre-push/CI；内部做「有 cs 用 cs、无则降级 tsc+eslint」）
sh scripts/pre-commit-check.sh || exit 1

# UI 约定门禁（圆角刻度/图标库/内联 style token 等，真源 DESIGN.md）
bash scripts/ui-guard.sh || exit 1

# token 存在性门禁：var(--xxx) 引到未声明的变量会让**整条声明静默失效**
# （z-index 退回 auto、圆角/间距归零），而 tsc/eslint/vite build 全部照过——
# 2026-08-12 的「全局组件无法点击」就是这么进 test 的，必须在提交期拦。
node scripts/check-css-tokens.mjs || exit 1

# Tailwind 颜色类名门禁（2026-08-25 接入）：写 text-mg-brand / text-mg-text-0 这种
# 未在 @theme 注册的类名，**Tailwind 不报错、构建不报错、tsc 也不报错** —— 只是那条
# 声明生成不出来、颜色静默继承父级。跑起来看着"差不多对"，事后完全回想不起哪里错了。
# 同一天踩两次（mg-brand 22 处、mg-text-0 17 处），并顺带查出 5 处存量同类问题，
# 说明靠人工比对 index.css 是不可靠的。
node scripts/check-tailwind-tokens.mjs || exit 1

# 硬编码回归门禁（2026-08-24 接入）：库里已有 token 却写死字面值 ——
# ease / duration / radius / shadow / z-index / 语义色六类。规则真源在
# modelgo-design-tokens 包里，本仓只调用、不复述清单，避免两处漂移。
#
# 存量不阻断：token-usage-baseline.json 是本仓存量快照（105 处），只拦新增。
# 收口：pnpm dlx 不需要，直接 node <上面那个脚本> src --update-baseline。
# 整 file 豁免：在文件里写注释 token-check-ignore。详见包里 TOKEN-GOVERNANCE.md §6.1。
#
# 为什么必须显式给 MODELGO_WORKSPACE：脚本默认按「兄弟仓布局」推断工作区根，
# 在 worktree 里跑会把 .claude/worktrees/<名>/ 也写进 baseline 的 key，
# 换个 worktree 名就全部失配、每处都被当成新增。钉到 show-toplevel 之后
# key 恒为 src/...，主检出与任意 worktree 通用。
USAGE_GUARD='node_modules/modelgo-design-tokens/scripts/check-token-usage.mjs'
if [ -f "$USAGE_GUARD" ]; then
  MODELGO_WORKSPACE="$(git rev-parse --show-toplevel)" node "$USAGE_GUARD" src || exit 1
else
  # 不静默跳过：说清哪道门禁没跑、为什么。依赖没装时前面的快检本来也过不了。
  echo "pre-commit: ⚠ 硬编码门禁未运行 —— 找不到 $USAGE_GUARD，先 pnpm install" >&2
fi
