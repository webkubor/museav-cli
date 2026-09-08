<!-- 本文件由 scripts/gen-ui-inventory.mjs 生成，别手改：`node scripts/gen-ui-inventory.mjs` -->

# 现成组件清单（src/components/ui）

**写任何 UI 前先在这里搜一遍。** 手写一个已经存在的组件，比写得丑更糟：
样式会分叉、主题会漏一套、无障碍会缺、下次改规范时改不到你这份。

搜的时候用**能力词**而不是组件名 —— 你要的东西常常是某个组件的一个 prop：
想要「进度条流光」搜 `流光`（是 `ProgressBar` 的 `flow`），想要「毛玻璃浮层」搜 `玻璃`。
组件之外还有两类现成资产：CSS 工具类（`.mg-tile` 卡片 / `.mg-float` 浮层玻璃，见 `src/styles/components.css`）
和设计 token（`modelgo-design-tokens` + `src/styles/tokens.css`）。

共 25 个组件文件。

## AvatarUpload

`src/components/ui/AvatarUpload.tsx`

## Breadcrumb

`src/components/ui/Breadcrumb.tsx`

高阶 Web3 质感胶囊面包屑导航组件 职责：展示当前页面在系统层级中的位置，并支持点击跳转与 Hover 物理微动效

## CodeBlock

`src/components/ui/CodeBlock.tsx`

追加/覆盖样式，如 max-h-72、w-full 等 */ className?: string } 通用代码 / payload 展示块

值得知道的 props：
- `className` — 追加/覆盖样式，如 max-h-72、w-full 等

## ConfirmModal

`src/components/ui/ConfirmModal.tsx`

## CopyButton

`src/components/ui/CopyButton.tsx`

统一复制按钮 —— 全站「复制到剪贴板」交互的唯一真源 收口 useCopy + 反馈 + toast，禁止各页面再手写复制图标/按钮

值得知道的 props：
- `value` — 要复制的文本；为空时按钮 disabled。传了 getValue 时它只用于 disabled 判定与占位展示
- `variant` — icon=紧凑图标钮（默认）；labeled=带文字的强调按钮
- `size` — 尺寸：icon 变体控制方框/图标大小，labeled 变体透传给 Button
- `label` — labeled 变体的文字，默认「复制」
- `copiedLabel` — 复制成功后文字，默认「已复制」（labeled 变体用）
- `buttonVariant` — labeled 变体底色，默认 outline
- `toast` — 成功 toast 文案；传 false 则不弹 toast，只切图标反馈
- `onCopied` — 复制成功回调

## DateRangePicker

`src/components/ui/DateRangePicker.tsx`

## DropdownMenuContent

`src/components/ui/DropdownMenu.tsx`

同文件还导出：`DropdownMenuItem` · `DropdownMenuSeparator`

## EmptyState

`src/components/ui/EmptyState.tsx`

## FirstChargeLockGate

`src/components/ui/FirstChargeLockGate.tsx`

是否处于锁定态（未首充时为 true） */ locked: boolean 锁定态标题 */ title?: string 锁定态描述 */ desc?: string 去充值按钮文案 */ cta?: string

值得知道的 props：
- `locked` — 是否处于锁定态（未首充时为 true）
- `title` — 锁定态标题
- `desc` — 锁定态描述
- `cta` — 去充值按钮文案
- `className` — 占位高度样式（默认使用 --mg-empty-min-h）

## ForbiddenState

`src/components/ui/ForbiddenState.tsx`

无权访问的资源名，如「安全护栏」「API Keys」

值得知道的 props：
- `resource` — 无权访问的资源名，如「安全护栏」「API Keys」；用于文案「无权访问此工作空间的{resource}」
- `title` — 覆盖默认标题
- `description` — 覆盖默认说明
- `showBackHome` — 是否显示「返回总览」按钮（默认显示）

## InfoTip

`src/components/ui/InfoTip.tsx`

字段说明 ⓘ 小图标 + hover/focus 气泡（对齐 PRD 原型：部分字段后带 Info 提示）

值得知道的 props：
- `side` — 气泡方位：默认 top

## KpiCard

`src/components/ui/KpiCard.tsx`

## MarkdownContent

`src/components/ui/MarkdownContent.tsx`

值得知道的 props：
- `children` — 原始 markdown 文本
- `className` — 额外类名，叠加在 .cs-markdown 之上
- `components` — 调用方可覆盖/追加节点渲染（如模型体验把 a 换成走 SPA 导航的 MessageLink）

## Modal

`src/components/ui/Modal.tsx`

可选值：
- `size`: `sm` | `md` | `lg`

值得知道的 props：
- `closeButton` — 是否显示右上角关闭按钮，默认显示；强制类弹窗（如新版本强制更新）传 false 隐藏
- `onEscapeKeyDown` — 阻止 ESC/点击遮罩/外部交互关闭——强制类弹窗（手机号绑定等）用，配合 closeButton={false}

## Money

`src/components/ui/Money.tsx`

## OverflowTip

`src/components/ui/OverflowTip.tsx`

多行省略场景（外部 CSS 打了 `-webkit-line-clamp`）：把测量轴从宽换成高

## PageHeader

`src/components/ui/PageHeader.tsx`

## Pagination

`src/components/ui/Pagination.tsx`

值得知道的 props：
- `page` — 当前页码（从 1 开始，仅展示）
- `hasMore` — 是否有下一页
- `loading` — 翻页请求进行中，禁用按钮
- `total` — 当前筛选命中的总条数，可选展示「共 N 条」；与 pageSize 同传时页码显示 X / Y 总页数
- `pageSize` — 每页条数（传入即在左侧展示「每页 N 条」选择器）
- `pageSizeOptions` — 每页条数可选项，默认 [10, 15, 20, 50]
- `onPageSizeChange` — 每页条数变更回调；不传则不展示选择器

## Popover

`src/components/ui/Popover.tsx`

值得知道的 props：
- `content` — 内容；传函数可拿到 close()，用于点击「确定」后主动收起弹层

## ProgressBar

`src/components/ui/ProgressBar.tsx`

可选值：
- `variant`: `brand` | `rainbow` | `emerald` | `amber` | `blue`
- `size`: `xs` | `sm` | `md` | `lg`
- `labelPosition`: `top` | `bottom` | `right` | `none`
- `milestoneLayout`: `top` | `bottom`

值得知道的 props：
- `flow` — 填充条上叠一层流光扫过（"流动感"），复用全局 shimmer-slide keyframe

## SideSheet

`src/components/ui/SideSheet.tsx`

可选值：
- `side`: `left` | `right`

## StatusBadge

`src/components/ui/StatusBadge.tsx`

## TagInput

`src/components/ui/TagInput.tsx`

值得知道的 props：
- `disabled` — 不可再被选入（仍保留在列表里以便已选项能解析出 label），如已停用的 Key
- `value` — 受控值：选项模式下为各 option.value（id），自由文本/字符串建议模式下即原始字符串
- `suggestions` — 字符串建议模式：候选即最终值（如模型名）
- `options` — 选项模式：value 为 id、label 为展示名。传了它就按 id 工作，重名也不会绑错
- `splitPattern` — 批量分隔符（如 /[\s,;，；]+/）：提交时按其把一段文本拆成多个 tag——粘贴一串邮箱的场景
- `lockedValues` — 锁定的 tag：始终以 chip 展示、不可移除（无 × 按钮），如创建空间时的负责人
- `lockedBadge` — 锁定 chip 上展示的小标签文案（如「负责人」）；不传则仅隐藏移除按钮

## TiltCard

`src/components/ui/TiltCard.tsx`

3D 倾斜卡壳：包住任意卡片内容，鼠标跟随做轻微 3D 倾斜（纯 CSS transform，零依赖、GPU 合成、不掉帧）

## TruncatedText

`src/components/ui/TruncatedText.tsx`

单行截断文本（全站数据表长文本统一治理）： 表格里渲染用户自由文本（姓名 / 邮箱 / 名称 / 描述 / 标题等可能超长的字符串）时统一用它， 超出 maxWidth 省略号截断 + hover 原生 title 显全

值得知道的 props：
- `maxWidth` — 最大宽度（px），超出截断。按列内容合理取值
- `placeholder` — 空值占位，默认「—」
