#!/usr/bin/env bash
# 当前发版模式（只读）：这张单该从哪切、MR 合到哪、测试环境部署后挪什么状态。
#
# 为什么是脚本不是文档：CLAUDE.md 里曾写死「1.0.7 开发中 → 做完保持进行中」，1.0.7 上线后
# 没人改，agent 照着它从已发车的 release/v1.0.7 切分支（2026-10-08 Codex 实例）。阶段是会变的
# 事实，只能现查，不能抄进文档。
#
# 判据（按顺序，第一条命中即定）：
#   1. 本仓有 origin/release/vX.Y.Z 带着 main 没有的非合并提交 → 班车在开，新单投这条 release
#   2. 否则 → hotfix 模式：从 origin/main 切 hotfix/<iid>-<简述>，MR → test 验证，再 MR → main 上线
# GitLab 上的 V*-Train-* 里程碑只作参考展示：里程碑会先于分支建好（2026-10-08 实况：
# V1.0.8 里程碑 active，但本仓未开 release/v1.0.8），**本仓开没开 release 分支才是准绳**。
#
# 用法：bash scripts/release-stage.sh            # 人读
#       bash scripts/release-stage.sh --json     # agent 读（mode/base/targets/next_status）
#       RELEASE_STAGE_NO_FETCH=1 bash scripts/release-stage.sh   # 离线 / 测试时跳过 git fetch
set -euo pipefail

JSON=0
[ "${1:-}" = "--json" ] && JSON=1

cd "$(git rev-parse --show-toplevel)"
[ -n "${RELEASE_STAGE_NO_FETCH:-}" ] || git fetch -q origin --prune 2>/dev/null || echo "⚠️  git fetch 失败，以下基于本地缓存的远端分支" >&2

open_release=""
for ref in $(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/release/v*' | sort -V); do
  # 只数非合并提交：release 回流 main 时会留下合并提交，那不代表有未上线的功能
  ahead=$(git rev-list --count --no-merges "origin/main..$ref")
  if [ "$ahead" -gt 0 ]; then open_release="${ref#origin/}"; fi
done

# 当班里程碑（参考信息，取不到不影响结论）
milestone=""
if command -v glab >/dev/null 2>&1; then
  milestone=$(glab api --hostname gitlab.ops.modelgo.com "groups/87/milestones?state=active&per_page=50" 2>/dev/null \
    | python3 -c 'import json,sys
try:
  ms=[m for m in json.load(sys.stdin) if "-Train-" in m["title"]]
  ms.sort(key=lambda m: m.get("due_date") or "")
  print(" / ".join("%s（到期 %s）" % (m["title"], m.get("due_date") or "?") for m in ms))
except Exception: pass' 2>/dev/null || true)
fi

if [ -n "$open_release" ]; then
  mode="train"; base="origin/$open_release"; targets="$open_release"
  next="合入 ${open_release} 后保持「进行中」；版本分支何时进 test、何时交 QA 由 owner 按班车节奏定"
  branch_fmt="fix/<iid>-<简述> 或 feature/<版本>-<简述>"
else
  mode="hotfix"; base="origin/main"; targets="test,main"
  next="MR→test 合并 + Jenkins 部署测试环境并核对 version.json 后，挪「待验证」；QA 在测试环境验过会改成「待上线」——看到「待上线」才合 MR→main、打 tag release-YYYYMMDD-N、发 cn + intl 生产（agent 可代办）"
  branch_fmt="hotfix/<iid>-<简述>（一单一分支）"
fi

if [ "$JSON" -eq 1 ]; then
  python3 -c 'import json,sys
print(json.dumps(dict(zip(["mode","base","targets","branch","next_status","open_release","milestones"], sys.argv[1:])), ensure_ascii=False))' \
    "$mode" "$base" "$targets" "$branch_fmt" "$next" "$open_release" "$milestone"
  exit 0
fi

echo "📦 发版模式：$([ "$mode" = hotfix ] && echo 'hotfix 线上修复（本仓没有在开的班车）' || echo "班车在开：$open_release")"
echo "   切分支：  git switch -c ${branch_fmt} $base"
if [ "$mode" = hotfix ]; then
  echo "   开 MR：   → test（先合，测试环境验）+ → main（只开不合，等单子变「待上线」）；两个 MR 别设 remove_source_branch"
else
  echo "   开 MR：   → $open_release"
fi
echo "   单子状态：$next"
[ -n "$milestone" ] && echo "   参考：GitLab 进行中的班车里程碑 ${milestone}（本仓未开对应 release 分支前不改变上面的结论）"
echo "   红线：test 禁止合 main（只进不出）"
