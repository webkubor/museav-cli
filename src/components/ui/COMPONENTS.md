<!-- 本文件由 scripts/gen-ui-inventory.mjs 生成，别手改：`node scripts/gen-ui-inventory.mjs` -->

# 现成组件清单（src/components/ui）

**写任何 UI 前先在这里搜一遍。** 手写一个已经存在的组件，比写得丑更糟：
样式会分叉、主题会漏一套、无障碍会缺、下次改规范时改不到你这份。

搜的时候用**能力词**而不是组件名 —— 你要的东西常常是某个组件的一个 prop：
想要「进度条流光」搜 `流光`（是 `ProgressBar` 的 `flow`），想要「毛玻璃浮层」搜 `玻璃`。
组件之外还有两类现成资产：CSS 工具类（`.mg-tile` 卡片 / `.mg-float` 浮层玻璃，见 `src/styles/components.css`）
和设计 token（`modelgo-design-tokens` + `src/styles/tokens.css`）。

共 42 个组件文件。

## Avatar

`src/components/ui/Avatar.tsx`

现代高颜值 Avatar 头像组件 (基于 Radix UI Avatar Primitive) 职责：替代原有的 Avatar，支持防闪烁的图像懒加载以及优雅的缩写备用文本 (Fallback)

同文件还导出：`AvatarImage` · `AvatarFallback`

## AvatarUpload

`src/components/ui/AvatarUpload.tsx`

## Badge

`src/components/ui/Badge.tsx`

## Breadcrumb

`src/components/ui/Breadcrumb.tsx`

高阶 Web3 质感胶囊面包屑导航组件 职责：展示当前页面在系统层级中的位置，并支持点击跳转与 Hover 物理微动效

## Button

`src/components/ui/Button.tsx`

极简现代高颜值 Button 组件 职责：提供高度自适应、动效优雅、符合折中样式的 shadcn 风格 Button 依赖：class-variance-authority, cn 工具函数 import * as Re

可选值：
- `htmlType`: `submit` | `button` | `reset`
- `size`: `icon` | `default` | `xs` | `sm` | `lg` | `xl` | `small` | `large`
- `variant`: `default` | `destructive` | `outline` | `secondary` | `ghost` | `link` | `glass` | `brand`
- `type`: `submit` | `button` | `reset` | `primary` | `secondary` | `danger` | `tertiary`

## Calendar

`src/components/ui/Calendar.tsx`

值得知道的 props：
- `defaultDate` — 初始展示的年月取这个日期（YYYY-MM-DD）；不传用今天
- `dayState` — 每天的状态（选中 / 区间内 / 禁用），语义由调用方定
- `onSelectDate` — 点击某天；disabled 的日期不会触发

## Card

`src/components/ui/Card.tsx`

现代高颜值 Card 组件 职责：提供统一的内容容器，支持阴影、边框、玻璃拟态及悬停动效

同文件还导出：`CardHeader` · `CardFooter` · `CardTitle` · `CardDescription` · `CardContent`

## CodeBlock

`src/components/ui/CodeBlock.tsx`

追加/覆盖样式，如 max-h-72、w-full 等 */ className?: string } 通用代码 / payload 展示块

值得知道的 props：
- `className` — 追加/覆盖样式，如 max-h-72、w-full 等

## Combobox

`src/components/ui/Combobox.tsx`

值得知道的 props：
- `keywords` — 额外参与搜索匹配的隐藏关键字（如 model_id、邮箱、掩码 key）
- `size` — 尺寸档位：sm(32) 面板内 / md(40) 默认。与 ui/Select 同一套 token

## Composer

`src/components/ui/Composer.tsx`

值得知道的 props：
- `onClear` — 省略时不展示"清空"按钮（如 PRD 要求某些工作台不展示清空入口时留空）
- `textareaSlot` — 语音识别任务用一句静态提示替换掉文本框（PRD App.tsx:18498 逐字对齐）

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

## DateTimePicker

`src/components/ui/DateTimePicker.tsx`

值得知道的 props：
- `value` — `YYYY-MM-DDTHH:mm`（本地时区）；空串表示未选

## Dialog

`src/components/ui/Dialog.tsx`

现代高颜值 Dialog 组件 (基于 Radix UI Dialog Primitive) 职责：替代原有的 Modal，提供极其柔和的磨砂遮罩、中心滑入微动效、及标准的对话框骨架

同文件还导出：`DialogPortal` · `DialogOverlay` · `DialogClose` · `DialogTrigger` · `DialogContent` · `DialogHeader` · `DialogFooter` · `DialogTitle` · `DialogDescription`

## DropdownMenu

`src/components/ui/DropdownMenu.tsx`

同文件还导出：`DropdownMenuContent` · `DropdownMenuItem` · `DropdownMenuSeparator` · `DropdownMenuTrigger` · `DropdownMenuGroup` · `DropdownMenuPortal`

## EmptyState

`src/components/ui/EmptyState.tsx`

## ErrorBoundary

`src/components/ui/ErrorBoundary.tsx`

变化时重置错误态（如路由 pathname 变化，切页后自动恢复） */ resetKey?: string 自定义降级 UI

值得知道的 props：
- `resetKey` — 变化时重置错误态（如路由 pathname 变化，切页后自动恢复）
- `fallback` — 自定义降级 UI；不传用默认卡片

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
- `children` — 自定义触发器（不传则为 ⓘ 图标）。触发器自己负责可聚焦与点击行为
- `id` — 气泡元素 id，供自定义触发器 aria-describedby 关联
- `side` — 气泡方位：默认 top

## Input

`src/components/ui/Input.tsx`

极简现代高颜值 Input 组件 职责：提供高度自适应、带 Focus 品牌环发光的标准 Input，高阶支持前缀与后缀元素 依赖：cn 工具函数 ── 尺寸即格式约束（2026-09-04 控件统一）─────────

可选值：
- `variant`: `default` | `search`

值得知道的 props：
- `size` — 尺寸档位：sm(32) 面板内 / md(40) 工具栏默认 / lg(48) 公共主搜索。高度+内距成套，页面不可覆盖

## KpiCard

`src/components/ui/KpiCard.tsx`

## MarkdownContent

`src/components/ui/MarkdownContent.tsx`

值得知道的 props：
- `children` — 原始 markdown 文本
- `className` — 额外类名，叠加在 .cs-markdown 之上
- `components` — 调用方可覆盖/追加节点渲染（如模型体验把 a 换成走 SPA 导航的 MessageLink）
- `linkifyBareUrls` — 需要可点击裸 URL 的场景显式开启；默认仍按普通文本显示。

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

## Select

`src/components/ui/Select.tsx`

同文件还导出：`SelectRoot` · `SelectGroup` · `SelectValue` · `SelectTrigger` · `SelectContent` · `SelectLabel` · `SelectItem` · `SelectSeparator` · `SelectScrollUpButton` · `SelectScrollDownButton`

值得知道的 props：
- `size` — 尺寸档位：sm(32) 面板内 / md(40) 默认。高度+图标成套走 token，页面类覆盖不生效

## Sheet

`src/components/ui/Sheet.tsx`

现代高颜值 Sheet 侧抽屉组件 职责：替代原有的 SideSheet，支持左、右、上、下四个维度的抽屉划出交互

同文件还导出：`SheetPortal` · `SheetOverlay` · `SheetTrigger` · `SheetClose` · `SheetContent` · `SheetHeader` · `SheetFooter` · `SheetTitle` · `SheetDescription`

## SideSheet

`src/components/ui/SideSheet.tsx`

可选值：
- `side`: `left` | `right`

## StatusBadge

`src/components/ui/StatusBadge.tsx`

## Switch

`src/components/ui/Switch.tsx`

值得知道的 props：
- `onChange` — Alias for onCheckedChange

## Table

`src/components/ui/Table.tsx`

现代高颜值 Table 组件 职责：提供高度统一、响应式优秀且美观的数据展示表格

同文件还导出：`TableHeader` · `TableBody` · `TableFooter` · `TableRow` · `TableHead` · `TableCell` · `TableCaption`

## Tabs

`src/components/ui/Tabs.tsx`

同文件还导出：`TabsList` · `TabsTrigger` · `TabsContent`

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

## Textarea

`src/components/ui/Textarea.tsx`

现代高颜值 Textarea 多行输入框组件 职责：提供与 Input 完全统一的发光聚焦环、高感圆角和响应式状态的多行文本域

## TiltCard

`src/components/ui/TiltCard.tsx`

3D 倾斜卡壳：包住任意卡片内容，鼠标跟随做轻微 3D 倾斜（纯 CSS transform，零依赖、GPU 合成、不掉帧）

## TruncatedText

`src/components/ui/TruncatedText.tsx`

单行截断文本（全站数据表长文本统一治理）： 表格里渲染用户自由文本（姓名 / 邮箱 / 名称 / 描述 / 标题等可能超长的字符串）时统一用它， 超出 maxWidth 省略号截断 + hover 原生 title 显全

值得知道的 props：
- `maxWidth` — 最大宽度（px），超出截断。按列内容合理取值
- `placeholder` — 空值占位，默认「—」
