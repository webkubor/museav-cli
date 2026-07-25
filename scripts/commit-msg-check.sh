#!/usr/bin/env sh
# scripts/commit-msg-check.sh
# ───────────────────────────────────────────────────────────────
# 提交消息强制校验 · SSOT = `cs rule commit_convention`
# 所有 agent（Claude / Codex / 人工）统一遵守，从根上杜绝格式漂移。
#
# 规则（详见 cs rule commit_convention）：
#   1. 格式：type(scope): 中文动宾描述
#      type ∈ feat|fix|refactor|chore|docs|style|test|ci|perf|merge
#   2. 描述一律中文（禁止纯英文 commit）；工具名/路径/接口可保留原样
#   3. 任务修复（fix/feat）建议挂 #单号，便于追溯
#   4. 合并提交（MERGE_HEAD 存在）豁免
#
# 用法：
#   .git/hooks/commit-msg <msg-file>   （git 自动调用）
#   bash scripts/commit-msg-check.sh    （手动校验当前 COMMIT_EDITMSG）
# ───────────────────────────────────────────────────────────────

MSG_FILE="${1:-$(git rev-parse --git-dir)/COMMIT_EDITMSG}"
[ -f "$MSG_FILE" ] || exit 0

# 取首个非空、非注释行作为 subject
SUBJECT=""
while IFS= read -r line; do
  case "$line" in
    ''|'#'*) continue ;;
  esac
  SUBJECT="$line"
  break
done < "$MSG_FILE"

[ -z "$SUBJECT" ] && exit 0

# 合并提交豁免
if [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
  exit 0
fi

# 1) 格式校验：type(scope): 描述
if ! printf '%s' "$SUBJECT" | grep -Eq '^(feat|fix|refactor|chore|docs|style|test|ci|perf|merge)(\(.+\))?!?:\s+.+'; then
  echo "❌ 提交消息格式不合规（应遵守 cs rule commit_convention）"
  echo "   正确格式: type(scope): 中文动宾描述"
  echo "   示例:     fix(api-keys): 列表限额列保留 period_length（#237）"
  echo "   当前提交: $SUBJECT"
  echo "   👉 改法：feat/fix/... + 中文描述；任务单挂 #单号"
  exit 1
fi

# 2) 必须含中文（禁止纯英文 commit）
if ! printf '%s' "$SUBJECT" | grep -qE '[一-鿿]'; then
  echo "❌ 提交描述必须含中文（cs: 禁止英文 commit）"
  echo "   当前提交: $SUBJECT"
  echo "   👉 工具名/路径/接口可保留英文，但描述须中文"
  exit 1
fi

# 3) fix/feat 建议关联任务单号（警告，不阻断）
TYPE="$(printf '%s' "$SUBJECT" | sed -E 's/^([a-z]+)(\(.+\))?!?:.*/\1/')"
if { [ "$TYPE" = "fix" ] || [ "$TYPE" = "feat" ]; } && ! printf '%s' "$SUBJECT" | grep -qE '#[0-9]+'; then
  echo "⚠️  提醒: $TYPE 类提交建议关联任务单号（#单号），便于追溯与看板联动"
fi

exit 0
