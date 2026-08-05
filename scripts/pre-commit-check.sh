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

# ── 分叉预警（只警告，不阻断）─────────────────────────────────────
# 为什么要有：双向分叉（本地分支与 origin 各有对方没有的 commit）时 push 会被拒，
# 而 force 会丢别人的东西。2026-08-04 撞过一次：任杰走 MR 把改动合进 main、我们走
# test 合了同一改动，origin/test 与 origin/main 各有 13/1 个独有提交，是准备同步时
# 偶然发现的——没有任何机制会报它。2026-08-05 又撞一次（test 领先 main 7 个、main
# 领先 test 1 个），同样靠人工比对才发现，坐实了需要这条预警。
#
# 刻意只警告不阻断：分叉不是「这次提交引入的」，拦下提交解决不了问题，反而挡住正常
# 工作。也刻意不 fetch：那会让每次提交都联网、慢几秒；这里只比对本地已有的
# origin/* ref，零网络开销。代价是 ref 陈旧时可能漏报，由每日 cs-doctor 兜底。
_cur=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -n "$_cur" ] && git rev-parse --verify --quiet "origin/$_cur" >/dev/null 2>&1; then
  _ahead=$(git rev-list --count "origin/$_cur..$_cur" 2>/dev/null || echo 0)
  _behind=$(git rev-list --count "$_cur..origin/$_cur" 2>/dev/null || echo 0)
  if [ "$_ahead" -gt 0 ] && [ "$_behind" -gt 0 ]; then
    echo "[pre-commit] ⚠️  $_cur 与 origin/$_cur 双向分叉（本地独有 $_ahead / 远端独有 $_behind）"
    echo "[pre-commit]     推之前先收敛：git fetch origin $_cur && git rebase origin/$_cur（或 merge）"
    echo "[pre-commit]     别 force push——会丢远端那 $_behind 个提交"
  fi
fi
