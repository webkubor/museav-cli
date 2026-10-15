/**
 * GA4 / Google Ads 标识读取（投放归因闭环，prd46#1271）
 *
 * 注册（sign_up）要能被市场侧 join 回 Google Ads 归因的那次 GA4 会话，只带 user_id 不够：
 * 还需要 GA4 client_id、session_id，以及 Google 自己写的点击 cookie `_gcl_aw` 里的 gclid。
 * 这些都是第一方 cookie，由 index.html 加载的 gtag.js（G-WCEKH5ZZEH）写入，这里同步读出即可。
 *
 * 只认已知格式，对不上就省略该字段（不返回 undefined 值，便于直接 spread 进埋点属性）：
 * - `_ga`            GA1.<域深度>.<cid1>.<cid2>             → ga_client_id = "<cid1>.<cid2>"
 * - `_ga_WCEKH5ZZEH` GS1.1.<sessionId>.… 或 GS2.1.s<sessionId>$…  → ga_session_id = "<sessionId>"
 * - `_gcl_aw`        GCL.<ts>.<gclid>                       → gcl_aw = "<gclid>"
 *
 * 读不到或格式不对一律省略字段，绝不抛错：埋点不阻断业务。
 */

/** GA4 测量 ID 去掉 `G-` 后的部分。gtag 据此写 `_ga_<suffix>` cookie，与 index.html 的测量 ID 保持一致。 */
const GA4_COOKIE_SUFFIX = 'WCEKH5ZZEH'

const GA_CLIENT_RE = /^GA1\.\d+\.(\d+\.\d+)$/
// GS1 的 session_id 是第三段；GS2 的 session_id 紧跟在 `s` 之后、第一个 `$` 之前。
const GA_SESSION_RE = /^(?:GS1\.1\.(\d+)(?:\.|$)|GS2\.1\.s(\d+)(?:\$|$))/
const GCL_AW_RE = /^GCL\.\d+\.([\w-]+)$/

export type GaIdentifiers = {
  ga_client_id?: string
  ga_session_id?: string
  gcl_aw?: string
}

/**
 * 从 cookie 串里取一个键的值。只做精确匹配，避免 `_ga` 误中 `_ga_WCEKH5ZZEH`；
 * 值解码失败（非法百分号编码）按读不到处理。
 */
function readCookie(cookieString: string, name: string): string {
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * 同步读出 GA4 / Google Ads 标识。`cookieString` 缺省时取 `document.cookie`（测试可直接传入）。
 * 任何异常（如沙箱 iframe 读 document.cookie 抛 SecurityError）都返回空对象。
 */
export function readGaIdentifiers(cookieString?: string): GaIdentifiers {
  try {
    const raw = cookieString ?? (typeof document === 'undefined' ? '' : document.cookie)
    const ids: GaIdentifiers = {}
    const clientId = GA_CLIENT_RE.exec(readCookie(raw, '_ga'))?.[1]
    const session = GA_SESSION_RE.exec(readCookie(raw, `_ga_${GA4_COOKIE_SUFFIX}`))
    const sessionId = session?.[1] ?? session?.[2]
    const gclId = GCL_AW_RE.exec(readCookie(raw, '_gcl_aw'))?.[1]
    if (clientId) ids.ga_client_id = clientId
    if (sessionId) ids.ga_session_id = sessionId
    if (gclId) ids.gcl_aw = gclId
    return ids
  } catch {
    return {}
  }
}
