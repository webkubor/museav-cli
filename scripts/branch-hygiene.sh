#!/usr/bin/env bash
# 分支与 worktree 体检。
#
# 治的是「开这一步每次做到、删这一步长期没人做」——
# 2026-08-28 清点挂着 4 个僵尸 worktree；2026-09-18 owner 再次清点，
# 一天内 7 个分支/worktree 里 2 个零提交、3 个 worktree 零改动、最老的 7 天没动。
#
# 默认只报告不删：删分支不可逆，让人看一眼再动手。
# 带 --fix 才真删，且只删「已合并 + 无未提交改动 + 没挂 worktree」的。
set -eo pipefail
cd "$(git rev-parse --show-toplevel)"
FIX="${1:-}"
git fetch -qp 2>/dev/null || true

PROTECTED='^(main|test|release/.*)$'

echo "-- 已合并但还没删的远端分支"
found=0
for b in $(git branch -r --format='%(refname:short)' 2>/dev/null | grep -v HEAD | sed 's|^origin/||'); do
  if [[ "$b" =~ $PROTECTED ]]; then continue; fi
  merged=""
  for target in origin/main $(git branch -r --format='%(refname:short)' | grep '^origin/release/' || true); do
    if git merge-base --is-ancestor "origin/$b" "$target" 2>/dev/null; then
      merged="${target#origin/}"; break
    fi
  done
  if [ -z "$merged" ]; then continue; fi
  if git worktree list | grep -qF "[$b]"; then
    echo "   [skip] $b  已进 $merged，但挂着 worktree —— 先确认没人在用"
    found=1; continue
  fi
  echo "   [del ] $b  已进 $merged"
  found=1
  if [ "$FIX" = "--fix" ]; then
    git push origin --delete "$b" >/dev/null 2>&1 && echo "          remote deleted"
    git branch -D "$b" >/dev/null 2>&1 && echo "          local deleted"
  fi
done
if [ "$found" -eq 0 ]; then echo "   OK 无残留"; fi

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
exit 0
