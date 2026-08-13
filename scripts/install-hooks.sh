#!/usr/bin/env sh
# scripts/install-hooks.sh
# ───────────────────────────────────────────────────────────────
# 把仓库内的 git 钩子安装到 .git/hooks/（由 package.json 的 prepare 在
# `pnpm install` 时自动调用）。因为 .git/hooks/ 不入库，钩子逻辑真源是
# scripts/*.sh，这里只负责把「调用壳」落到本地，让队友/CI/新 clone 都生效。
#
# 幂等：每次覆盖写入；非 git 环境（无 .git，如作为依赖被安装）直接跳过。
#
# 硬性：本脚本任何失败都不阻断 `pnpm install`（2026-07-29 在 Jenkins 并发构建下
# 遇到过 `mkdir: cannot create directory '/dev/null': File exists` 这种构建机
# 环境瞬时异常，把整条部署流水线打挂——装本地 git 钩子只是给人/agent 提交时用的
# 便利功能，CI 环境里没人在这台机器上手敲 git commit，钩子装不上不该拖垮部署）。
# ───────────────────────────────────────────────────────────────

# 定位 git 目录；拿不到（非 git checkout）就静默跳过，不阻断 install
HOOKS_DIR="$(git rev-parse --git-path hooks 2>/dev/null)" || exit 0
[ -n "$HOOKS_DIR" ] || exit 0

# 注意：不要把这几步塞进 `( set -e; ... ) && ok || warn` 这种子 shell 里——bash 对「整个
# 子 shell 的退出码正被 && / || 测试」这种场景会静默停用子 shell 内的 -e（POSIX 对
# if/while 条件里的命令也有同样豁免），会导致 mkdir 失败后子 shell 仍往下跑、最终
# 靠最后一条 echo 的成功状态骗过外层判断。改成显式逐步 && 链，每步失败都立刻短路。
mkdir -p "$HOOKS_DIR" 2>/dev/null \
  && cat > "$HOOKS_DIR/commit-msg" 2>/dev/null <<'HOOK'
#!/usr/bin/env sh
# 提交消息校验钩子（scripts/install-hooks.sh 自动安装，勿手改逻辑 → 改 scripts/commit-msg-check.sh）
# SSOT: cs rule commit_convention
bash "$(git rev-parse --show-toplevel)/scripts/commit-msg-check.sh" "$1"
HOOK
STATUS=$?
if [ "$STATUS" -eq 0 ]; then
  chmod +x "$HOOKS_DIR/commit-msg" 2>/dev/null
  STATUS=$?
fi

# ── pre-commit 也在这里装（2026-08-13）──────────────────────────
# 原先它只由 agent-eyes 在**启动 vite 时**写入，于是「clone + pnpm install 就直接
# 提交」的人（含 CI 上手敲提交、以及只跑测试不起 dev 的人）身上完全没有提交门禁。
# 8-12 的 token 事故正是门禁存在但未执行——所以安装路径必须覆盖不启动 vite 的场景。
#
# 幂等 & 不与 agent-eyes 抢：已经指向 pre-commit-all.sh 的（无论是 agent-eyes 写的
# 还是本脚本写的）一律不动；只升级「老版本/无门禁」的壳。agent-eyes 之后启动仍会按
# force:true 覆盖成它自己的 managed 块，那份也调同一个 pre-commit-all.sh，等价。
if [ "$STATUS" -eq 0 ] && ! grep -q 'pre-commit-all.sh' "$HOOKS_DIR/pre-commit" 2>/dev/null; then
  cat > "$HOOKS_DIR/pre-commit" 2>/dev/null <<'HOOK'
#!/usr/bin/env sh
# 提交前门禁钩子（scripts/install-hooks.sh 自动安装，勿手改逻辑 → 改 scripts/pre-commit-all.sh）
# agent-eyes 的 secret / 超长文件 guard 由 vite 插件生成到 .git/hooks/，
# 未启动过 vite 时该文件不存在——存在就跑，不存在不阻断（项目门禁仍在下一行执行）。
GUARD="$(git rev-parse --git-path hooks)/agent-eyes-guard.mjs"
[ -f "$GUARD" ] && { node "$GUARD" || exit 1; }
bash "$(git rev-parse --show-toplevel)/scripts/pre-commit-all.sh"
HOOK
  if [ $? -eq 0 ]; then
    chmod +x "$HOOKS_DIR/pre-commit" 2>/dev/null
    echo "✓ git hooks installed → $HOOKS_DIR/pre-commit"
  else
    echo "⚠ pre-commit 钩子安装失败，已跳过（非致命）：$HOOKS_DIR" >&2
  fi
fi

if [ "$STATUS" -eq 0 ]; then
  echo "✓ git hooks installed → $HOOKS_DIR/commit-msg"
else
  echo "⚠ git hooks 安装失败，已跳过（非致命，不阻断 install）：$HOOKS_DIR" >&2
fi

exit 0
