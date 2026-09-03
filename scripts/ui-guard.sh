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

  # ── BLOCK 2：图标库越界。按用途三选一：
  #    · 模型/厂牌 logo → @model-go/icons（私有库，与运营后台共用同一份 vendor 映射）
  #    · 通用 UI 图标   → react-icons
  #    · @lobehub/icons → 仅限私有库还没收的第三方标识（OAuth 登录的 GitHub/Google/微信等）
  hits="$(printf '%s' "$content" | grep -nE "from ['\"](lucide-react|@ant-design/icons|@heroicons/|@icon-park/|@mui/icons)" || true)"
  if [ -n "$hits" ]; then
    echo "✗ [图标库越界] $f — 图标按用途选：模型/厂牌 logo 用 @model-go/icons，通用图标用 react-icons"
    printf '%s\n' "$hits" | sed 's/^/      /'
    block=$((block + 1))
  fi

  # ── WARN 0：模型/厂牌 logo 别直接 import @lobehub/icons。
  #    厂牌图标的真源是 @model-go/icons（含 vendor 别名索引与厂牌主色），渲染统一走 <ModelIcon>。
  #    直接 import 上游图标包会绕开别名索引 —— 这正是 #791 的成因（控制台与运营后台各写一份
  #    映射，运营选了控制台没 import 的图标，就静默掉到模型名推断，千问渲染成 OpenAI）。
  case "$f" in
    *features/models/*|*pages/models/*|*pages/models-compare/*)
      if printf '%s' "$content" | grep -q "from ['\"]@lobehub/icons"; then
        echo "⚠ [厂牌图标绕过私有库] $f — 模型/厂牌 logo 走 <ModelIcon> 或 @model-go/icons，别直接 import @lobehub/icons"
        warn=$((warn + 1))
      fi
      ;;
  esac

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

  # BLOCK 3：内联 style={{...}} 里写 CSS 变量 token。应走 Tailwind 类（text-mg-*/bg-mg-*/border-mg-*），
  #    否则绕过 token 体系、双主题/双端不自适应（治 OAuthBindingTab 那种整片内联 style 的老坑）。
  #    ⚠️ 只拦 style={{...}} 内的 token：recharts 的 tick/cursor/activeDot 等 SVG 属性对象
  #    （fill/stroke 传 var token）是 SVG presentation 值，套不上 Tailwind 类，属合法写法放行。
  #    perl 提取 style 块是因为 BSD grep 无 -P、且 style 对象常跨多行。
  style_blocks="$(printf '%s' "$added" | perl -0777 -ne 'while (/style=\{\{(?:(?!\}\}).)*?\}\}/sg) { print "$&\n" }' || true)"
  hits="$(printf '%s' "$style_blocks" | grep -nE "var\(--(mg|brand|go|cn)-" || true)"
  if [ -n "$hits" ]; then
    echo "✗ [内联 style token] $f — 别在 style={{}} 里写 var(--mg-*/--brand-*)，改用 Tailwind 类（text-mg-text-2 / bg-mg-bg-1 / border-mg-border 等）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    block=$((block + 1))
  fi

  # BLOCK 4：内联 style 裸数值圆角（borderRadius: 8 / '8px'）。圆角只认 rounded-sm/md/lg/full token。
  # 仅匹配单值 px/裸数字，并要求值后是属性分隔符；放行 50% 圆形与多值气泡圆角。
  hits="$(printf '%s' "$added" | grep -nE "borderRadius:[[:space:]]*['\"]?[0-9]+(\.[0-9]+)?(px)?['\"]?[[:space:]]*(,|})" || true)"
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

  # WARN 5：疑似手写模型首字母头像（拿 model 相关变量 slice(0,1)/charAt(0) 当图标）。
  #    模型身份统一走 <ModelIcon>（四层兜底：logo → lobehub 供应商图标 → 名称推断 → 首字母），
  #    这是反复出现的问题（模型体验单页/对比工作台都各自手写过），别再手搓文字色块替代。
  #    文件已 import ModelIcon 时放行（假定作者知情，这行只是极端兜底分支）。
  hits="$(printf '%s' "$added" | grep -niE 'model.*\.(slice\(0,[[:space:]]*1\)|charAt\(0\))\.toUpperCase\(\)' || true)"
  if [ -n "$hits" ] && ! printf '%s' "$content" | grep -q 'ModelIcon'; then
    echo "⚠ [疑似手写模型头像] $f — 模型身份统一用 <ModelIcon>（@/features/models/components/ModelIcon），别拿模型名首字母拼色块（DESIGN.md · Components）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    warn=$((warn + 1))
  fi
  # ── BLOCK 5：原生 <select>。它的下拉列表由**操作系统**渲染，我们的 CSS 一行都够不着：
  #    macOS 上是一层半透明系统材质，底下的页面文字会透出来，深色主题也不跟随。
  #    2026-09-03 模型发现页实测——需求方直接指出「居然还有系统弹窗」。
  #    统一用 @/components/ui/Select（Radix）：受控、可主题化、与全站浮层同一套质感。
  #    只认真正的 JSX：先剔掉注释行，否则"改用 Select 而不是原生 <select>"这类说明文字也被拦。
  hits="$(printf '%s' "$added" | grep -vE '^[[:space:]]*[{]?(//|/\*|\*)' | grep -nE '<select[[:space:]>]' || true)"
  if [ -n "$hits" ]; then
    echo "✗ [原生 select] $f — 下拉列表由系统渲染、CSS 管不到（半透明、不跟随主题），改用 @/components/ui/Select（DESIGN.md · Components）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    block=$((block + 1))
  fi

  # ── BLOCK 6：手写浮层。弹窗 / 下拉 / 气泡统一走 ui/ 下的 Popover、DropdownMenu、
  #    Select、Dialog、Modal、Sheet、SideSheet、Tooltip——它们统一了磨砂玻璃质感、
  #    z-index 层级、点击外部关闭、ESC 关闭与焦点管理。
  #    自写的浮层每次都要重新踩一遍：背景透读、层级压不住、键盘出不去
  #    （2026-09-03 需求方原话「每次浮窗都有问题，每次都要改」）。
  #    判据：新增行里出现 popover/dropdown/modal 类命名 + position:absolute/fixed 定位，
  #    且整个文件没有引用 ui/ 的任何浮层组件。
  #    `-modal` 不能裸写：`modality-bar`（模态导航）会被它命中，加上后缀边界排除。
  hits="$(printf '%s' "$added" | grep -vE '^[[:space:]]*[{]?(//|/\*|\*)' | grep -niE 'className=.[^"'"'"']*(popover|dropdown|-modal([^a-z]|$)|-dialog|flyout|tooltip)' || true)"
  if [ -n "$hits" ] && ! printf '%s' "$content" | grep -qE "from ['\"]@/components/ui/(Popover|DropdownMenu|Select|Dialog|Modal|Sheet|SideSheet|Tooltip|Combobox|ConfirmModal)"; then
    echo "⚠ [疑似手写浮层] $f — 弹窗/下拉/气泡走 @/components/ui 下的 Popover / DropdownMenu / Select / Dialog（统一玻璃质感 + 层级 + 外部点击与 ESC 关闭），别自己定位（DESIGN.md · Components）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    warn=$((warn + 1))
  fi

  # ── WARN 7：手写 tab / 分段控件。走 @/components/ui/Tabs 的 underline（导航）或
  #    pills（分段）变体——它管掉了 aria-selected / role=tablist、键盘左右切换、
  #    选中态与下划线动画。手搓的每次都少一样，最常见的是键盘不可用。
  hits="$(printf '%s' "$added" | grep -vE '^[[:space:]]*[{]?(//|/\*|\*)' | grep -niE 'className=.[^"'"'"']*(-tabs?([^a-z]|$)|tab-(list|item|bar)|segmented)' || true)"
  if [ -n "$hits" ] && ! printf '%s' "$content" | grep -qE "from ['\"]@/components/ui/Tabs"; then
    echo "⚠ [疑似手写 tab] $f — 导航/分段切换走 @/components/ui/Tabs（underline / pills 两个变体），它带 role=tablist + 键盘左右切换 + 选中态动画（DESIGN.md · Components）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    warn=$((warn + 1))
  fi

  # ── WARN 8：接口文本直接渲染、既不截断也不给 title。
  #    模型名、厂商名、描述这类长度由数据决定的字段，在固定宽度的列/卡片里必然溢出：
  #    「Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)」70 个字符。
  #    要么单行截断 + title 悬浮看全名，要么 line-clamp，不能放任它换行把行高撑乱
  #    （2026-09-03 需求方原话「很多文字加上很丑会换行」）。
  #    判据：同一行里把 .name/.description 这类字段塞进标签，且整行没有 title=、
  #    没有 truncate / line-clamp / OverflowTip。
  #    正则要求 `>{x.name}<` 这种「作为子节点渲染」的形态，避免把 key={model.name}、
  #    xLabel={axis.label} 这类 props 也算进来。
  hits="$(printf '%s' "$added" | grep -vE '^[[:space:]]*[{]?(//|/\*|\*)' | grep -nE '>\{[a-zA-Z_.]*\.(name|display_name|description)\}<' | grep -vE 'title=|truncate|line-clamp|OverflowTip|text-ellipsis|sr-only' || true)"
  if [ -n "$hits" ]; then
    echo "⚠ [长文本无溢出兜底] $f — 名称/描述这类长度由数据决定的字段，需单行截断 + title（或 line-clamp / <OverflowTip>），否则真实数据下会换行撑乱行高（DESIGN.md · Typography）"
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
