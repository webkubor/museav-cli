/**
 * 模型发现 / 模型详情 Benchmark（v1.0.6）
 * 路由：/models/discovery、/models/:id（Benchmark 区块）
 * API：GET /api/v1/model-discovery/{overview,rankings,model-options,analysis,usage-trends,models/:id/benchmarks}
 *
 * 数据源是 observer 的每日快照，但对前端统一由 web-api 在 `api/v1` 下代理暴露
 * （2026-09-03 test 环境实测六接口均已在 web-api 上，observer 的 `internal/v1`
 * 前缀是内网地址，浏览器直连会被 CORS 拦、经 web-api 打 `internal/v1` 则吃 40401）。
 * 所以这里走 get() 的默认前缀，与其余业务接口无差别。
 *
 * 全部只读最近一次成功发布的每日快照，响应回传实际使用的 `snapshot_date`，
 * 页面需展示"数据截至 X"。
 */
import { get } from '@/lib/request'
import type {
  DiscoveryAnalysisParams,
  DiscoveryRankingsParams,
  DiscoveryTypeParams,
  DiscoveryUsageTrendsParams,
  ModelBenchmarksParams,
} from '@/interfaces/model-discovery'
import type {
  DiscoveryAnalysis,
  HotAgents,
  HotAgentPeriod,
  DiscoveryModelOptions,
  DiscoveryOverview,
  DiscoveryRankings,
  DiscoveryUsageTrends,
  ModelBenchmarks,
} from '@/types'

const BASE = 'model-discovery'

/**
 * 总览：主页面顶部六个 highlight 卡片，一次返回。
 * 某个 highlight 为 null 表示该类型下没有符合条件的模型，**保留卡位展示空态**。
 */
export function getDiscoveryOverview(params: DiscoveryTypeParams) {
  return get<DiscoveryOverview>(`${BASE}/overview`, params)
}

/**
 * 统一排名：专项 Top N 与完整榜单是同一个接口，取前 5 / 前 10 就传小的 page_size。
 * 展示"共 N 个模型"用响应里的 `total`（随 metric 变化），不要用模型选项的总数。
 */
export function listDiscoveryRankings(params: DiscoveryRankingsParams) {
  return get<DiscoveryRankings>(`${BASE}/rankings`, params)
}

/**
 * 模型选项：该类型最新快照下的全部模型，不分页。
 * 用于模型选择器（value 取 `source_model_id`）与厂商下拉（对 creator_name 去重）。
 */
export function listDiscoveryModelOptions(params: DiscoveryTypeParams) {
  return get<DiscoveryModelOptions>(`${BASE}/model-options`, params)
}

/**
 * 多维分析：散点图坐标。任一坐标为空的模型会被排除，
 * 所以 points 长度可能小于传入的模型数（预期行为）。
 */
export function getDiscoveryAnalysis(params: DiscoveryAnalysisParams) {
  return get<DiscoveryAnalysis>(`${BASE}/analysis`, params)
}

/** 使用趋势：所选模型的用量序列，与散点图拆开的独立接口。 */
export function getDiscoveryUsageTrends(params: DiscoveryUsageTrendsParams) {
  return get<DiscoveryUsageTrends>(`${BASE}/usage-trends`, params)
}

/**
 * 模型详情 Benchmark。路径参数是 `modelgo_id`（不是 source_model_id），
 * 模型未命中返回 40401。
 *
 * **直接传 catalog 的 `model_id`**：2026-09-07 实测后端已把两边口径对齐
 * （qa#708 第 1 条），catalog 33 个真实模型原样请求命中 18 个；此前前端那层
 * `toLowerCase()` + 点号转连字符的猜规则适配已删除 —— 保留它反而只剩 3 个命中。
 * 剩下 15 个未命中的是图像/视频类与确实不在第三方榜单里的模型，本就该整块不显示。
 */
export function getModelBenchmarks(modelgoId: string, params?: ModelBenchmarksParams) {
  return get<ModelBenchmarks>(
    `${BASE}/models/${encodeURIComponent(modelgoId)}/benchmarks`,
    params,
  )
}

/** 把模型 id 列表拼成接口要求的逗号分隔串。 */
export function joinSourceModelIds(ids: readonly string[]) {
  return ids.join(',')
}

/**
 * （七）热门 Agent 应用榜。Agent 页的「热门 Agent 排行」。
 *
 * `limit` 缺省不截断（数据源每周期固定 200 条），首屏只要前 20 就传 20；
 * 响应的 `total` 始终是完整条数、不受 limit 影响。取值 1~200，非法值返回 40001。
 *
 * ⚠️ 两条口径必须守住：
 *   1. `rank` **有空洞**，按数组下标重排会得出错误名次（实测名次散布 1~229）
 *   2. `source` 固定 `openrouter`，**页面必须标注数据来源** —— 它是 OpenRouter 平台的
 *      流量分布，不是市场份额
 */
export function getHotAgents(params: { period?: HotAgentPeriod; limit?: number } = {}) {
  return get<HotAgents>(`${BASE}/hot-agents`, params)
}
