#!/usr/bin/env bash
# 分支与 worktree 体检。
#
# 治的是「开这一步每次做到、删这一步长期没人做」——
# 2026-08-28 清点挂着 4 个僵尸 worktree；2026-09-18 owner 再次清点，
# 一天内 7 个分支/worktree 里 2 个零提交、3 个 worktree 零改动、最老的 7 天没动。
#
# 默认只报告不删：删分支不可逆，让人看一眼再动手。
# 带 --fix 才真删，且只删「已合并 + 无未提交改动 + 没挂 worktree」的。
# 带 --check 时，有任何待清理项就非零退出（供 pre-push 当门禁用）。
set -eo pipefail
cd "$(git rev-parse --show-toplevel)"
FIX=""
CHECK=""
for arg in "$@"; do
  case "$arg" in
    --fix) FIX="--fix" ;;
    --check) CHECK="--check" ;;
  esac
done
git fetch -qp 2>/dev/null || true

PROTECTED='^(main|test|release/.*)$'

# ── 合并目标：main + 所有 release/* + test ──────────────────────────
# 2026-09-29 修：原先只认 main 与 release/*，**不认 test**。而本仓的
# 功能流向是「worktree 分支 → 版本分支 → 合入 test 走测试环境」，
# sync/* 这类分支的归宿就是 test —— 脚本不把它当目标，于是这类分支一条都
# 扫不出来，最后报「OK 无残留」。这是**假阴性**：不是没有残留，是没查。
# 一次就漏掉 4 条（fix/741-auto-refresh、sync/107、sync/1171、以及后面
# 靠单号判据才发现的 fix/1119）。
#
# 判据要跟着仓库真实的分支流向走，不能只认「最终会进 main 的那条腿」。
TARGETS=$(git branch -r --format='%(refname:short)' 2>/dev/null \
  | grep -v HEAD | grep -E '^origin/(main|test|release/.*)$' || true)

# ── 分支名里的单号（fix/1119-xxx → 1119）─────────────────────────────
# 用于「同单号已由他分支实现」的判据，见下面 [same] 分支。
ticket_of() {
  printf '%s' "$1" | sed -nE 's|^(fix\|feat\|feature\|hotfix\|chore)/([0-9]+)-.*|\2|p'
}

# 该单号在目标分支上是否已有提交（正文里 #1119 或裸 1119 都算）
#
# ⚠️ 这里**不能用 `grep -q`**：`grep -q` 命中第一行就退出，上游 `git log`
# 还在写管道就被 SIGPIPE 杀掉（退出码 141），而本脚本开头是 `set -o pipefail`
# ——整条管道的退出码于是变成 141，**明明命中却被判成「没命中」**。
# 2026-09-29 实测：`pipefail` 下退出码 141、关掉 `pipefail` 才是 0。
# 判据写成假阴性比没有判据更坏：脚本报「OK」，人就不查了。
# 所以用 `grep -c`（读完整个输入再退出）或 `grep >/dev/null`，不用 -q。
ticket_landed() {
  local t="$1" n="$2"
  [ "$(git log --format='%s' $TARGETS 2>/dev/null \
      | grep -cE "(^|[^0-9])#?${n}([^0-9]|$)")" -gt 0 ]
}

echo "-- 已合并但还没删的远端分支"
del_count=0
same_count=0
for b in $(git branch -r --format='%(refname:short)' 2>/dev/null | grep -v HEAD | sed 's|^origin/||'); do
  if [[ "$b" =~ $PROTECTED ]]; then continue; fi
  merged=""
  for target in $TARGETS; do
    if git merge-base --is-ancestor "origin/$b" "$target" 2>/dev/null; then
      merged="${target#origin/}"; break
    fi
  done

  if [ -n "$merged" ]; then
    if git worktree list | grep -qF "[$b]"; then
      echo "   [skip] $b  已进 $merged，但挂着 worktree —— 先确认没人在用"
      del_count=$((del_count+1)); continue
    fi
    echo "   [del ] $b  已进 $merged"
    del_count=$((del_count+1))
    if [ "$FIX" = "--fix" ]; then
      git push origin --delete "$b" >/dev/null 2>&1 && echo "          remote deleted"
      git branch -D "$b" >/dev/null 2>&1 && echo "          local deleted"
    fi
    continue
  fi

  # ── [same] 同单号已由他分支实现，本分支可能是废弃版本 ──────────────
  # 2026-09-29 加。真实案例：fix/1119-ticket-supplement 挂着一条「抢救存档」
  # 提交（+171 行 / 9 文件），看着像没做完的活；但同一个单号 1119 已经由
  # fix/1119-ticket-supplement-render 分支做完并合进 1.0.7（395e2e8c，
  # 下面 6 条提交全是）。**只看「有没有并入 1.0.7」判不出来**——那条分支
  # 确实没并入，内容也确实不在 1.0.7 上，是被同单号的另一条实现覆盖了。
  #
  # 为什么不用 git cherry：它按 patch-id 比，而废弃版本与最终实现往往不是
  # 同一份 diff（1061 实测 cherry 报 `+`，即「未合入」，但内容早已被
  # 7cbacdb4 覆盖）。patch-id 判「同一份改动」，单号判「同一件事」。
  #
  # **只提示不删**：同单号 ≠ 一定废弃（可能一个单拆两条分支做不同部分）。
  # 删不删看人 —— 所以下面把本分支相对目标分支的独有提交列出来。
  t=$(ticket_of "$b")
  if [ -n "$t" ] && ticket_landed "$b" "$t"; then
    echo "   [same] $b  单号 $t 已在目标分支上有实现，本分支可能是废弃版本"
    git log --oneline --no-merges $TARGETS..origin/$b 2>/dev/null \
      | sed 's/^/          独有: /' | head -5
    same_count=$((same_count+1))
  fi
done
if [ "$del_count" -eq 0 ]; then echo "   OK 无已合并残留"; fi
if [ "$same_count" -gt 0 ]; then
  echo "   ↑ [same] 只是提示，需要人判断；确认废弃后删：git push origin --delete <分支>"
fi

echo
echo "-- worktree"
wt_count=$(git worktree list | wc -l | tr -d ' ')
if [ "$wt_count" -le 1 ]; then
  echo "   OK 没有 worktree（这是正常状态）"
else
  git worktree list --porcelain | awk '/^worktree /{print $2}' | tail -n +2 | while read -r p; do
    if [ ! -d "$p" ]; then continue; fi
    d=$(git -C "$p" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    b=$(git -C "$p" branch --show-current 2>/dev/null || echo "(detached)")
    last=$(git -C "$p" log -1 --format='%ar' 2>/dev/null || echo "?")
    if [ "$d" -gt 0 ]; then
      echo "   [keep] $(basename "$p")  分支=$b  有 $d 个未提交改动 —— 别删"
    else
      echo "   [del ] $(basename "$p")  分支=$b  零改动，最后提交 $last"
      if [ "$FIX" = "--fix" ]; then
        git worktree remove "$p" --force >/dev/null 2>&1 && echo "          removed"
      fi
    fi
  done
fi

echo
echo "-- 主检出"
cur=$(git branch --show-current 2>/dev/null || true)
dirty=$(git status --porcelain | wc -l | tr -d ' ')
if [ -z "$cur" ]; then
  echo "   分支=(detached HEAD)  未提交=$dirty"
  echo "   WARN detached HEAD 上提交会挂空，先 git checkout <分支>"
else
  echo "   分支=$cur  未提交=$dirty"
fi

if [ "$FIX" != "--fix" ]; then
  echo
  echo "   只报告未删。确认后：bash scripts/branch-hygiene.sh --fix"
fi

# ── --check：有残留就非零退出，供 pre-push / CI 当门禁 ──────────────
# 退出码单独于「删没删」：删要人点头（不可逆），但**知道有残留**这件事
# 本身是可以自动拦的。2026-09-29 这次的教训正是「没人跑」——脚本存在，
# 判据却是假的（不认 test），报 OK 之后所有人都以为没问题。
if [ "$CHECK" = "--check" ]; then
  if [ "$del_count" -gt 0 ] || [ "$same_count" -gt 0 ]; then
    echo "branch-hygiene: 有 $del_count 条已合并残留、$same_count 条同单号待判" >&2
    exit 1
  fi
fi
exit 0
