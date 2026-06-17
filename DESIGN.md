---
name: ModelGo Console
version: alpha
description: ModelGo 客户控制台设计系统。双端品牌（国内靛紫 / 海外翠绿）× 明暗双主题，所有视觉值以 CSS 变量为单一真源（src/styles/tokens.css）。YAML 值为「国内 / 浅色」默认态；双端与深色变体见 Colors 章节。
colors:
  # 品牌色（默认 = 国内靛紫浅色；data-market='global' 时整体路由到翠绿，见 prose）
  brand-base: "#6743fd"
  brand-deep: "#5433e8"
  brand-mid: "#8b6aff"
  brand-light: "#b8a4ff"
  brand-pale: "#f0ecff"
  brand-base-global: "#1DC39B"
  brand-deep-global: "#159b7c"
  # 主色 / 链接（跟随 brand-base，随市场切换）
  primary: "{colors.brand-base}"
  primary-hover: "{colors.brand-mid}"
  primary-active: "{colors.brand-deep}"
  link: "{colors.brand-base}"
  # 文字层级
  text-0: "#0f172a"
  text-1: "#475569"
  text-2: "#94a3b8"
  text-3: "#cbd5e1"
  # 背景层级
  bg-0: "#fbfbfe"
  bg-1: "#f4f5fb"
  bg-2: "#eceef7"
  bg-3: "#e1e4f0"
  # 边框 / 填充
  border: "rgba(71, 57, 146, 0.09)"
  fill-0: "rgba(103, 67, 253, 0.035)"
  fill-1: "rgba(103, 67, 253, 0.06)"
  fill-2: "rgba(103, 67, 253, 0.095)"
  # 语义状态色（明暗共用基调，禁止改色相）
  success: "#00d68f"
  danger: "#ef4444"
  warning: "#f59e0b"
  # 代码块
  code-bg: "#e9ecf1"
  code-text: "#1f2937"
typography:
  display:
    fontFamily: "Inter, PingFang SC, MiSans, HarmonyOS Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: 2rem
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, PingFang SC, MiSans, HarmonyOS Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 600
  body:
    fontFamily: "Inter, PingFang SC, MiSans, HarmonyOS Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.6
  label-caps:
    fontFamily: "Inter, PingFang SC, MiSans, HarmonyOS Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 700
    letterSpacing: "0.05em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace"
    fontSize: 12px
    fontFeature: "tabular-nums"
rounded:
  sm: 8px
  md: 14px
  lg: 18px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 36px
components:
  button-brand:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: 40px
  button-brand-hover:
    backgroundColor: "{colors.primary-hover}"
  button-brand-active:
    backgroundColor: "{colors.primary-active}"
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.text-1}"
    rounded: "{rounded.sm}"
    height: 36px
  button-outline-hover:
    backgroundColor: "{colors.fill-0}"
  card:
    backgroundColor: "{colors.bg-0}"
    textColor: "{colors.text-0}"
    rounded: "{rounded.lg}"
    padding: 24px
  input:
    backgroundColor: "{colors.fill-0}"
    textColor: "{colors.text-0}"
    rounded: "{rounded.sm}"
    height: 36px
  input-focus:
    backgroundColor: "{colors.bg-0}"
---

## Overview

> **设计身份（一句话）**：一套代码 × 两条视觉轴 —— **市场轴**（国内靛紫 / 海外翠绿 → 两个域名）× **主题轴**（深 / 浅），同一套 UX 设计语言，4 套外观全部由**单一 token 源**驱动。
>
> 「同一套语言」靠的是**只有一把尺**：所有视觉值收口到 `tokens.css` 一个源（圆角已物理单尺，见 Shapes），不存在框架默认刻度这第二把尺。

ModelGo 客户控制台（modelgo-console-web）的设计系统。设计目标：**反 AI 味、克制的高级感、严格的 token 驱动**。

两条独立的视觉轴，组合出 4 套外观，全部由 CSS 变量驱动（`src/styles/tokens.css`），切换时只改 `<html>` 的属性：

- **市场轴**（`data-market`）：`domestic` = 国内靛紫，`global` = 海外翠绿。`--brand-*` 是路由变量，指向当前市场的原色；组件永远引用 `--brand-*`，不直接写 `--cn-*` / `--go-*`。
- **主题轴**（`body[theme-mode]`）：浅色（默认）/ 深色（低饱和石墨灰，非纯黑）。

YAML front matter 里的值是 **「国内 + 浅色」** 默认态；其余三套的具体值在下面各章节说明，或直接查 `tokens.css`（设计值的唯一真源）。

## Colors

颜色分三层，**一律用语义 token，禁止硬编码 hex**：

1. **品牌色 `brand-*`**：`base` 主色、`deep` 按下/激活、`mid` 悬停、`light` 禁用、`pale` 浅底、`glow` 辉光、`selected-bg` 选中底。国内默认 `#6743fd`，海外 `#1DC39B`；深色模式各自降饱和/提亮（见 tokens.css）。**消费方只用 `--brand-base` 等，市场切换自动生效。**
2. **主色 / 链接 `primary` / `link`**：跟随 `brand-base`，含 hover/active/disabled。
3. **中性语义层 `mg-*`**：
   - 文字 `text-0`→`text-3`（主 / 次 / 辅助 / 禁用）
   - 背景 `bg-0`(卡) → `bg-3`(Modal/Tooltip 顶层)，外加 `site-bg`/`card-bg`
   - `border` / `fill-0..2`（填充用品牌色极低透明度，随市场微调色相）
4. **状态色 `success`/`danger`/`warning`**：绿 / 红 / 黄，**明暗共用、不可改色相**（属保留例外，见 Don'ts）。
5. **趋势色随市场反转**：国内「红涨绿跌」(`--mg-trend-up`=danger)，海外「绿涨红跌」。用 `--mg-trend-*`，别写死红绿。
6. **深色主题采用莫兰迪暖中性色系**：背景暖灰（#262429 → #433f48）、文字暖雾白（#e9e7e3 → #66625e）、语义色用鼠尾草绿 / 陶土红 / 赭黄（降饱和、去荧光感）、品牌色蒙灰后仍可辨识为靛紫 / 翠绿。

## Typography

- 正文/标题字体：**Inter → 中文系统优先（PingFang SC / MiSans / HarmonyOS Sans SC / Microsoft YaHei）→ system-ui**。已去掉 Outfit webfont，减少首屏字体加载体积。
- 数字、ID、金额、代码：**JetBrains Mono**（配合 `tabular-nums`，保证数字等宽对齐）。
- 常用层级：`display`（2rem 700，KPI 大数）、`title`（15px 600，卡标题）、`body`（13px，正文）、`label-caps`（11px 700 + 字距，分区小标题大写）、`mono`（12px，凭证/金额/时间）。
- 字号通过 Tailwind 工具类落地（如 `text-[13px]` / `text-sm`），上表为语义基准。
- **字体统一走 `--font-sans` / `--font-mono` token**（定义在 `src/styles/tokens.css`）。中文系统优先、不加载重型 CJK webfont（护首屏性能）。所有 CSS 文件中禁止直接写 `font-family` 字符串，一律引用这两个 token。

## Layout

- **页面节奏**：每页最外层容器统一 `space-y-6`（= `spacing.lg` 24px）或 `flex flex-col gap-6`。
- **页头**：每页用 `<PageHeader>` 组件，**自带 `mb-6`，禁止传 `className="mb-0"` 之类覆盖间距**——标题到首卡的标准间距由「PageHeader 的 mb-6 + 外层 space-y-6」叠加而来（历史上 5 个页面私自 mb-0 导致标题贴卡，已修）。
- **卡片内边距**：标准 `p-6`（24px）/ 移动端 `p-6`、桌面 `p-9`。
- **响应式**：紧凑布局须保留主操作，不得隐藏关键工作流。

## Elevation & Depth

- 阴影三级：`shadow-sm`（卡片默认）、`shadow-md`（悬浮/下拉）、`shadow-lg`（Modal/Tooltip）。深色模式改用与背景相融的柔和烟灰阴影 + 1px 高光描边，**不用硬黑阴影**。
- 焦点环：`--shadow-focus` = `0 0 0 3px var(--brand-glow)`。
- 层级背景对应深度：`bg-0`(卡) < `bg-2`(下拉) < `bg-3`(Modal)。

## Shapes

圆角 token：`sm` 8px（输入/小按钮/标签）、`md` 14px（中等内部块/容器/中控件）、`lg` 18px（卡片/面板/弹窗/抽屉/浮层）、`full` 9999px（品牌主按钮/胶囊/纯圆）。**禁止用裸数值圆角**，一律引用 `--radius-*`（Tailwind 类即 `rounded-sm/md/lg/full`，已由 `@theme` 绑到 token）。

**单尺铁律**：项目只有这 4 档圆角，**禁止使用 Tailwind 默认刻度** `rounded`(4)/`rounded-xl`(12)/`rounded-2xl`(16)/`rounded-3xl`(24) —— 它们是「第二把尺」，与 token 刻度并存即漂移。`@theme` 已 reset 掉这些默认刻度，写了等于无效类。

**元素 → 档位 迁移映射**（确定化，机械可执行）：

| 当前（第二把尺） | → 档位 | 元素归属 |
|---|---|---|
| `rounded-2xl`(16) · `rounded-3xl`(24) | **`rounded-lg`** (18) | 卡片 / 面板 / 弹窗 / 抽屉 / 下拉浮层 |
| `rounded-xl`(12) | **`rounded-md`** (14) | 中等内部块 / 次级容器 / 中等控件 |
| 裸 `rounded`(4) | **`rounded-sm`** (8) | 小元素 / 标签 / 内嵌小块 |
| `rounded-[Npx]` 任意值 | → 最近档位 | 按数值就近归并 |
| 品牌主按钮 / 胶囊 | **`rounded-full`** | 不变（既有规则） |
| 输入 / outline 按钮 / 标签 | **`rounded-sm`** | 不变（既有规则） |

## Components

- **Button**：主操作用 `variant="brand"`（品牌底 + 白字 + `rounded-full`，hover→mid、active→deep）；次级用 `variant="outline"`。禁止自写 `<button>` 替代。
- **Card**：`bg-0` + `border` + `rounded-lg`(18) + `shadow-sm`。操作型界面**不要嵌套卡片**、不要装饰性 card garden。
- **Input / Select / Table / Modal / Drawer / Tabs / Badge / Pagination / DateRangePicker**：一律用 `src/components/ui/*` 既有组件，保持 hover/focus/disabled/loading/empty/error 状态一致。
- **状态优先**：交互注册第一——路由/Tab 切换立即给反馈（骨架 + loading），不让用户干等请求。

## Do's and Don'ts

**Do**
- 一切颜色/圆角/间距用 token（`--mg-*` / `--brand-*` / `--radius-*`）。
- 品牌色只引用 `--brand-*`，让 `data-market` 自动路由双端。
- 复用 `src/components/ui/*` 与现有 Tabs/Table/Modal 等。
- 趋势涨跌用 `--mg-trend-*`（随市场反转）。

**Don't**
- ❌ 硬编码 hex / 裸数值圆角。**唯一例外**：语义状态色 green/red/yellow、`box-shadow` 里的 rgba。
- ❌ 直接写 `--cn-*` / `--go-*`（会锁死单一市场）。
- ❌ 给 `<PageHeader>` 传 `mb-0` 等覆盖间距。
- ❌ AI slop：通用渐变、玻璃拟态(glassmorphism)、发光暗色 UI、装饰性光球(orbs)、重复图标卡阵、模板化 hero metric。
- ❌ 用未安装的 UI 框架——本项目是 **Radix + 自有 ui 组件**，**不是 Semi**（CLAUDE.md 旧述已过时）。
- ❌ 在动画 canvas 上叠 `backdrop-filter: blur()`（持续重绘卡顿）。
