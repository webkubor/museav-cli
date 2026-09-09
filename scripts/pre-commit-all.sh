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

# ── pnpm store 漂移自愈（必须在所有检查之前）────────────────────────────
# pnpm 升大版本后 store 目录会换（v10 → v11），但 node_modules/.modules.yaml 里
# 还记着旧路径。pnpm 判定要重建 node_modules，在 hook 的非 TTY 环境下无法确认，
# 直接中止 —— 于是**本仓任何 commit 都失败**，而报错只有半截堆栈：
#
#     类型检查 ... ❌
#            at runDepsStatusCheck (file:///...@pnpm/exe/...
#
# 完全不提 pnpm、不提 store，现象像门禁自己坏了。真错误要再往下挖才看得到
# ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY。
#
# 2026-08-25 一天撞两次（主检出三个仓库 + 一个 worktree），每次都靠人工比对
# .modules.yaml 才认出来。所以这里改成自愈：检测到漂移就自动迁移，而不是
# 让人再认一遍那半截堆栈。store 里已有内容时 install 只要 1-3 秒。
if command -v pnpm >/dev/null 2>&1 && [ -f node_modules/.modules.yaml ]; then
  _cur_store="$(pnpm store path 2>/dev/null || true)"
  _rec_store="$(sed -n 's/.*"storeDir": "\([^"]*\)".*/\1/p' node_modules/.modules.yaml | head -1)"
  if [ -n "$_cur_store" ] && [ -n "$_rec_store" ] && [ "$_cur_store" != "$_rec_store" ]; then
    echo "⚠ pnpm store 已漂移，正在自动迁移依赖（不改 lockfile）" >&2
    echo "    记录: $_rec_store" >&2
    echo "    当前: $_cur_store" >&2
    if CI=true pnpm install --frozen-lockfile >/dev/null 2>&1; then
      # 复检：install 应当重写 .modules.yaml 的 storeDir。若没变，说明这不是
      # 真漂移（例如 .modules.yaml 被手工改过），此时 install 是 no-op ——
      # 提示一次，别让人以为修好了，也别阻塞提交。
      _new_store="$(sed -n 's/.*"storeDir": "\([^"]*\)".*/\1/p' node_modules/.modules.yaml | head -1)"
      if [ "$_new_store" = "$_cur_store" ]; then
        echo "✅ 依赖已迁移到当前 store，继续门禁" >&2
      else
        echo "⚠ install 完成但 storeDir 记录未变（仍是 $_new_store）。" >&2
        echo "   多半是 .modules.yaml 被手工改过、pnpm 判定无需重建。" >&2
        echo "   若本次提交正常通过即可忽略；反复出现请删 node_modules 重装。" >&2
      fi
    else
      echo "✗ 自动迁移失败。手动跑：CI=true pnpm install --frozen-lockfile" >&2
      exit 1
    fi
  fi
fi

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

# 组件清单不漂移（2026-09-08 接入）：src/components/ui/COMPONENTS.md 是自动生成的
# 「本仓有什么现成组件」清单，agent 开工前查它决定"写还是复用"。
#
# 为什么要拦：过时的清单比没有清单更坏 —— 照着它做会漏掉新组件、或用上已删的。
# 而它是生成物，改了组件不重跑就必然过时，没人会主动想起来。
#
# 只在本次提交动了 src/components/ui/*.tsx 时校验，平时零开销。
if git diff --cached --name-only | grep -qE '^src/components/ui/.*\.tsx$'; then
  node scripts/gen-ui-inventory.mjs >/dev/null || exit 1
  if ! git diff --quiet -- src/components/ui/COMPONENTS.md; then
    echo "pre-commit: ✗ 组件清单已过时 —— 本次改了 ui/*.tsx，COMPONENTS.md 需要重新生成" >&2
    echo "            已就地更新，git add src/components/ui/COMPONENTS.md 再提交" >&2
    exit 1
  fi
fi
