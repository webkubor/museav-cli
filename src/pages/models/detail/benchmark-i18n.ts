/**
 * Benchmark 分组标题的英文映射（需求方 prd#1067）。
 *
 * 接口 `GET /api/v1/model-discovery/models/:modelgo_id/benchmarks` 的
 * `benchmark_groups[].name` **只有中文**，且不做语言协商 —— 2026-09-18 对
 * `modelgo-web-api.modelgo.ai` 实测 `Accept-Language: en-US` / `?lang=en` /
 * `?locale=en_US` / `X-Lang: en` 四种写法，返回的组名全部仍是
 * 「推理与知识 / 代码 / Agent 任务 / 指令遵循」，所以英文站这几个小标题是中文。
 *
 * 后端按语言返回是长期解；在那之前前端按 **code** 映射 —— code 是稳定枚举，中文名不是。
 * 表外的 code 一律回落后端 `name`，与今天线上表现一致，不引入新的退化。
 *
 * key 是拼出来的（`benchmarkGroupKey(code)`），而 `scripts/check-i18n.mjs` 只静态校验
 * `t('字面量')`，拼接 key 它看不到；漏一条不会报错、页面上直接渲染裸 key，
 * 故由 `benchmark-i18n.test.ts` 逐条兜住。
 */

/**
 * 文本类模型的四组 + 图像/视频类的分类 Elo 组，均为后端固定枚举。
 *
 * ⚠️ 匹配是**大小写敏感**的精确比对：后端目前固定吐大写枚举，若哪天改成小写或混合大小写，
 * 这里会**静默**退回显示中文 `group.name` —— 不报错、也不会有用例变红（用例校的是资源文件
 * 本身，不校运行时匹配）。改后端枚举时要同步改这张表。
 */
export const LOCALIZED_GROUP_CODES = new Set([
  'REASONING',
  'CODING',
  'AGENTIC',
  'INSTRUCTION',
  'CATEGORIES',
])

export function benchmarkGroupKey(code: string) {
  return `modelsCatalog.detail.benchmarkGroup.${code}`
}
