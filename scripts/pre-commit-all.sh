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
