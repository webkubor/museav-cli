#!/usr/bin/env sh
# scripts/pre-commit-check.sh
# ───────────────────────────────────────────────────────────────
# 提交前快检（类型 + 规范，不跑全量构建——那个归 pre-push/CI）。
#
# `cs` 是个人工具链（CortexOS CLI），团队成员机器上通常没有——不能让它成为
# 提交的硬依赖（cs: command not found → exit 127 → 谁都提交不了）。
# 有 cs 用 cs（口径同 cs flow frontend ⑤ 门禁，额外带飞书推送等个人能力）；
# 没有则降级为等效的 tsc + eslint，检查内容一致，任何人 clone 即可提交。
# ───────────────────────────────────────────────────────────────
set -e

if command -v cs >/dev/null 2>&1; then
  cs check test --quick
else
  echo "[pre-commit] cs 未安装，降级为 tsc + eslint 等效快检"
  # 必须是 tsc -b：本仓根 tsconfig.json 是 solution-style（files: [] + references），
  # `tsc --noEmit` 不跟 references 走 → 检查空文件集 → 无论源码错成什么样都通过。
  # 曾放行过 `Cannot find name 'deleteHistorySession'`（TS2552），提交后才在浏览器炸
  # ReferenceError（qa/ai-quality-platform#588）。
  # --force 关增量：pre-commit 要判"当前源码对不对"，tsbuildinfo 命中会跳过检查。
  # 也不要再套 `2>/dev/null || npx tsc --noEmit` 兜底——那个 fallback 正是假绿的来源。
  npx tsc -b --force
  npx eslint .
fi
