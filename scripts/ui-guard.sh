#!/usr/bin/env bash
# UI 门禁 —— 提交期硬拦 UI 约定违规（真源：DESIGN.md）。
# 由 agentGit({ precommit }) 调用；也可本地手动跑。
#
# 用法：
#   sh scripts/ui-guard.sh            # 检查 git 暂存区的 .ts/.tsx
#   sh scripts/ui-guard.sh <file...>  # 检查指定文件（便于本地自测）
#
# 退出码：0 通过（可能有 warn）；1 有硬性违规（block）阻断提交。
set -uo pipefail

block=0
warn=0

if [ "$#" -gt 0 ]; then
  MODE=args
  file_list="$(printf '%s\n' "$@")"
else
  MODE=staged
  file_list="$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(tsx|ts)$' || true)"
fi

if [ -z "$file_list" ]; then
  echo "[ui-guard] 无 TS/TSX 变更，跳过"
  exit 0
fi

get_content() {
  if [ "$MODE" = args ]; then cat "$1" 2>/dev/null; else git show ":$1" 2>/dev/null; fi
}

# 只取本次改动的「新增行」（staged diff 里 + 开头的行，去掉 +++ 头）。
# 用于「防新增」类规则：存量违规不阻断，但新写的违规当场拦。args 模式无 diff，回退全文件。
get_added() {
  if [ "$MODE" = args ]; then
    cat "$1" 2>/dev/null
  else
    git diff --cached -U0 --diff-filter=ACM -- "$1" 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+' | sed 's/^+//'
  fi
}

while IFS= read -r f; do
  [ -n "$f" ] || continue
  content="$(get_content "$f")"
  [ -n "$content" ] || continue

  # ── BLOCK 1：越级圆角。rounded-xl/2xl/3xl 在本项目被 @theme 置 initial（=直角），
  #    DESIGN.md 只认 rounded-sm(8)/md(14)/lg(18)/full。
  hits="$(printf '%s' "$content" | grep -nE '\brounded-(xl|2xl|3xl)\b' || true)"
  if [ -n "$hits" ]; then
    echo "✗ [圆角越级] $f — rounded-xl/2xl/3xl 是禁用刻度（渲染成直角），改用 rounded-sm/md/lg（DESIGN.md · Shapes）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    block=$((block + 1))
  fi

  # ── BLOCK 2：图标库越界。只允许 react-icons（通用）与 @lobehub/icons（模型/品牌 logo）。
  hits="$(printf '%s' "$content" | grep -nE "from ['\"](lucide-react|@ant-design/icons|@heroicons/|@icon-park/|@mui/icons)" || true)"
  if [ -n "$hits" ]; then
    echo "✗ [图标库越界] $f — 图标只用 react-icons 或 @lobehub/icons"
    printf '%s\n' "$hits" | sed 's/^/      /'
    block=$((block + 1))
  fi

  # ── WARN 1：疑似自写品牌按钮。主操作应 <Button variant="brand">，禁止手写 <button className="bg-brand-*">。
  # 只认「实底」bg-brand-base/deep（后面不接 /opacity），tint 如 bg-brand-base/12 是合法点缀，放行
  if printf '%s' "$content" | grep -q '<button' && printf '%s' "$content" | grep -qE 'bg-brand-(base|deep)($|[^/])'; then
    echo "⚠ [疑似自写品牌按钮] $f — 主操作用 <Button variant=\"brand\">，勿手写 <button className=\"bg-brand-*\">（DESIGN.md · Components）"
    warn=$((warn + 1))
  fi

  # ── WARN 2：疑似拿 3.5% 填充当卡片。卡片应 .mg-tile（白底+边框+阴影）。
  # 排除分段切换器轨道（gap-1 + p-1 同现）——那是官方 SegmentedToggle 的正确写法，非假卡片；
  # 卡片用 p-3/4/5/6，不会 p-1，故此签名可稳定区分。
  hits="$(printf '%s' "$content" | grep -nE 'bg-mg-fill-0' | grep -E 'rounded|border' | grep -vE '(gap-1.*p-1)|(p-1.*gap-1)' || true)"
  if [ -n "$hits" ]; then
    echo "⚠ [疑似 fill 当卡片] $f — 卡片用 .mg-tile，别拿 bg-mg-fill-0 凑层次（DESIGN.md · Elevation）"
    warn=$((warn + 1))
  fi

  # ── WARN 3：疑似手写复制按钮。复制交互统一用 <CopyButton>（收口 useCopy + 反馈 + toast），
  #    别再各页手搓复制图标/按钮。特殊场景（如 API Key 惰性 reveal 复制）可无视本条。
  case "$f" in
    */components/ui/CopyButton.tsx|*/hooks/use-copy.ts) ;;  # 组件自身与 hook 放行
    *)
      if printf '%s' "$content" | grep -qE '\bLuCopy\b' && ! printf '%s' "$content" | grep -q 'CopyButton'; then
        echo "⚠ [疑似手写复制按钮] $f — 复制交互统一用 <CopyButton>（DESIGN.md · Components）"
        warn=$((warn + 1))
      fi
      ;;
  esac

  # ── 以下为「防新增」规则：只扫本次新增行，存量不阻断（治「一个个发现太慢」，让机器挡新债） ──
  added="$(get_added "$f")"

  # BLOCK 3：内联 style 里写 CSS 变量 token。应走 Tailwind 类（text-mg-*/bg-mg-*/border-mg-*），
  #    否则绕过 token 体系、双主题/双端不自适应（治 OAuthBindingTab 那种整片内联 style 的老坑）。
  hits="$(printf '%s' "$added" | grep -nE ":[[:space:]]*['\"]var\(--(mg|brand|go|cn)-" || true)"
  if [ -n "$hits" ]; then
    echo "✗ [内联 style token] $f — 别在 style={{}} 里写 var(--mg-*/--brand-*)，改用 Tailwind 类（text-mg-text-2 / bg-mg-bg-1 / border-mg-border 等）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    block=$((block + 1))
  fi

  # BLOCK 4：内联 style 裸数值圆角（borderRadius: 8 / '8px'）。圆角只认 rounded-sm/md/lg/full token。
  hits="$(printf '%s' "$added" | grep -nE "borderRadius:[[:space:]]*['\"]?[0-9]" || true)"
  if [ -n "$hits" ]; then
    echo "✗ [内联裸圆角] $f — 别用 style borderRadius 裸值，用 rounded-sm/md/lg/full（DESIGN.md · Shapes）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    block=$((block + 1))
  fi

  # WARN 4：疑似手写卡片（同行 border-mg-border + shadow-sm/md）。卡片统一 .mg-tile / <Card>
  #    （已绑 --mg-card-* Apple 卡片语言）；别再手写 border+shadow 拼卡致风格漂移。
  hits="$(printf '%s' "$added" | grep -nE 'border-mg-border' | grep -E 'shadow-(sm|md)' | grep -vE 'mg-tile' || true)"
  if [ -n "$hits" ]; then
    echo "⚠ [疑似手写卡片] $f — 卡片统一用 .mg-tile 或 <Card>，别手写 border-mg-border+shadow 拼卡（DESIGN.md · Card）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    warn=$((warn + 1))
  fi
done <<EOF
$file_list
EOF

echo ""
echo "[ui-guard] block=$block warn=$warn"
if [ "$block" -gt 0 ]; then
  echo "UI 门禁拦截：$block 项硬性违规，修复后再提交（warn 不阻断，但建议一并处理）。"
  exit 1
fi
exit 0
