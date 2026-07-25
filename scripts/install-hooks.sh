#!/usr/bin/env sh
# scripts/install-hooks.sh
# ───────────────────────────────────────────────────────────────
# 把仓库内的 git 钩子安装到 .git/hooks/（由 package.json 的 prepare 在
# `pnpm install` 时自动调用）。因为 .git/hooks/ 不入库，钩子逻辑真源是
# scripts/*.sh，这里只负责把「调用壳」落到本地，让队友/CI/新 clone 都生效。
#
# 幂等：每次覆盖写入；非 git 环境（无 .git，如作为依赖被安装）直接跳过。
# ───────────────────────────────────────────────────────────────
set -e

# 定位 git 目录；拿不到（非 git checkout）就静默跳过，不阻断 install
HOOKS_DIR="$(git rev-parse --git-path hooks 2>/dev/null)" || exit 0
[ -n "$HOOKS_DIR" ] || exit 0
mkdir -p "$HOOKS_DIR"

# commit-msg：提交消息格式校验（逻辑在 scripts/commit-msg-check.sh）
cat > "$HOOKS_DIR/commit-msg" <<'HOOK'
#!/usr/bin/env sh
# 提交消息校验钩子（scripts/install-hooks.sh 自动安装，勿手改逻辑 → 改 scripts/commit-msg-check.sh）
# SSOT: cs rule commit_convention
bash "$(git rev-parse --show-toplevel)/scripts/commit-msg-check.sh" "$1"
HOOK
chmod +x "$HOOKS_DIR/commit-msg"

echo "✓ git hooks installed → $HOOKS_DIR/commit-msg"
