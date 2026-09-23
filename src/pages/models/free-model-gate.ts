/**
 * 免费模型使用门槛（需求方 #833，1.0.6）的后端错误码识别。
 *
 * 后端（billing 经 gateway 透传，note 15550）在发送时返回两个独立错误码：
 *   - `4032 / free_model_balance_required`   主余额 ≤ 0 → 场景一（#1091 起只看主余额/现金，赠送与奖励不计入；
 *     原 #833 口径是可用合计 ≤ 0）
 *   - `4291 / free_model_daily_limit_reached` 当日 1000 次已用完 → 场景三（今日免费调用已达上限）
 * 它们与 #914 的每分钟限频（429 + rate_limit）是两条不同规则，不复用同一个码。
 *
 * 错误到前端有三种形状，这里统一识别：
 *   1. 媒体同步调用抛的 ModelGoApiError：有数字 `code`（可能是 4032/4291 本身，也可能是
 *      web-api 归类后的 40033 外层码 + `data.field_errors[0].message` 里的上游原文）
 *   2. SSE 非 2xx：ai-sse-kit 只抛 `new Error(msg)`，只剩一段文本（`data.details[0].message`
 *      / `msg` 之一），数字码已丢 → 只能靠文本里的原因串
 *   3. 流内 error 帧：同样只有 message 文本
 * 所以按「数字码命中」或「任意文本里出现原因串」双路判定；原因串比对前做归一化
 * （小写 + 非字母数字折成 `_`），"Free model daily limit reached" 与
 * `free_model_daily_limit_reached` 同判。
 *
 * ⚠️ 实测链路（gateway test 分支 `pkg/gateway/call_context.go` + web-api
 * `pkg/handler/experience/handler.go`）：web-api 把网关的非 2xx **原样透传**给控制台，
 * 网关信封是 `{error:{code:<HTTP 状态>, message:<英文人话>, metadata:{reason, app_error_id}}}`；
 * ai-sse-kit 只把 `error.message` 装进 `new Error()`，`metadata.reason` 与 `app_error_id`
 * 到前端已丢。因此还要认网关那两句固定英文（有单测钉住，`quotaErrorMessage` /
 * `policyErrorMessage`）：
 *   - "today's free-model quota has been reached; please try again after midnight Beijing time or switch to another model"
 *   - "this free model requires the account to keep available balance above zero; please top up to continue"
 */
import i18n from '@/i18n'

export type FreeModelGate = 'balance_required' | 'daily_limit'

const BALANCE_REQUIRED_CODE = 4032
const DAILY_LIMIT_CODE = 4291
const BALANCE_REQUIRED_REASON = 'free_model_balance'
const DAILY_LIMIT_REASON = 'free_model_daily_limit'
/** 网关固定英文人话（归一化后的判别片段），见文件头注释 */
const DAILY_LIMIT_MESSAGE_HINT = 'free_model_quota_has_been_reached'
const BALANCE_REQUIRED_MESSAGE_HINT = 'free_model_requires_the_account_to_keep_available_balance'

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

function collectTexts(err: unknown, out: string[], depth = 0): void {
  if (err === null || err === undefined || depth > 4) return
  if (typeof err === 'string') {
    out.push(err)
    return
  }
  if (typeof err !== 'object') return
  if (err instanceof Error) {
    out.push(err.message)
  }
  for (const [key, value] of Object.entries(err as Record<string, unknown>)) {
    if (key === 'stack') continue
    if (typeof value === 'string') out.push(value)
    else if (typeof value === 'object' && value !== null) collectTexts(value, out, depth + 1)
  }
}

function collectCodes(err: unknown): number[] {
  const codes: number[] = []
  const direct = (err as { code?: unknown } | undefined)?.code
  if (typeof direct === 'number') codes.push(direct)
  if (typeof err === 'string') {
    try {
      const parsed = JSON.parse(err) as { code?: unknown }
      if (typeof parsed.code === 'number') codes.push(parsed.code)
    } catch {
      // 非 JSON 字符串：没有数字码可取
    }
  }
  return codes
}

/** 从发送失败的错误里识别免费模型门槛；不是门槛错误返回 null（调用方走原有通用报错链路）。 */
export function detectFreeModelGate(err: unknown): FreeModelGate | null {
  if (err === null || err === undefined) return null
  const codes = collectCodes(err)
  if (codes.includes(DAILY_LIMIT_CODE)) return 'daily_limit'
  if (codes.includes(BALANCE_REQUIRED_CODE)) return 'balance_required'

  const texts: string[] = []
  collectTexts(err, texts)
  const normalized = texts.map(normalize)
  if (normalized.some((s) => s.includes(DAILY_LIMIT_REASON) || s.includes(DAILY_LIMIT_MESSAGE_HINT))) return 'daily_limit'
  if (normalized.some((s) => s.includes(BALANCE_REQUIRED_REASON) || s.includes(BALANCE_REQUIRED_MESSAGE_HINT))) return 'balance_required'
  return null
}

/** 命中门槛时报错气泡用的本地化主文案（与提示条标题同一句），替代网关原样透传的英文人话。 */
export function freeModelGateMessage(gate: FreeModelGate): string {
  return gate === 'daily_limit'
    ? i18n.t('modelsExperience.freeDailyLimitTitle')
    : i18n.t('modelsExperience.balanceZeroFreeTitle', { symbol: '' })
}
