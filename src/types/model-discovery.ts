/**
 * 模型发现 / 模型详情 Benchmark（v1.0.6）响应类型
 *
 * 来源：飞书《模型发现 / 模型详情 前端接口文档》 + 2026-09-02 测试环境实测响应。
 * 字段以实测为准 —— 文档示例是子集（未列 `source_slug` / `cost_metric` / `cost_unit`）。
 *
 * 快照语义：数据每日 08:30（北京时间）刷新一次，不是实时值。每个响应都带
 * `snapshot_date`，页面必须展示（"数据截至 X"）；同步失败时接口继续返回上一次成功的
 * 快照，日期停在旧值。
 *
 * 空值语义：所有数值字段（评分、价格、性价比、速度、时延、用量）可能为 null，表示
 * 第三方未提供该指标，**不是 0**。对应的卡片/列/散点应隐藏，不要渲染成 0 或 "-"
 * 参与比较。
 */

/** 业务类型。九种，是所有接口的必填维度。 */
export type DiscoveryType =
  | 'AGENT'
  | 'TEXT_CHAT'
  | 'CODE_GENERATION'
  | 'TEXT_TO_IMAGE'
  | 'IMAGE_EDITING'
  | 'TEXT_TO_VIDEO'
  | 'IMAGE_TO_VIDEO'
  | 'TTS'
  | 'STT'

/**
 * 排序指标。与 `DiscoveryType` 的组合由后端校验，非法组合返回 4001 ——
 * 可用组合见 DISCOVERY_METRICS_BY_TYPE（src/constants/model-discovery.ts）。
 */
export type DiscoveryMetric =
  | 'AGENTIC_INDEX'
  | 'INTELLIGENCE_INDEX'
  | 'CODING_INDEX'
  | 'ELO'
  | 'VOICE_ELO'
  | 'AA_WER'
  | 'API_PRICE'
  | 'COST_PER_TASK'
  | 'OUTPUT_TPS'
  | 'END_TO_END_LATENCY'
  | 'USAGE'
  | 'VALUE_SCORE'

/** 用量单位，随业务类型变化。 */
export type DiscoveryUsageUnit = 'TOKENS' | 'TASKS' | 'CHARACTERS' | 'AUDIO_MINUTES'

/** 接入状态：MODELGO 已接入，MODELGO_AI 仅在榜单中展示。 */
export type DiscoveryIntegrationStatus = 'MODELGO' | 'MODELGO_AI'

/** 排序方向，由后端给出，前端不必自己判断越高越好还是越低越好。 */
export type DiscoveryDirection = 'asc' | 'desc'

/**
 * 标准模型卡字段。总览 highlights 的 `model` 与排名 `items` 共用同一结构，
 * 因此两处可以复用同一个卡片组件。
 */
export interface DiscoveryModelCard {
  /**
   * 接口入参的唯一标识，来自第三方数据源，稳定且唯一。
   * **筛选、多维分析、使用趋势一律用它。**
   */
  source_model_id: string
  /**
   * ModelGo 模型 id，用于查详情 / 跳模型广场。
   * 可能为空或在不同业务类型下重复，**不可用作筛选值**。
   */
  modelgo_id: string | null
  /** 第三方原始短标识，仅用于追溯。 */
  source_slug?: string | null
  model_name: string
  creator_name: string | null
  integration_status: DiscoveryIntegrationStatus
  is_open_source: boolean
  /** TTS / STT 无发布时间，恒为 null。 */
  release_date: string | null
  /** 该业务类型的主质量指标及其分值。 */
  primary_metric: DiscoveryMetric
  primary_score: number | null
  /**
   * 成本指标。可能为 null（该模型无价格数据）——**但不要按业务类型预判**，
   * 覆盖度随第三方档位变化，见 constants/model-discovery.ts 的说明。
   */
  cost_metric?: DiscoveryMetric | null
  cost_value: number | null
  cost_unit?: string | null
  /** 性价比。STT 恒为 null —— 语音识别不计算性价比，这是产品口径而非数据缺失。 */
  value_score: number | null
  /** 输出速度与端到端时延。媒体类型不提供这两项指标，恒为 null。 */
  output_tps: number | null
  end_to_end_latency_ms: number | null
  /** 近 7 日滚动用量。 */
  usage_value: number | null
  usage_unit: DiscoveryUsageUnit
  /**
   * 单价构成，用于把 `cost_value`（单次任务总成本）拆开展示。
   *
   * **只有语言类（AGENT / TEXT_CHAT / CODE_GENERATION）返回**，媒体与语音类整个字段
   * 不下发；语言类里也不是人人都有 —— 2026-09-07 实测 TEXT_CHAT 前 100 名有 5 个整块
   * 缺失、**49 个缺 `cache_write_tokens`**。所以渲染必须逐项判空，不能假设四项齐全。
   */
  unit_prices?: DiscoveryUnitPrices | null
}

/** 单价构成。字段按 `unit` 计价，缺失表示该档位无公开价格，不是 0。 */
export interface DiscoveryUnitPrices {
  /** 目前实测只有 USD_PER_1M_TOKENS 一种取值。 */
  unit: string
  input_tokens?: number | null
  output_tokens?: number | null
  cache_hit_tokens?: number | null
  cache_write_tokens?: number | null
}

/** 总览的单个 highlight：指标 + 值 + 完整模型卡。 */
export interface DiscoveryHighlight {
  metric: DiscoveryMetric
  value: number | null
  model: DiscoveryModelCard
}

/**
 * 六个 highlight 卡片。**值为 null 表示该类型下没有符合条件的模型，
 * 前端保留卡位展示空态，不要隐藏整张卡片。**
 */
export interface DiscoveryHighlights {
  /** 综合评分最高。 */
  highest_score: DiscoveryHighlight | null
  /** 开源模型评分最高。 */
  highest_open_source_score: DiscoveryHighlight | null
  /** 性价比最高。STT 恒为 null。 */
  highest_value: DiscoveryHighlight | null
  /** 价格最低。该类型无有效价格时为 null（覆盖度会变，不要按类型预判）。 */
  lowest_price: DiscoveryHighlight | null
  /** 输出速度最快。媒体类型不提供速度，恒为 null。 */
  highest_output_tps: DiscoveryHighlight | null
  /** 近 7 日使用量最高。 */
  highest_usage: DiscoveryHighlight | null
}

/** （一）总览 */
export interface DiscoveryOverview {
  snapshot_date: string
  type: DiscoveryType
  highlights: DiscoveryHighlights
}

/** 排名条目 = rank + value + 标准模型卡。 */
export interface DiscoveryRankingItem extends DiscoveryModelCard {
  rank: number
  value: number | null
}

/** （二）统一排名。Top N 与完整榜单是同一个接口，靠 page_size 区分。 */
export interface DiscoveryRankings {
  snapshot_date: string
  type: DiscoveryType
  metric: DiscoveryMetric
  direction: DiscoveryDirection
  /**
   * 该指标下可排序的模型数。**指标值为空的模型不参与排序，所以 total 随 metric
   * 变化**（同为 TEXT_CHAT，按智力指数 631 个，按成本仅 150 个）。展示"共 N 个模型"
   * 必须用这个值，不能用模型选项接口的总数。
   */
  total: number
  page: number
  page_size: number
  items: DiscoveryRankingItem[]
}

/** 模型选择器 / 厂商下拉的候选项。 */
export interface DiscoveryModelOption {
  source_model_id: string
  modelgo_id: string | null
  source_slug?: string | null
  model_name: string
  creator_name: string | null
  integration_status: DiscoveryIntegrationStatus
  is_open_source: boolean
}

/** （三）模型选项。该类型最新快照下的全部模型，不分页。 */
export interface DiscoveryModelOptions {
  snapshot_date: string
  type: DiscoveryType
  models: DiscoveryModelOption[]
}

/** 散点图上的一个点。 */
export interface DiscoveryAnalysisPoint {
  source_model_id: string
  modelgo_id: string | null
  source_slug?: string | null
  model_name: string
  x: number
  y: number
}

/**
 * （四）多维分析。**任一坐标为空的模型会被排除**，所以 points 长度可能小于传入的
 * 模型数 —— 这是预期行为，不是丢数据。要提示"N 个模型因缺少数据未显示"，用
 * 传入数量减去 points.length。
 */
export interface DiscoveryAnalysis {
  snapshot_date: string
  type: DiscoveryType
  x_metric: DiscoveryMetric
  y_metric: DiscoveryMetric
  points: DiscoveryAnalysisPoint[]
}

/** 用量序列上的一个点。 */
export interface DiscoveryUsagePoint {
  date: string
  value: number
}

export interface DiscoveryUsageTrendModel {
  source_model_id: string
  modelgo_id?: string | null
  source_slug?: string | null
  model_name: string
  /** 最新快照的近 7 日滚动用量。 */
  current_usage: number | null
  /**
   * 增长率，小数（0.5 = 增长 50%）。两种情况为 null，此时隐藏增长率标签：
   * 序列不足两个点，或起点用量为 0。
   */
  growth_rate: number | null
  /**
   * 按快照日期升序的点列。**每个点本身是"该快照日回看 7 天"的滚动用量，
   * 不是当日增量** —— 前端标注措辞注意。
   */
  series: DiscoveryUsagePoint[]
}

/**
 * （五）使用趋势。最新快照中已不存在的模型（从第三方榜单退场）会被跳过，
 * 不在 models 中返回。
 */
export interface DiscoveryUsageTrends {
  snapshot_date: string
  type: DiscoveryType
  usage_unit: DiscoveryUsageUnit
  models: DiscoveryUsageTrendModel[]
}

/** Benchmark 分值单位。 */
export type BenchmarkUnit = 'PERCENT' | 'ELO' | 'WER'

/** 顶部摘要卡的综合指数。 */
export interface BenchmarkCompositeIndex {
  metric: DiscoveryMetric
  score: number | null
  rank: number | null
  /**
   * 同快照日、同业务类型下的有效模型总数。**三个指数的 total 各不相同**
   * （智力 631 / 代码 236 / Agent 178），这是正常的。
   */
  total: number | null
  /** 领先百分比，整数。 */
  ahead_percent: number | null
  /** 分值分布。实测恒为空数组，尚未见到非空样本，结构待后端确认。 */
  distribution?: unknown[]
}

export interface BenchmarkItem {
  /** 指标码。分类 Elo 形如 `CATEGORY_ELO/ANIME`。 */
  metric: string
  name: string
  /** 分类 Elo 分组下无此字段。 */
  description?: string | null
  /** 原始分值（0~1 的比率或 Elo 原值）。 */
  score: number | null
  /** 可直接展示的数值：0~1 分值已乘 100（0.912 → 91.2），配合 unit 渲染即可。 */
  display_score: number | null
  unit: BenchmarkUnit
}

/**
 * 专项 Benchmark 分组。**指标清单是固定的完整结构：即使取不到数值，指标项也会返回，
 * 只是 score / display_score 为 null。前端应保持完整页面结构展示空状态，
 * 不要删除指标项，也不要补 0。**
 *
 * 图像/视频模型返回 `code: 'CATEGORIES'`，分类名由数据驱动（Anime、Fantasy & Mythical
 * 等），不是固定枚举。TTS 当前无稳定细分 Benchmark，返回空数组。
 */
export interface BenchmarkGroup {
  code: string
  name: string
  items: BenchmarkItem[]
}

/** （六）模型详情 Benchmark。 */
export interface ModelBenchmarks {
  snapshot_date: string
  benchmark_version: string
  modelgo_id: string
  type: DiscoveryType
  composite_indices: BenchmarkCompositeIndex[]
  benchmark_groups: BenchmarkGroup[]
}
