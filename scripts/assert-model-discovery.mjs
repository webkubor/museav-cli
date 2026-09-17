/**
 * PRD 原型的模型发现页断言，路径改到本仓后直接跑（同步说明见
 * src/pages/models/discovery/ModelDiscoveryPagePrototype.tsx 的文件头注释）。
 *
 * 与原型的三处路径差异：
 *   1. 页面文件是 ModelDiscoveryPagePrototype.tsx，不是 ModelDiscoveryPage.tsx
 *   2. 原型的 App.tsx 承载站点外壳（页面类型、入口按钮、Shell 渲染），本仓拆成了
 *      App.tsx（路由）+ pages/models/catalog/index.tsx（模型广场与入口按钮），
 *      所以 appSource 用两者拼接
 *   3. 原型样式在单个 redesign.css，本仓按职责拆成 discovery/*.css 共 15 片，
 *      所以 cssSource 用整个目录拼接
 *
 * ⚠️ 有一批断言必然失败且**属预期**：原型断言写死了 providerMarks 首字母色表与
 * lucide 图标名，本仓走 ModelIcon 与 react-icons/lu；且 2026-08-27 起 UI / 布局 /
 * 排版 / 图标一律以控制台现状为准，只有指标口径 / 文案 / 交互逻辑 / 数据结构
 * 跟随 PRD。跑出来的失败项要先分清是哪一类，不要照着 UI 类失败去改。
 *
 * 用法：node scripts/assert-model-discovery.mjs [--verbose]
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const pagePath = path.join(root, "src", "pages", "models", "discovery", "ModelDiscoveryPagePrototype.tsx");
const cssDir = path.join(root, "src", "pages", "models", "discovery");

const appSource = [
  path.join(root, "src", "App.tsx"),
  path.join(root, "src", "pages", "models", "catalog", "index.tsx"),
  path.join(root, "src", "pages", "models", "discovery", "index.tsx"),
]
  .filter((p) => fs.existsSync(p))
  .map((p) => fs.readFileSync(p, "utf8"))
  .join("\n");

const pageSource = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";

const cssSource = fs
  .readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => fs.readFileSync(path.join(cssDir, f), "utf8"))
  .join("\n");
const specialtyDefinitions = [...pageSource.matchAll(/\{ title: "[^"]+", description: "[^"]+", rows: \[(.*?)\] \}/g)];
const discoveryModelCount = (pageSource.match(/supported: (?:true|false)/g) ?? []).length;

const assertions = [
  [appSource.includes('"discovery"'), "站点页面类型应包含 discovery"],
  [appSource.includes("模型发现"), "模型广场排序控件后应提供模型发现入口"],
  [appSource.includes("<ModelDiscoveryPage"), "WebsiteShell 应渲染模型发现页面"],
  [pageSource.includes('const modalityOptions'), "模型发现页应提供模态切换"],
  [pageSource.includes('{ key: "agent", label: "Agent" }') && pageSource.indexOf('{ key: "agent", label: "Agent" }') < pageSource.indexOf('{ key: "text", label: "文本" }') && ["文本", "图像", "视频", "音频"].every((label) => pageSource.includes(`label: "${label}"`)), "模型发现页应以 Agent 为首个一级页签并覆盖文本、图像、视频、音频"],
  [pageSource.includes('tasks: ["文本对话", "代码生成"]') && pageSource.includes('tasks: ["Agent"]') && !pageSource.includes("通用 Agent") && !pageSource.includes("数据分析") && !pageSource.includes("Math Index"), "Agent 应从文本子分类提升为独立一级页签，文本仅保留对话与代码生成"],
  [pageSource.includes('useState<ModalityKey>("agent")') && pageSource.includes('modality !== "agent" && <div className="model-discovery-tasks">'), "模型发现应默认进入 Agent，且 Agent 不展示冗余二级任务栏"],
  [pageSource.includes('tasks: ["文生图", "图片编辑"]'), "图像模型应保留文生图与图片编辑两个一级任务"],
  [!pageSource.includes("categories:") && !pageSource.includes("效果分类"), "模型发现页不应再提供效果分类层级"],
  [!pageSource.includes("MODEL INTELLIGENCE"), "页头不应展示英文小标题"],
  [pageSource.includes("帮助团队完成模型选型") && !pageSource.includes("帮助团队完成多模态模型选型"), "页头副标题不应强调多模态"],
  [pageSource.includes('className="model-discovery-title-row"'), "数据源与快照标签应与大标题位于同一标题行"],
  [pageSource.includes('className="model-discovery-view-all"') && pageSource.includes("返回模型广场") && pageSource.includes("onViewAllModels") && appSource.includes("setMarketplaceInitialModelId(null)") && appSource.includes('setSitePage("marketplace")'), "模型发现页头应提供返回模型广场的入口"],
  [pageSource.indexOf('className="model-discovery-scope"') > pageSource.indexOf('className="model-discovery-modalities"'), "模型范围切换应移动到模态导航下方"],
  [["评分最高", "开源模型评分最高", "性价比最高", "输出 TPS 最高", "API 价格最低", "近 7 日 ModelGo 使用量最高"].every((label) => pageSource.includes(label)), "首屏应按模态展示质量、性价比、TPS 或 API 价格及使用量结论"],
  [pageSource.includes("优选区") && pageSource.includes("model-discovery-advantage-zone"), "多维分析应支持优选区域"],
  [!pageSource.includes("气泡指标") && !pageSource.includes("bubbleMetric") && pageSource.includes("model-discovery-scatter-point"), "多维分析应使用统一圆点，不应继续提供气泡大小维度"],
  [pageSource.includes('image: {') && pageSource.includes('yMetrics: ["Elo 评分", "API 价格"]') && !["商业设计", "写实影视", "插画艺术", "人像", "文字渲染"].some((metric) => pageSource.includes(metric)), "图像分析纵轴应使用 Elo 或 API 价格"],
  [["质量 × API 价格", "质量 × 使用量", "API 价格 × 使用量"].every((label) => pageSource.includes(`label: "${label}"`)) && pageSource.includes('<span className="model-discovery-fixed-axis">纵轴<strong>{activeYAxisLabel}</strong></span>'), "媒体多维分析应只使用质量、API 价格与使用量"],
  [!pageSource.includes('aria-label="纵轴指标"') && !pageSource.includes('aria-label="横轴指标"') && pageSource.includes('<span className="model-discovery-fixed-axis">横轴<strong>{activeXAxis.label}</strong></span>'), "多维分析应直接展示当前横纵轴名称，不提供冗余下拉筛选"],
  [pageSource.includes('yMetrics: ["Intelligence Index", "Coding Index", "Agentic Index"]') && !["中文能力", "上下文长度"].some((metric) => pageSource.includes(metric)), "文本质量纵轴应只保留三类有稳定来源的专业 Index"],
  [pageSource.includes("model-discovery-model-filter-popover") && pageSource.includes("toggleChartModel") && ["清空", "全选", "恢复默认"].every((label) => pageSource.includes(label)), "模型筛选应支持搜索、多选与批量操作"],
  [pageSource.includes("trendSeries") && pageSource.includes("model-discovery-trend-legend") && pageSource.includes("model-discovery-trend-column"), "使用趋势应按模型区分并展示紧凑多列图例"],
  [pageSource.includes(".sort((left, right) => right.growth - left.growth)") && pageSource.includes("trendGrowthMaximum") && pageSource.includes("trendGrowthMidpoint"), "使用趋势应以模型为横轴并按增长百分比降序排列"],
  [pageSource.includes("trendUsageLabel") && pageSource.includes("近 7 日 Token 用量") && pageSource.includes("model-discovery-trend-tooltip"), "使用趋势悬浮明细应展示模型近 7 日用量"],
  [pageSource.includes("sourceConstrainedAnalysisProfiles") && pageSource.includes('"语音合成（TTS）": { qualityLabel: "语音质量 Elo"') && pageSource.includes('"语音识别（STT）": { qualityLabel: "AA-WER"') && pageSource.includes('tasks: ["语音合成（TTS）", "语音识别（STT）"]') && !pageSource.includes("音乐生成"), "音频应仅保留 TTS 与 STT 两个子分类"],
  [["Intelligence Index", "Coding Index", "Agentic Index"].every((label) => pageSource.includes(`qualityLabel: "${label}"`)) && pageSource.includes("textTaskScores"), "文本任务应使用专业 Index 指标并随任务切换数据"],
  [!pageSource.includes('score: "1512"') && pageSource.includes('score: "63.1"') && pageSource.includes('valueUnit: "Index / USD"'), "文本模型不应伪装成 Elo 量级"],
  [pageSource.includes('source: "price"') && pageSource.includes('source: "usage"') && !pageSource.includes('source: "performance"') && !pageSource.includes('label: "评测音色数"'), "媒体分析横轴应仅使用可稳定获取的 API 价格与使用量"],
  [!["Arena Score", "Arena 综合评分", "Arena 音色数", "Speech Arena", "智能指数（AA）"].some((label) => pageSource.includes(label)), "指标名称不应暴露 Arena 或 AA 数据源前缀"],
  [pageSource.includes("taskMetricSources") && ["Artificial Analysis", "ModelGo"].every((source) => pageSource.includes(source)) && pageSource.includes("model-discovery-source-tag") && !pageSource.includes('"Design Arena"'), "指标数据源应通过独立 Tag 展示"],
  [pageSource.includes("model-discovery-info-trigger") && pageSource.includes("summaryTooltipCopy[modality][task]") && pageSource.includes('role="tooltip"'), "首屏结论卡片的信息图标应按子分类展示独立说明"],
  [cssSource.includes("bottom: calc(100% + 8px)") && cssSource.includes(".model-discovery-info-trigger > span::after"), "首屏 Info Tooltip 应显示在图标上方并提供方向箭头"],
  [!pageSource.includes('index === 2 ? "highlight"') && !cssSource.includes(".model-discovery-summary-card.highlight"), "首屏结论卡片不应单独使用强调描边"],
  [pageSource.includes("model-discovery-summary-model") && pageSource.includes("providerMarks[item.provider]") && pageSource.includes("providerMarkColors[item.provider]"), "首屏结论卡片应在模型名称前展示品牌标识"],
  [cssSource.includes(".model-discovery-summary-model > strong") && cssSource.includes("font-size: 18px") && cssSource.includes(".model-discovery-summary-value b") && cssSource.includes("font-size: 14px"), "首屏结论卡片应以 18px 模型名称为第一视觉重点，指标数字使用 14px"],
  [cssSource.includes(".model-discovery-overview {\n  align-items: stretch") && cssSource.includes("grid-auto-rows: minmax(0, 1fr)") && cssSource.includes("min-height: 100%"), "首屏结论卡片网格应与 Top 5 等高并均分行高"],
  [pageSource.includes("model-discovery-summary-content") && cssSource.includes(".model-discovery-summary-content") && cssSource.includes("justify-content: center"), "首屏结论卡片的模型与指标组合应在剩余空间内垂直居中"],
  [pageSource.includes('className="model-discovery-rank-more"') && pageSource.includes('<section className="model-discovery-section" id="model-discovery-full-ranking">\n        <div className="model-discovery-section-head"><div><h2>完整指标榜单</h2>') && pageSource.includes("scrollIntoView"), "Top 5 卡片应提供查看更多并跳转到完整指标榜单"],
  [pageSource.includes("model-discovery-row-clickable") && pageSource.includes("handleModelRowKeyDown") && pageSource.includes("openModelDetail(model)"), "Top 5 与完整榜单中有详情的模型应支持整行点击和键盘访问"],
  [pageSource.includes("modelGoAiModelUrl") && pageSource.includes('window.open(modelGoAiModelUrl(model), "_blank", "noopener,noreferrer")') && pageSource.includes('在 ModelGo.ai 查看 ${model.name} 模型'), "ModelGo.ai 已接入的海外模型应从整行在新标签页打开海外站对应模型"],
  [pageSource.includes('isDomesticModel(model) ? Boolean(model.id) : true') && pageSource.includes('type="button">查看详情<ArrowUpRight'), "国内与海外已接入模型应统一显示查看详情"],
  [cssSource.includes(".model-discovery-rank-row:hover") && cssSource.includes(".model-discovery-table-row:hover") && cssSource.includes("cursor: pointer"), "全部模型行应提供统一悬浮选择态，仅可跳转行展示点击光标"],
  [cssSource.includes(".model-discovery-model-filter .model-discovery-model-filter-trigger") && cssSource.includes("font-size: 11px") && cssSource.includes("min-height: 32px"), "模型筛选触发器应使用紧凑且不被页面继承规则覆盖的字号与高度"],
  [pageSource.includes("const tablePageSize = 20") && pageSource.includes("Math.ceil(filteredTableModels.length / tablePageSize)") && pageSource.includes("(safeTablePage - 1) * tablePageSize") && pageSource.includes('<nav aria-label="完整指标榜单分页"') && !pageSource.includes('tablePageCount > 1 && <nav aria-label="完整指标榜单分页"'), "完整指标榜单应每页展示 20 个模型，不足 20 个时仍明确展示第 1 页"],
  [pageSource.includes("leaderboardSupplementModels") && pageSource.includes("const leaderboardModels") && pageSource.includes("supplementCount = 14") && pageSource.includes("leaderboardModels.filter"), "完整指标榜单应为每个任务补充足够的 mock 模型以展示多页数据"],
  [pageSource.includes("<h2>专项指标排行</h2>") && !pageSource.includes("图像模型排行") && !pageSource.includes("视频模型排行") && !pageSource.includes("模型排行`"), "四类模态应统一使用专项指标排行标题"],
  [["综合评分", "单次任务成本", "输出 TPS", "近 7 日热度"].every((title) => pageSource.includes(`title: "${title}"`)) && pageSource.includes("textBenchmarkRankings") && pageSource.includes("Artificial Analysis 基准任务加权平均成本（USD/Task）"), "文本与 Agent 专项排行应使用综合评分、单次任务成本、输出 TPS 和 ModelGo 热度"],
  [pageSource.includes("type TaskCostProfile") && ["answer", "reasoning", "cacheWrite", "cacheHit", "input"].every((field) => pageSource.includes(`${field}: number`)) && pageSource.includes("textAgentTaskCostTotals") && pageSource.includes("taskCostProfileFor"), "文本与 Agent 应使用独立的任务成本数据与五类成本构成"],
  [pageSource.includes("model-discovery-cost-breakdown") && ["输出", "推理", "缓存写入", "缓存命中", "输入"].every((label) => pageSource.includes(`<dt>${label}</dt>`)), "单次任务成本排行 Tooltip 应展示成本构成"],
  [["质量 Elo 评分", "性价比", "API 价格", "近 7 日使用量"].every((title) => pageSource.includes(title)) && pageSource.includes("imageBenchmarkRankings"), "图像排行应按质量、性价比、API 价格和平台使用量组织"],
  [["Elo 评分最高", "开源模型 Elo 最高", "API 价格最低", "Elo / ($/1K 张)"].every((label) => pageSource.includes(label)), "图像首屏卡片应使用可获取的 Elo、性价比、API 价格与使用量口径"],
  [["质量 Elo 评分", "性价比", "API 价格", "近 7 日使用量"].every((title) => pageSource.includes(title)) && pageSource.includes("videoBenchmarkRankings") && pageSource.includes("每分钟生成视频价格（$/min）"), "视频排行应按质量、性价比、API 价格和平台使用量组织"],
  [pageSource.includes('label: "API 价格最低"') && pageSource.includes('speedUnit: "USD / 分钟"') && pageSource.includes('valueUnit: "Elo / ($/min)"'), "视频首屏卡片应使用 Elo、每分钟价格与平台使用量口径"],
  [["质量 × API 价格", "质量 × 使用量", "API 价格 × 使用量"].every((label) => pageSource.includes(`label: "${label}"`)) && pageSource.includes('yMetrics: ["Elo 评分", "API 价格"]'), "视频多维分析应只保留质量、价格和使用量的三组有效组合"],
  [["质量 × API 价格", "质量 × 使用量"].every((label) => pageSource.includes(`label: "${label}"`)), "TTS 多维分析组合应使用质量、价格与使用量"],
  [pageSource.includes('<strong className="model-discovery-axis-title y-axis">{activeYAxisLabel}（{yUnit}）</strong>') && pageSource.includes('<strong className="model-discovery-axis-title x-axis">{activeXAxis.label}（{xUnit}）</strong>') && !pageSource.includes("activeXSource"), "多维分析横纵轴不应展示数据源 Tag"],
  [pageSource.includes('description: "每 1K 张标准图像价格（$/1k images）"') && pageSource.includes('unit: "USD / 1K 张"'), "图像价格排行和分析坐标应使用每千张图像价格口径"],
  [pageSource.includes('{(modality !== "audio" || task === "语音合成（TTS）") && <section className="model-discovery-section">') && pageSource.includes("<h2>模型能力多维分析</h2>"), "图像、视频与 TTS 应统一使用模型能力多维分析标题"],
  [pageSource.includes('title: "输出 TPS"') && !["生成速度领先", "处理速度领先", "首图时延领先", "启动时延领先", "首音频时延领先"].some((label) => pageSource.includes(label)), "文本与 Agent 保留输出 TPS，媒体专项榜不应展示无可靠来源的速度或时延"],
  [specialtyDefinitions.length >= 16 && specialtyDefinitions.every((match) => (match[1].match(/\{ model:/g) ?? []).length >= 5), "每个专项指标应提供稳定的基础排行数据"],
  [["语音质量最高", "API 价格最低", "识别错误率最低"].every((label) => pageSource.includes(`label: "${label}"`)) && !["合成速度最快", "转写速度最快", "纯音乐 Elo 最高", "含人声 Elo 最高"].some((label) => pageSource.includes(label)), "音频首屏结论应只覆盖可获取的 TTS 与 STT 指标"],
  [!pageSource.includes('label: "开源模型错误率最低"') && pageSource.includes('qualityLowerIsBetter: true'), "STT 不应展示开源模型错误率卡片，且 AA-WER 应按越低越好排序"],
  [pageSource.includes('qualityLabel: "语音质量 Elo"') && pageSource.includes('qualityLabel: "AA-WER"') && ["API 价格", "近 7 日使用量"].every((title) => pageSource.includes(`title: "${title}"`)) && !["语音合成速度", "转写速度", "纯音乐 Elo", "含人声 Elo"].some((title) => pageSource.includes(`title: "${title}"`)), "音频专项排行应只使用 TTS 与 STT 可获取的指标"],
  [![...pageSource.matchAll(/title: "([^"]+)"/g)].some((match) => match[1].includes("排行")), "各专项排行卡片标题不应重复包含“排行”"],
  [discoveryModelCount >= 40 && pageSource.includes("completeSpecialtyRows") && pageSource.includes(".slice(0, 10)"), "四类模型的专项指标应补齐 Top 10"],
  [pageSource.includes("model-discovery-specialty-column") && pageSource.includes("model-discovery-specialty-tooltip") && pageSource.includes("model-discovery-model-mark"), "柱状榜应展示模型图标、名称与悬浮明细"],
  [cssSource.includes(".model-discovery-specialty-column:hover,\n.model-discovery-specialty-column:focus-within") && cssSource.includes("z-index: 12") && cssSource.includes("z-index: 20"), "柱状榜悬浮列与 Tooltip 应高于相邻柱体"],
  [pageSource.includes("const barHeight = Math.max(18, value / maximum * 100)") && !pageSource.includes("minimum / value * 100"), "专项排行柱高应按实际数值正向编码，低值更优指标只改变排序方向"],
  [pageSource.includes("model-discovery-specialty-bar") && cssSource.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") && cssSource.includes("grid-template-columns: repeat(10, minmax(0, 1fr))"), "专项指标应使用 2×2 的 Top 10 竖向柱状图"],
  [!pageSource.includes('["Arena", "Artificial Analysis", "ModelGo"]') && !pageSource.includes("setSource"), "完整榜单不应再提供数据源切换"],
  [["综合评价", "性价比", "使用量"].every((label) => pageSource.includes(`label: "${label}"`)) && !pageSource.includes('{ key: "speed"') && !pageSource.includes('{ key: "latency"'), "完整榜单指标筛选应只保留综合评价、性价比和使用量"],
  [pageSource.includes('`${taskProfile.qualityLabel} / 单次任务成本`'), "文本与 Agent 完整榜单的性价比主列应使用主指标除以单次任务成本"],
  [pageSource.includes('const supportingMetricHeaders = isTextAgent') && pageSource.includes('["单次任务成本", "发布时间", "ModelGo 使用量"]') && pageSource.includes("modelReleaseDates[model.name]"), "文本与 Agent 完整榜单应展示单次任务成本，其他模态保留公开价格"],
  [!pageSource.includes('aria-label="更新时间"') && !pageSource.includes("updateOrder") && pageSource.includes("model-discovery-provider-filter-popover") && pageSource.includes("toggleProvider"), "完整榜单应删除更新时间下拉框并支持厂商多选"],
  [!pageSource.includes("外部指标展示数据源") && !pageSource.includes("本页数据为原型示意"), "完整指标榜单底部不应展示冗余口径说明"],
  [pageSource.includes("model-discovery-provider-options") && pageSource.includes("选择厂商") && pageSource.includes("筛选 ${providerFilter.length} 个厂商") && cssSource.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), "厂商多选应使用紧凑双列复选浮层并展示选择状态"],
  [pageSource.includes('providerFilter.slice(0, 2).join("、")') && pageSource.includes('<em>+{providerFilter.length - 2}</em>') && pageSource.includes('providerFilter.join("、")') && cssSource.includes(".model-discovery-page .model-discovery-provider-filter-trigger em") && cssSource.includes("font-family: inherit"), "厂商筛选触发器应展示已选厂商名称、溢出数量并继承页面字体"],
  [cssSource.includes(".model-discovery-table-secondary-filters > label") && cssSource.includes("height: 32px") && cssSource.includes("max-width: 232px") && cssSource.includes("padding: 0 9px"), "厂商多选与接入状态控件应使用一致的紧凑高度和内边距"],
  [pageSource.includes("model-discovery-table-scroll") && cssSource.includes(".model-discovery-table-card {\n  border-radius: var(--discovery-card-radius);\n  overflow: visible") && cssSource.includes("max-height: min(420px, calc(100dvh - 120px))"), "厂商多选浮层不应被榜单卡片裁剪，窄视口下选项区应内部滚动"],
  [pageSource.includes('aria-label="指标类型"') && pageSource.includes("tableModels.map"), "指标类型筛选应真实驱动榜单排序"],
  [pageSource.includes("taskMetricProfiles") && ["Agent", "文本对话", "代码生成", "文生图", "图片编辑", "文生视频", "图生视频"].every((task) => pageSource.includes(`${task}: { qualityLabel:`)) && ["语音合成（TTS）", "语音识别（STT）"].every((task) => pageSource.includes(`\"${task}\": { qualityLabel:`)), "九类一级任务应分别配置指标口径"],
  [["qualityLabel", "valueLabel", "speedLabel", "latencyLabel", "usageLabel"].every((metric) => pageSource.includes(metric)), "每个任务应覆盖质量、性价比、速度、时延与使用量"],
  [pageSource.includes('latencyLabel: "TTFT P50"') && !pageSource.includes("首 Token 响应时延 P50"), "文本任务时延横轴应统一使用 TTFT P50"],
  [pageSource.includes("domesticModelProviders") && pageSource.includes('return "ModelGo.ai 已接入"') && pageSource.includes('return model.supported ? "ModelGo 已接入" : "暂未接入 ModelGo"'), "模型接入状态应区分国内 ModelGo、海外 ModelGo.ai 与国内暂未接入"],
  [(pageSource.match(/tokenUsage: [\d_]+ \}/g) ?? []).length === 60 && pageSource.includes("const agentApplications: Record<AgentPopularityPeriod, AgentApplication[]>") && ["Hermes Agent", "Claude Code", "Kilo Code", "Command Code"].every((name) => pageSource.includes(`name: "${name}"`)), "热门 Agent 排行应硬编码 OpenRouter 三个周期各 20 条静态快照"],
  [pageSource.includes('type AgentPopularityPeriod = "day" | "week" | "month"') && pageSource.includes('{ key: "day", label: "本日" }') && pageSource.includes('{ key: "week", label: "本周" }') && pageSource.includes('{ key: "month", label: "本月" }') && pageSource.includes('useState<AgentPopularityPeriod>("day")') && pageSource.includes("agentApplications[period].map"), "热门 Agent 排行应默认展示本日并按 OpenRouter 的日、周、月快照切换"],
  [pageSource.includes('tokenUsage: 1_458_881_530_720') && pageSource.includes('tokenUsage: 10_002_983_822_990') && pageSource.includes('tokenUsage: 34_744_052_334_893') && !pageSource.includes("openrouter.ai/api/"), "热门 Agent 排行应保留快照精确 Token 数且不在运行时请求 OpenRouter"],
  [pageSource.includes('visibleAgents = rankedAgents.slice(0, expanded ? 20 : 10)') && pageSource.includes('{expanded ? "收起" : "查看更多"}') && pageSource.includes('aria-expanded={expanded}'), "热门 Agent 排行应默认展示 10 条并支持展开 20 条与收起"],
  [pageSource.includes('<div><h2>热门 Agent 排行</h2></div>') && pageSource.includes('{modality === "agent" && <AgentPopularityLeaderboard />}') && pageSource.indexOf('{modality === "agent" && <AgentPopularityLeaderboard />}') > pageSource.indexOf('id="model-discovery-full-ranking"'), "热门 Agent 排行应仅在 Agent 页面最底部显示标题"],
  [pageSource.includes('role="radiogroup"') && pageSource.includes('role="radio"') && pageSource.includes('aria-checked={period === option.key}') && pageSource.includes('aria-controls="agent-popularity-list"'), "热门 Agent 排行的周期和展开控件应提供可访问状态"],
  [pageSource.includes('className="model-discovery-agent-popularity-row"') && pageSource.includes("agent.name.trim().charAt(0)") && !pageSource.includes('model-discovery-agent-popularity-row" onClick') && cssSource.includes(".model-discovery-agent-popularity-copy span") && cssSource.includes("text-overflow: ellipsis"), "热门 Agent 排行项应使用名称首字符图标，并无跳转地展示简介与 Token 用量"],
  [cssSource.includes(".model-discovery-agent-popularity-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr))") && cssSource.includes(".model-discovery-agent-popularity-grid {\n    grid-template-columns: minmax(0, 1fr)") && cssSource.includes(".model-discovery-agent-popularity-more svg.flip"), "热门 Agent 排行应在桌面双列、移动端单列并提供展开状态反馈"],
  [pageSource.includes("isModelConnected") && pageSource.includes('scope === "all" || isModelConnected(model)') && pageSource.includes('tableAccess === "supported" ? isModelConnected(model) : !isModelConnected(model)'), "ModelGo.ai 已接入模型应计入已接入范围与榜单筛选"],
  [pageSource.includes("暂未接入 ModelGo"), "行业模型应明确展示暂未接入状态"],
  [!pageSource.includes("指标对比"), "模型发现页不应提供专门的指标对比流程"],
  [[
    "当前任务：",
    "评测指标与价格口径随任务切换",
    "在关键指标下查看 Top 3，不只展示单一冠军。",
    "口径随当前模态与任务自动切换",
    "支持按数据源、厂商与接入状态筛选。",
  ].every((hint) => !pageSource.includes(hint)), "模型发现页不应展示冗余操作提示"],
  [cssSource.includes(".model-discovery-page"), "模型发现页应使用独立样式作用域"],
];

const failures = assertions.filter(([passed]) => !passed).map(([, message]) => message);

console.log(`共 ${assertions.length} 条断言，通过 ${assertions.length - failures.length}，失败 ${failures.length}`);
if (failures.length > 0) {
  console.log("\n失败项：");
  failures.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m}`));
  process.exitCode = 1;
}
