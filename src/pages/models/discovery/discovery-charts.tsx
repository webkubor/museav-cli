/**
 * 模型发现页的三张图表 —— Recharts 实现。
 *
 * 这三张图原先是手写 div + CSS 变量（柱高、点位、刻度全在 JS 里算好再塞进
 * `--bar-height` / `--point-left` 这类自定义属性）。接真实数据后手写方案的代价
 * 集中暴露：归一化要自己写、轴标签重叠要自己躲、响应式要自己算（曾把整页撑出
 * 182px 横向滚动）。改走 Recharts 后这些都由 ResponsiveContainer + scale 负责。
 *
 * 与 `src/pages/usage/usage-chart-histogram.tsx` 保持同一套写法：
 * ResponsiveContainer 包裹、颜色一律 CSS 变量、Tooltip 走自定义 content。
 *
 * ⚠️ 颜色只写变量名，具体色值在 discovery.css 的 `.model-discovery-page` 作用域里
 * 映射到控制台 token（`--accent` → `--brand-base`、`--line` → `--mg-border` …）。
 * 唯一的例外是厂牌色 `color`：它由调用方从 providerMarkColors 传进来，那张硬编码
 * 色表的存废是独立议题（见 ModelDiscoveryPagePrototype 里的说明），不在本次范围。
 */
import { useTranslation } from 'react-i18next'
import { useMemo, type KeyboardEvent, type ReactElement } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { agentFallback, agentVisual } from '@model-go/icons/agents'
import { specialtyBarDomain } from './discovery-data'

/**
 * 模型 / 厂牌标识 —— 走控制台统一的 `ModelIcon`（`@model-go/icons` 是 vendor
 * 别名索引与厂牌主色的唯一真源，与运营后台共用同一份）。
 *
 * 原型自带 `providerMarks`（42 条首字母）+ `providerMarkColors`（42 条硬编码色）
 * 两张表，那正是 ModelIcon 注释里记的那起事故的翻版：控制台与运营后台各写一份
 * vendor 映射，条目对不上，通义千问的 embedding 模型因此渲染出 OpenAI 图标。
 * 所以图标这块不做 1:1 —— 原型用首字母是因为它没有图标库，不是设计意图；
 * UI flow 文档 §3.1 也明确「模型/厂商身份用 ModelIcon」。
 *
 * 唯一例外是热门 Agent 排行：那里按 PRD 显示应用名首字符（Agent 应用不是模型，
 * 图标库里没有它们），走 agentVisual 的首字母兜底。
 */
export function DiscoveryModelIcon({ model, provider, className }: { model: string; provider: string; className?: string }) {
  return <ModelIcon className={className} model={{ display_name: model, provider }} rounded="rounded-sm" variant="dense" />
}

/**
 * 热门 Agent 榜的图标 —— 走图标库的三级兜底（`agentVisual`）。
 *
 * **视觉用什么图标由图标库决定，不由 PRD 决定**（owner 2026-09-14 定的边界）：
 * PRD 管数据口径与功能，图标属于设计体系的职责范围。
 *
 * 这里来回改过两次，把结论钉死免得再翻：
 * - 2026-09-03 改成库的品牌 SVG（对的方向），被 QA 以 #1004 报为 BUG 打回
 * - 2026-09-14 owner 明确「QA 出现了错误这不是 bug，视觉 logo 是图标库决定」，改回
 *
 * 三级：① 库里 131 个知名 agent 的本地矢量 → ② favicon → ③ 首字母块。
 * **跳过 favicon 这一级**：它要打 `t0.gstatic.com`，国内站取不到，会留下破图；
 * 库也支持传 `faviconBase` 走代理，等有了图片代理再开。
 */
export function DiscoveryAgentIcon({ id, name }: { id: string; name: string }) {
  const visual = agentVisual({ id, name })
  if (visual.kind === 'svg') {
    return (
      <i
        aria-hidden="true"
        // 尺寸/圆角/居中都在基础类里，SVG 态不需要额外修饰类
        className="model-discovery-agent-icon"
        // 库给的是内联 SVG 字符串（矢量、跟随深浅主题），没有外链与脚本
        dangerouslySetInnerHTML={{ __html: visual.svg }}
      />
    )
  }
  // favicon 一级在国内站取不到，与 initial 一样落首字母块：
  // 库负责首字母提取与按名字哈希的稳定配色（不会随排序闪烁），不是裸截 charAt(0)
  const fallback = visual.kind === 'initial' ? visual : agentFallback(name)
  return (
    <i
      aria-hidden="true"
      className="model-discovery-agent-icon is-initial"
      style={{ '--agent-mark-color': fallback.color } as React.CSSProperties}
    >
      {fallback.initial}
    </i>
  )
}

/**
 * 图表数据的入场时长，对应 `--discovery-dur-chart`（= --mg-duration-chart 0.9s）。
 *
 * Recharts 只吃数字，没法直接引 CSS 变量，改这里要同步改那个 token。
 * 原先是 420ms（--discovery-dur-enter），与 hover/展开这类交互反馈同档 —— 一闪而过，
 * 数量差还没看出来动画就结束了。交互要快、读数要慢，是两把尺子。
 */
const ENTER_DURATION = 900

/** 关掉动效偏好时不播入场，只给最终态 —— 与原先 CSS 里的 media query 等价。 */
function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * 图表内所有 tooltip 共用的外壳，样式在 discovery.css。
 *
 * ui-guard-ignore: 浮层 —— 这是 Recharts <Tooltip content={...}> 的**内容**，
 * 定位、显隐、跟随鼠标全由 Recharts 管，我们只提供内部排版。换成 ui/Popover
 * 反而会多出一层自己管开关的浮层，与图表的 hover 生命周期打架。
 */
function ChartTooltip({ children }: { children: React.ReactNode }) {
  // mg-float = 全站浮层玻璃表面（毛玻璃 + 遮挡下限，见 components.css / tokens.css #504）。
  // 这里只叠内部排版，表面不自持——自持过一版，用了 --panel(=--mg-bg-0，已并入玻璃是
  // 半透明) 又没有 backdrop-filter，tooltip 压在柱子上就是纯漏字：底下的数值标签
  // 透上来跟卡片里的文字叠在一起（2026-09-08 owner 截图）。tokens.css 第 168 行
  // 「浮层必须实底」记的就是这条，本处当时漏改。
  return <div className="mg-float model-discovery-chart-tooltip">{children}</div>
}

/* ────────────────────────────────────────────────────────────────
   专项指标排行柱图
   ──────────────────────────────────────────────────────────────── */

export interface SpecialtyChartRow {
  model: string
  provider: string
  /** 完整展示值，带单位（"$0.0656/次"），进 tooltip */
  value: string
  /** 柱内短标签，只留数字 */
  short: string
  /** 排序 / 柱高用的原始数值 */
  numeric: number
}

interface SpecialtyBarChartProps {
  rows: SpecialtyChartRow[]
  /** 榜单副标题，进 tooltip 的第二行 */
  description: string
  hoveredModel: string | null
  onHoverModel: (model: string | null) => void
  /** 该模型能否跳详情 —— 跳不了的不给 pointer 光标、不给 link 语义 */
  isClickable: (model: string) => boolean
  onOpenModel: (model: string) => void
}

/**
 * Recharts 对「基线以下」的柱子给的是**负 height**（默认 Rectangle 内部会自己翻转，
 * 自定义 shape 就得自己来）。不翻转的话负增长那根柱子高度是 0，等于从图上消失。
 */
function normalizeRect(y: number, height: number): { y: number; height: number } {
  return height < 0 ? { height: -height, y: y + height } : { height, y }
}

interface BarShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  index?: number
  payload?: SpecialtyChartRow
  description?: string
  hoveredModel?: string | null
  onHoverModel?: (model: string | null) => void
  isClickable?: (model: string) => boolean
  onOpenModel?: (model: string) => void
}

/**
 * 柱子本体。用自定义 shape 而不是默认 Rectangle，是为了保住手写版已有的可达性：
 * 默认 shape 渲染出来的 path 拿不到 role / tabIndex / onKeyDown，键盘用户就点不开
 * 详情了。颜色与圆角都交给 CSS（`.model-discovery-specialty-bar`），这里只出几何量。
 * 柱色按维度（卡片）区分：--specialty-color 由 article 级 nth-child 提供
 * （discovery-trend.css，qa#724），本组件不再逐柱覆盖。
 */
function SpecialtyBarShape(props: BarShapeProps) {
  const { t } = useTranslation()
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload, hoveredModel, onHoverModel, isClickable, onOpenModel } = props
  if (!payload) return null
  const clickable = isClickable?.(payload.model) ?? false
  const linked = hoveredModel === payload.model
  const open = () => onOpenModel?.(payload.model)
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    open()
  }
  return (
    <g
      aria-label={`${t('modelsDiscovery.a11y.rankItem', { rank: index + 1, model: payload.model, value: payload.value })}${clickable ? t('modelsDiscovery.chart.clickForDetail') : ''}`}
      className={`model-discovery-bar-hit ${clickable ? 'clickable' : ''} ${linked ? 'linked' : ''}`}
      onClick={clickable ? open : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
      onMouseEnter={() => onHoverModel?.(payload.model)}
      onMouseLeave={() => onHoverModel?.(null)}
      role={clickable ? 'link' : undefined}
      tabIndex={0}
    >
      <rect className="model-discovery-specialty-bar" width={width} x={x} {...normalizeRect(y, height)} />
    </g>
  )
}

interface BrandTickProps {
  x?: number
  y?: number
  payload?: { value?: string | number }
  rows?: ReadonlyArray<{ model: string; provider: string }>
}

/**
 * X 轴刻度只放厂牌图标。
 *
 * 模型名很长（"Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)"
 * 67 个字符），10 列平铺每列只有三四十像素，任何模型名都会截成「Claud…」——
 * 半截词比不显示更难读。完整名称走 title 与 tooltip。
 */
function BrandIconTick({ x = 0, y = 0, payload, rows = [] }: BrandTickProps) {
  const row = rows.find((item) => item.model === String(payload?.value ?? ''))
  if (!row) return null
  return (
    <foreignObject height={20} width={20} x={x - 10} y={y + 4}>
      <div className="model-discovery-axis-icon" title={row.model}>
        <DiscoveryModelIcon model={row.model} provider={row.provider} />
      </div>
    </foreignObject>
  )
}

interface SpecialtyTooltipProps {
  active?: boolean
  payload?: Array<{ payload: SpecialtyChartRow }>
  rows?: SpecialtyChartRow[]
  description?: string
}

function SpecialtyTooltip({ active, payload, rows = [], description }: SpecialtyTooltipProps) {
  const { t } = useTranslation()
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const rank = rows.findIndex((item) => item.model === row.model) + 1
  return (
    <ChartTooltip>
      <strong>
        <DiscoveryModelIcon model={row.model} provider={row.provider} />
        {row.model}
      </strong>
      <span>{t('modelsDiscovery.chart.rankLine', { rank, description })}</span>
      <b>{row.value}</b>
    </ChartTooltip>
  )
}

interface SpecialtyBarLabelProps {
  x?: number | string
  y?: number | string
  width?: number | string
  value?: number | string
  index?: number
}

/**
 * 柱顶数值标签，带防重叠（qa#724 返工点 3）：成本卡的「$0.0718」这类长标签在
 * 10 列平铺下宽过柱槽，右端相邻标签实测几乎相连。标签宽按 fs-micro(10px)
 * tabular 数字估 6.2px/字符，超过柱槽（柱宽 ÷0.8 得 band）的 72% 就隔柱显示——
 * 只在真的放不下时才隔，热度卡「2K/772」这类短标签不受影响；被隐藏的值
 * tooltip 里有完整展示。缩字号已到底（fs-micro 是最小档），旋转在 30px 的
 * top margin 里放不下斜排长标签，故三选一取隔柱。
 */
function SpecialtyBarLabel({ x = 0, y = 0, width = 0, value, index = 0 }: SpecialtyBarLabelProps) {
  if (value == null) return null
  const w = Number(width)
  const crowded = String(value).length * 6.2 > (w / 0.8) * 0.72
  if (crowded && index % 2 === 1) return null
  return (
    <text className="model-discovery-bar-label" textAnchor="middle" x={Number(x) + w / 2} y={Number(y) - 6}>
      {value}
    </text>
  )
}

export function SpecialtyBarChart({ rows, description, hoveredModel, onHoverModel, isClickable, onOpenModel }: SpecialtyBarChartProps) {
  const { t } = useTranslation()
  const domain = useMemo(() => specialtyBarDomain(rows.map((row) => row.numeric)), [rows])
  if (rows.length === 0) return <div className="model-discovery-chart-empty-block">{t('modelsDiscovery.empty.noMetricData')}</div>
  return (
    <div className="model-discovery-specialty-chart">
      {/* 高度按宽高比走，不写死像素：这四张图在两列栅格里，列宽随视口连续变化，
          固定 210px 在宽屏上显得扁、窄屏上又压不下十根柱子。min/max 只做安全边界，
          防止超宽屏把图拉得过高。 */}
      <ResponsiveContainer aspect={2.4} maxHeight={280} minHeight={170} width="100%">
        {/* top 留 30 而不是 10：数值标签在柱外顶部，最高那根柱子的标签需要这段空间，
            否则会被图表上边界裁掉（TPS 榜的「342 tok/s」是两行，实测最占地方）。 */}
        <BarChart data={rows} margin={{ bottom: 0, left: 0, right: 0, top: 30 }} onMouseLeave={() => onHoverModel(null)}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          {/* 轴本身不画：柱内已标真实数值，再放一条刻度轴只会在 34px 宽的卡片里抢地方。
              domain 承接原先数据层的 min-max 归一化，见 specialtyBarDomain。 */}
          <YAxis domain={domain} hide tickCount={5} />
          <XAxis
            axisLine={false}
            dataKey="model"
            height={28}
            interval={0}
            tick={<BrandIconTick rows={rows} />}
            tickLine={false}
          />
          <Tooltip
            content={<SpecialtyTooltip description={description} rows={rows} />}
            cursor={{ fill: 'var(--mg-fill-0)', opacity: 0.55 }}
          />
          <Bar
            animationDuration={ENTER_DURATION}
            dataKey="numeric"
            isAnimationActive={!prefersReducedMotion()}
            /* 值域宽的卡（热度榜 2K vs 2，跨三个数量级）domain 落到真实零基线，
               尾柱高≈0.1% —— 6px 保底在截图上仍是「塌地」（owner 2026-09-09 打回）。
               对齐原型 Math.max(18, value/max*100) 的 18% 保底：plot 高约 112–222px，
               30px 居中落在这个区间的 18% 上。验收口径是每根柱肉眼可见且可点；
               柱顶标着真实数值，不会误读绝对量。 */
            minPointSize={30}
            shape={
              <SpecialtyBarShape
                hoveredModel={hoveredModel}
                isClickable={isClickable}
                onHoverModel={onHoverModel}
                onOpenModel={onOpenModel}
              />
            }
          >
            {/* 数值标签放**柱外顶部**，与同页「近 7 日使用趋势」一致。
                原先压在柱内（白字 insideTop），柱子统一品牌色时勉强能读；改成厂牌色后
                必然翻车——实测 10 种厂牌色里只有 3 种能让白字达到 AA 4.5，最差的
                rgb(255,105,0) 只有 2.89（连原来的品牌蓝也只有 3.51，本就不达标）。
                挪到柱外后前景走正文色、背景是卡片底，对比度由既有 token 保证。
                只放数字：单位写在副标题（如「（USD / Task）」），完整值在 tooltip。
                content 自定义只为防重叠（SpecialtyBarLabel），定位与默认 top 一致。 */}
            <LabelList content={<SpecialtyBarLabel />} dataKey="short" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   多维分析散点图
   ──────────────────────────────────────────────────────────────── */

export interface AnalysisScatterPoint {
  name: string
  provider: string
  /** 厂牌色，由调用方从 providerMarkColors 取 */
  color: string
  /** 已接入 = 实心，未接入 = 空心 */
  connected: boolean
  clickable: boolean
  x: number
  y: number
}

interface AnalysisScatterChartProps {
  /** 无点时的文案。由调用方按真实原因给（没选模型 / 该维度组合无数据），不在图表里猜。 */
  emptyHint?: string
  points: AnalysisScatterPoint[]
  xTicks: number[]
  yTicks: number[]
  xLabel: string
  xUnit: string
  yLabel: string
  yUnit: string
  formatX: (value: number) => string
  formatY: (value: number) => string
  /** 优选区：开启后在「更优」的那一角画一块底色 */
  pareto: boolean
  /** X 轴越小越好（价格 / 时延）时优选区在左，否则在右 */
  xLowerIsBetter: boolean
  hoveredModel: string | null
  onHoverModel: (model: string | null) => void
  onOpenModel: (model: string) => void
}

interface PointShapeProps {
  cx?: number
  cy?: number
  payload?: AnalysisScatterPoint
  hoveredModel?: string | null
  onHoverModel?: (model: string | null) => void
  onOpenModel?: (model: string) => void
  ariaLabelFor?: (point: AnalysisScatterPoint) => string
}

function AnalysisPointShape(props: PointShapeProps) {
  const { cx = 0, cy = 0, payload, hoveredModel, onHoverModel, onOpenModel, ariaLabelFor } = props
  if (!payload) return null
  const linked = hoveredModel === payload.name
  const open = () => onOpenModel?.(payload.name)
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    open()
  }
  return (
    <g
      aria-label={ariaLabelFor?.(payload)}
      className={`model-discovery-point-hit ${payload.clickable ? 'clickable' : ''} ${linked ? 'linked' : ''}`}
      onClick={payload.clickable ? open : undefined}
      onKeyDown={payload.clickable ? handleKeyDown : undefined}
      onMouseEnter={() => onHoverModel?.(payload.name)}
      onMouseLeave={() => onHoverModel?.(null)}
      role={payload.clickable ? 'link' : undefined}
      style={{ '--point-color': payload.color } as React.CSSProperties}
      tabIndex={0}
    >
      <circle className={`model-discovery-scatter-point ${payload.connected ? 'supported' : 'pending'}`} cx={cx} cy={cy} r={6} />
    </g>
  )
}

interface ScatterTooltipProps {
  active?: boolean
  payload?: Array<{ payload: AnalysisScatterPoint }>
  lines?: (point: AnalysisScatterPoint) => string[]
}

function AnalysisTooltip({ active, payload, lines }: ScatterTooltipProps) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <ChartTooltip>
      <strong>
        <DiscoveryModelIcon model={point.name} provider={point.provider} />
        {point.name}
      </strong>
      {lines?.(point).map((line) => <em key={line}>{line}</em>)}
    </ChartTooltip>
  )
}

export function AnalysisScatterChart({
  points,
  xTicks,
  yTicks,
  xLabel,
  xUnit,
  yLabel,
  yUnit,
  formatX,
  formatY,
  pareto,
  xLowerIsBetter,
  hoveredModel,
  onHoverModel,
  onOpenModel,
  emptyHint,
}: AnalysisScatterChartProps) {
  const { t } = useTranslation()
  // 空态必须分归因：「没选模型」是用户的事，「选了但没坐标」是数据的事。
  // 共用一句「请选择至少一个模型」会在全选 31 个模型时照样弹出来，把数据缺失
  // 说成用户没操作（2026-09-08 owner 截图：API 价格 × 使用量 组合下 31/31 全选
  // 仍显示该文案）。analysis 接口会排除任一坐标为空的模型，而视频/TTS 这些子类
  // 整体没有 API_PRICE，返回必然是 0 点。
  if (points.length === 0) return <div className="model-discovery-chart-empty-block">{emptyHint ?? t('modelsDiscovery.empty.pickAtLeastOne')}</div>
  const xMin = xTicks[0]
  const xMax = xTicks[xTicks.length - 1]
  const yMin = yTicks[0]
  const yMax = yTicks[yTicks.length - 1]
  // 优选区：Y 轴上半（原型 44% 高）+ X 轴更优的那一侧（原型 48% 宽）
  const zoneX: [number, number] = xLowerIsBetter ? [xMin, xMin + (xMax - xMin) * 0.48] : [xMax - (xMax - xMin) * 0.48, xMax]
  const zoneY: [number, number] = [yMax - (yMax - yMin) * 0.44, yMax]
  const tooltipLines = (point: AnalysisScatterPoint) => [
    `${yLabel}：${formatY(point.y)} ${yUnit}`,
    `${xLabel}：${formatX(point.x)} ${xUnit}`,
  ]
  const ariaLabelFor = (point: AnalysisScatterPoint) =>
    `${t('modelsDiscovery.a11y.scatterPoint', { name: point.name, yLabel, y: formatY(point.y), xLabel, x: formatX(point.x) })}${point.clickable ? t('modelsDiscovery.chart.clickForDetail') : ''}`
  return (
    <div className="model-discovery-scatter-plot">
      {/* 散点比柱图更吃纵向空间（点要散得开才看得出分布），比例给得更方 */}
      <ResponsiveContainer aspect={2.1} maxHeight={380} minHeight={240} width="100%">
        <ScatterChart margin={{ bottom: 26, left: 14, right: 16, top: 8 }} onMouseLeave={() => onHoverModel(null)}>
          <CartesianGrid stroke="var(--line)" />
          <XAxis
            axisLine={false}
            dataKey="x"
            domain={[xMin, xMax]}
            label={{ className: 'model-discovery-axis-title', position: 'insideBottom', offset: -20, value: `${xLabel}（${xUnit}）` }}
            tick={{ fill: 'var(--mg-text-4)', fontSize: 9 }}
            tickFormatter={formatX}
            tickLine={false}
            ticks={xTicks}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="y"
            domain={[yMin, yMax]}
            label={{ angle: -90, className: 'model-discovery-axis-title', position: 'insideLeft', value: `${yLabel}（${yUnit}）` }}
            tick={{ fill: 'var(--mg-text-4)', fontSize: 9 }}
            tickFormatter={formatY}
            tickLine={false}
            ticks={yTicks}
            type="number"
            width={52}
          />
          {pareto && (
            <ReferenceArea
              className="model-discovery-advantage-zone"
              x1={zoneX[0]}
              x2={zoneX[1]}
              y1={zoneY[0]}
              y2={zoneY[1]}
            >
              {/* 标题写成 <Label> 子节点：传 label={{...}} 时 recharts 不渲染 */}
              <Label className="model-discovery-advantage-label" position="insideTopLeft" value={t('modelsDiscovery.chart.advantageZone')} />
            </ReferenceArea>
          )}
          <Tooltip content={<AnalysisTooltip lines={tooltipLines} />} cursor={{ stroke: 'var(--line)', strokeDasharray: '3 3' }} />
          <Scatter
            animationDuration={ENTER_DURATION}
            data={points}
            isAnimationActive={!prefersReducedMotion()}
            shape={
              <AnalysisPointShape
                ariaLabelFor={ariaLabelFor}
                hoveredModel={hoveredModel}
                onHoverModel={onHoverModel}
                onOpenModel={onOpenModel}
              />
            }
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   近 7 日使用趋势柱图
   ──────────────────────────────────────────────────────────────── */

export interface TrendChartPoint {
  name: string
  provider: string
  color: string
  /** 增长率百分比数值，可能为负 */
  growth: number
  /** 带符号的展示串（"+42%"） */
  growthLabel: string
  /** 当期用量展示串 */
  usage: string
}

interface TrendBarChartProps {
  points: TrendChartPoint[]
  usageLabel: string
}

interface TrendShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: TrendChartPoint
}

function TrendBarShape({ x = 0, y = 0, width = 0, height = 0, payload }: TrendShapeProps) {
  const { t } = useTranslation()
  if (!payload) return null
  return (
    <g
      aria-label={t('modelsDiscovery.a11y.trendItem', { name: payload.name, label: payload.growthLabel })}
      className="model-discovery-bar-hit"
      style={{ '--trend-color': payload.color } as React.CSSProperties}
    >
      <rect className="model-discovery-trend-bar" width={width} x={x} {...normalizeRect(y, height)} />
    </g>
  )
}

interface TrendTooltipProps {
  active?: boolean
  payload?: Array<{ payload: TrendChartPoint }>
  usageLabel?: string
}

function TrendTooltip({ active, payload, usageLabel }: TrendTooltipProps) {
  const { t } = useTranslation()
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <ChartTooltip>
      <strong>
        <DiscoveryModelIcon model={point.name} provider={point.provider} />
        {point.name}
      </strong>
      <em>{usageLabel}</em>
      <b>{point.usage}</b>
      <span>{t('modelsDiscovery.chart.last7d', { label: point.growthLabel })}</span>
    </ChartTooltip>
  )
}

export function TrendBarChart({ points, usageLabel }: TrendBarChartProps): ReactElement {
  return (
    <div className="model-discovery-trend-chart">
      {/* 趋势图在侧栏窄列里，比例更扁 */}
      <ResponsiveContainer aspect={2.0} maxHeight={190} minHeight={130} width="100%">
        <BarChart data={points} margin={{ bottom: 0, left: 0, right: 4, top: 14 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <YAxis
            axisLine={false}
            /* 全是负增长时也要把 0 留在轴上，否则零线没地方画 */
            domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
            tick={{ fill: 'var(--mg-text-4)', fontSize: 9 }}
            /* 4 档：150px 高的小图里 5 档会挤到最后一格被丢掉，留出不等距的空当 */
            tickCount={4}
            tickFormatter={(value: number) => `${value}%`}
            tickLine={false}
            width={34}
          />
          <XAxis
            axisLine={false}
            dataKey="name"
            height={28}
            interval={0}
            tick={<BrandIconTick rows={points.map((point) => ({ model: point.name, provider: point.provider }))} />}
            tickLine={false}
          />
          {/* 增长率可能为负：零线画出来才看得出「掉了」和「涨了」的分界。
              手写版把负增长按 max(0, growth) 压成一根 12% 的最小柱，等于把负值画成了正值。 */}
          <ReferenceLine className="model-discovery-trend-zero" y={0} />
          <Tooltip content={<TrendTooltip usageLabel={usageLabel} />} cursor={{ fill: 'var(--mg-fill-0)', opacity: 0.55 }} />
          <Bar animationDuration={ENTER_DURATION} dataKey="growth" isAnimationActive={!prefersReducedMotion()} shape={<TrendBarShape />}>
            <LabelList className="model-discovery-trend-label" dataKey="growthLabel" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
