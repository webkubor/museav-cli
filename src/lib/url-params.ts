/**
 * 当前 URL 的全部查询参数，序列化为 JSON 字符串，作为自建埋点的公共属性 `url_params` 上报。
 * 没有参数时返回空字符串。读取的是事件发生时的 URL，SPA 路由切换后随之变化。
 */
export function urlParamsProp(search: string = window.location.search): string {
  const params: Record<string, string> = {}
  new URLSearchParams(search).forEach((value, key) => {
    params[key] = value
  })
  return Object.keys(params).length > 0 ? JSON.stringify(params) : ''
}
