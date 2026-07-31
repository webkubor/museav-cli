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
  npx tsc -b --noEmit 2>/dev/null || npx tsc --noEmit
  npx eslint .
fi
