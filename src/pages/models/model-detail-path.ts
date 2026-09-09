/**
 * 模型详情页站内路径（/models/:modelId）的唯一拼接点。
 *
 * model_id 是 OpenAI 兼容口径的 API ID，形如 `vendor/model`，天然可能带 `/`。
 * 直接拼进路径会把 `/models/fakellm/qa-text-v1` 撕成两段，`/models/:modelId`
 * 匹配不上、路由兜底到 404（prd#983）。这里统一 encodeURIComponent：
 * react-router 的 useParams 会把 `%2F` 解码回 `/`，services/catalog 的
 * getModel 再次编码后请求 `catalog/models/fakellm%2Fqa-text-v1`，后端按此形态
 * 正常返回（实测 200；裸斜杠形态 40401）。
 *
 * 取值顺序 model_id → id（UUID 兜底），与 2cf6057a 的口径一致；接口不返回
 * slug，别再把它当候选。
 */
export function modelDetailPath(model: { model_id?: string | null; id?: string | null }): string {
  const key = model.model_id || model.id || ''
  return `/models/${encodeURIComponent(key)}`
}
