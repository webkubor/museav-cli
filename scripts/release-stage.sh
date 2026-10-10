#!/usr/bin/env bash
# 当前发版模式（只读）：这张单该从哪切、MR 合到哪、测试环境部署后挪什么状态。
#
# 为什么是脚本不是文档：CLAUDE.md 里曾写死「1.0.7 开发中 → 做完保持进行中」，1.0.7 上线后
# 没人改，agent 照着它从已发车的 release/v1.0.7 切分支（2026-10-08 Codex 实例）。阶段是会变的
# 事实，只能现查，不能抄进文档。
#
# 判据（按顺序，第一条命中即定）：
#   1. 本仓有 origin/release/vX.Y.Z* 带着 main 没有的非合并提交 → 班车在开，新单投这条 release
#   2. 否则 → hotfix 模式：从 origin/main 切 hotfix/<iid>-<简述>，MR → test 验证，再 MR → main 上线
# GitLab 上的 V*-Train-* 里程碑只作参考展示：里程碑会先于分支建好（2026-10-08 实况：
# V1.0.8 里程碑 active，但本仓未开 release/v1.0.8），**本仓开没开 release 分支才是准绳**。
#
# ── 多条 release 同时开着时，怎么定「当前要发的」──────────────────────
# 🔴 2026-10-10 教训：原实现是「遍历候选、最后一个 ahead>0 的覆盖前面的」，也就是选中谁
# 纯看 `sort -V` 的字符串序。当天 `release/v1.0.8-pre`（Pre-Train）与 `release/v1.0.8`
# （正式 Train）同时开着，恰好 `-pre` 排在后面才蒙对；换一天就会静默选错 —— 而且输出里
# 只有一条，人根本看不出还有另一条车。
#
# 真实口径（owner 2026-10-10）：**同一时刻只有一条是当前要发的，按时序来**。
# 时序的机械载体就是班次里程碑的 `due_date`：
#     release/vX.Y.Z-pre  ↔  VX.Y.Z-Pre-Train-*（先发）
#     release/vX.Y.Z      ↔  VX.Y.Z-Train-*    （后发）
# 所以按 due_date 升序取最早的一条，并把**全部候选连同各自到期日打出来**。
#
# 用法：bash scripts/release-stage.sh            # 人读
#       bash scripts/release-stage.sh --json     # agent 读（含 candidates）
#       RELEASE_STAGE_NO_FETCH=1 bash scripts/release-stage.sh   # 离线 / 测试时跳过 git fetch
set -euo pipefail

JSON=0
[ "${1:-}" = "--json" ] && JSON=1

cd "$(git rev-parse --show-toplevel)"
[ -n "${RELEASE_STAGE_NO_FETCH:-}" ] || git fetch -q origin --prune 2>/dev/null || echo "⚠️  git fetch 失败，以下基于本地缓存的远端分支" >&2

# ── 候选：ahead(main) > 0 的 release 分支 ─────────────────────────────
# 只数非合并提交：release 回流 main 时会留下合并提交，那不代表有未上线的功能。
cands=()
for ref in $(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/release/v*'); do
  ahead=$(git rev-list --count --no-merges "origin/main..$ref")
  [ "$ahead" -gt 0 ] && cands+=("${ref#origin/} $ahead")
done

# 当班里程碑：既是展示，也是多分支时的**定序依据**
ms_json=""
if command -v glab >/dev/null 2>&1; then
  ms_json=$(glab api --hostname gitlab.ops.modelgo.com "groups/87/milestones?state=active&per_page=50" 2>/dev/null || true)
fi
milestone=$(printf '%s' "$ms_json" | python3 -c 'import json,sys
try:
  ms=[m for m in json.load(sys.stdin) if "-Train-" in m["title"]]
  ms.sort(key=lambda m: m.get("due_date") or "")
  print(" / ".join("%s（到期 %s）" % (m["title"], m.get("due_date") or "?") for m in ms))
except Exception: pass' 2>/dev/null || true)

# ── 定序：due_date 最早者 = 当前要发的 ────────────────────────────────
# 取不到里程碑的候选排最后（9999-99-99 兜底）并在展示里标 `?` —— 不假装知道它的时序。
open_release=""
cand_rows=""
if [ "${#cands[@]}" -gt 0 ]; then
  resolved=$(python3 - "$ms_json" "${cands[@]}" <<'PY'
import json, sys
ms = json.loads(sys.argv[1]) if sys.argv[1].strip() else []

def due_of(branch):
    """分支名 → (due_date, 里程碑标题)。对应关系见文件头注释。"""
    v = branch.split('/', 1)[-1]                     # v1.0.8-pre
    is_pre = v.endswith('-pre')
    ver = v[:-4] if is_pre else v                    # v1.0.8
    prefix = 'V' + ver[1:] + ('-Pre-Train-' if is_pre else '-Train-')
    for m in ms:
        if m['title'].startswith(prefix):
            return m.get('due_date') or '9999-99-99', m['title']
    return '9999-99-99', '-'

rows = []
for item in sys.argv[2:]:
    branch, ahead = item.split()
    due, title = due_of(branch)
    rows.append((due, branch, ahead, title))
rows.sort(key=lambda r: (r[0], r[1]))
for due, branch, ahead, title in rows:
    print('CAND\t%s\t%s\t%s\t%s' % (branch, ahead, due if due != '9999-99-99' else '?', title))
print('PICK\t%s\t%s' % (rows[0][1], rows[0][0] if rows[0][0] != '9999-99-99' else '?'))
PY
)
  while IFS=$'\t' read -r tag f1 f2 f3 f4; do
    case "$tag" in
      CAND) cand_rows+="${f1}|${f2}|${f3}|${f4}"$'\n' ;;
      PICK) open_release="$f1"; pick_due="$f2" ;;
    esac
  done <<< "$resolved"
fi
# 到期日全取不到时，上面的「取最早」退化成按分支名排序 —— 那是**兜底不是判据**。
# 2026-10-10 实测这个兜底恰好会选错（`v1.0.8` 排在 `v1.0.8-pre` 前面，而今天要发的是 -pre），
# 所以这种情况必须显式降级提示，不能给一个看起来同样笃定的结论。
pick_undecided=0
[ -n "$open_release" ] && [ "${pick_due:-}" = "?" ] && [ "$(printf '%s' "$cand_rows" | grep -c . || true)" -gt 1 ] && pick_undecided=1

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
cands=[]
for row in sys.argv[8].splitlines():
    if not row.strip(): continue
    br,ahead,due,title=row.split("|")
    cands.append({"branch":br,"ahead":int(ahead),"due":due,"milestone":title})
d=dict(zip(["mode","base","targets","branch","next_status","open_release","milestones"], sys.argv[1:8]))
d["candidates"]=cands
print(json.dumps(d, ensure_ascii=False))' \
    "$mode" "$base" "$targets" "$branch_fmt" "$next" "$open_release" "$milestone" "$cand_rows"
  exit 0
fi

echo "📦 发版模式：$([ "$mode" = hotfix ] && echo 'hotfix 线上修复（本仓没有在开的班车）' || echo "班车在开：$open_release")"
if [ -n "$cand_rows" ]; then
  n=$(printf '%s' "$cand_rows" | grep -c . || true)
  if [ "$pick_undecided" -eq 1 ]; then
    echo "   🔴 拿不到班次里程碑到期日，**无法按时序判定哪条是当前要发的**。"
    echo "      $n 条候选全部列出；下面的选择只是按分支名兜底（可能是错的），务必人工确认："
  elif [ "$n" -gt 1 ]; then
    echo "   ⚠️  同时有 $n 条 release 分支开着，按班次到期日取最早的一条（= 当前要发的）："
  else
    echo "   候选 release 分支："
  fi
  printf '%s' "$cand_rows" | while IFS='|' read -r br ahead due title; do
    [ -z "$br" ] && continue
    mark="     "
    [ "$br" = "$open_release" ] && mark="   → "
    printf "%s%-26s ahead=%-4s 到期=%-12s %s\n" "$mark" "$br" "$ahead" "$due" "$title"
  done
  if [ "$pick_undecided" -eq 1 ]; then
    echo "      ⇒ 兜底选中 $open_release 但**未经验证**；跑一次带网络的脚本，或直接问 owner 今天发哪条。"
  elif [ "$n" -gt 1 ]; then
    echo "      （要发另一条请显式说明，别默认按这条走）"
  fi
fi
echo "   切分支：  git switch -c ${branch_fmt} $base"
if [ "$mode" = hotfix ]; then
  echo "   开 MR：   → test（先合，测试环境验）+ → main（只开不合，等单子变「待上线」）；两个 MR 别设 remove_source_branch"
else
  echo "   开 MR：   → $open_release"
fi
echo "   单子状态：$next"
[ -n "$milestone" ] && echo "   参考：GitLab 进行中的班车里程碑 ${milestone}"
echo "   红线：test 禁止合 main（只进不出）"
