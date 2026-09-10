import { describe, it, expect } from 'vitest'
import {
  resolveApiErrorDisplay,
  errorDisplayFields,
  cleanErrorMessage,
  defaultExperienceParams,
  dualPriceText,
  estimateComposerSpend,
  videoResolutionOptions,
  withDefaultExperienceParams,
} from './model-experience-data'
import { ModelGoApiError } from '@/lib/request'
import '@/i18n'

/** qa#549 真实载荷：国际站图片生成，Azure 内容安全拒绝（400），外层码曾误分类为 40031 */
function makeAzureRejection(code: number, msg: string) {
  return new ModelGoApiError({
    code,
    msg,
    request_id: 'f31951e5-b46c-4963-9f73-adc1c0505e80',
    trace_id: 'b13d9c3ce5fa9431fe11223b74a12232',
    data: {
      field_errors: [
        {
          field: 'upstream',
          message:
            '[BadRequestError] Your request was rejected by the safety system. If you believe this is an error, contact us at Azure support ticket and include the request ID 9d05e829-54c4-402d-89b4-eb97a2c0a147. (request_id: chatimagegen-13566ddeba714ca3b4c66801dc3ea013)',
        },
      ],
    },
  })
}

describe('resolveApiErrorDisplay', () => {
  it('40033（其他 4xx，确定性失败）：主文案用外层 msg，不可重试，上游原文降级为详情', () => {
    const err = makeAzureRejection(40033, '请求内容被上游安全策略拒绝，请修改后重试')
    const display = resolveApiErrorDisplay(err)
    expect(display.message).toBe('请求内容被上游安全策略拒绝，请修改后重试')
    expect(display.retryable).toBe(false)
    expect(display.upstreamDetail).toContain('BadRequestError')
    expect(display.upstreamDetail).toContain('Azure support ticket')
    expect(display.requestId).toBe('f31951e5-b46c-4963-9f73-adc1c0505e80')
    expect(display.traceId).toBe('b13d9c3ce5fa9431fe11223b74a12232')
  })

  it('40301（策略/权限拒绝）：同样不可重试', () => {
    const err = makeAzureRejection(40301, '无权限调用该模型')
    expect(resolveApiErrorDisplay(err).retryable).toBe(false)
  })

  it('40032（响应形状不合法）：不可重试', () => {
    const err = makeAzureRejection(40032, '上游响应格式异常')
    expect(resolveApiErrorDisplay(err).retryable).toBe(false)
  })

  it('40031（5xx/传输失败）：可重试，这是唯一"重试可能成功"的档', () => {
    const err = makeAzureRejection(40031, '上游服务暂时不可用，请稍后重试')
    const display = resolveApiErrorDisplay(err)
    expect(display.message).toBe('上游服务暂时不可用，请稍后重试')
    expect(display.retryable).toBe(true)
  })

  it('未知/旧格式错误码：走历史兜底链路，默认按可重试处理（不改变既有行为）', () => {
    const err = new ModelGoApiError({ code: 50012, msg: 'internal error', data: null })
    const display = resolveApiErrorDisplay(err)
    expect(display.retryable).toBe(true)
  })

  it('异步视频轮询终态：message.error 是纯字符串（当前 Swagger 无独立 code 字段），走 cleanErrorMessage 兜底、按可重试处理', () => {
    const display = resolveApiErrorDisplay('rate limit exceeded, please retry')
    expect(display.message).toBe(cleanErrorMessage('rate limit exceeded, please retry'))
    expect(display.retryable).toBe(true)
  })

  it('未来后端把 code 编码进持久化字符串（JSON）时，能识别出确定性失败并禁用重试', () => {
    const stored = JSON.stringify({ code: 40033, msg: '请求内容被上游安全策略拒绝，请修改后重试', request_id: 'req-1' })
    const display = resolveApiErrorDisplay(stored)
    expect(display.retryable).toBe(false)
    expect(display.message).toBe('请求内容被上游安全策略拒绝，请修改后重试')
  })

  it('undefined/空错误：不抛异常，退回发送失败兜底文案', () => {
    expect(resolveApiErrorDisplay(undefined).message).toBe(cleanErrorMessage(undefined))
  })
})

describe('errorDisplayFields', () => {
  it('把 ApiErrorDisplay 摊成 ExperienceMessage 的错误字段', () => {
    const err = makeAzureRejection(40033, '请求内容被上游安全策略拒绝，请修改后重试')
    const fields = errorDisplayFields(resolveApiErrorDisplay(err))
    expect(fields).toEqual({
      error: '请求内容被上游安全策略拒绝，请修改后重试',
      errorDetail: expect.stringContaining('BadRequestError'),
      errorRetryable: false,
      errorRequestId: 'f31951e5-b46c-4963-9f73-adc1c0505e80',
      errorTraceId: 'b13d9c3ce5fa9431fe11223b74a12232',
    })
  })
})

describe('MiniMax H3 视频体验默认参数（shared/modelgo_prd#990）', () => {
  it('文生视频缺省写入可被计费矩阵匹配的 768p，并允许用户选择 2k 覆盖', () => {
    expect(defaultExperienceParams('minimax-h3', 'text_to_video')).toEqual({ resolution: '768p', ratio: '16:9' })
    expect(withDefaultExperienceParams('minimax-h3', 'text_to_video', { resolution: '2k' })).toEqual({ resolution: '2k', ratio: '16:9' })
    expect(withDefaultExperienceParams('minimax-h3', 'text_to_video', { aspect_ratio: '9:16' })).toEqual({
      resolution: '768p', aspect_ratio: '9:16', ratio: '9:16',
    })
    expect(defaultExperienceParams('minimax-h3', 'image_to_video')).toEqual({ resolution: '768p' })
    expect(withDefaultExperienceParams('minimax-h3', 'image_to_video', { ratio: '9:16' })).toEqual({
      resolution: '768p', ratio: '9:16',
    })
    expect(videoResolutionOptions('minimax-h3')).toEqual(['768p', '2k'])
  })

  it('不改变其他视频模型的既有默认值与枚举', () => {
    expect(defaultExperienceParams('other-video', 'text_to_video')).toEqual({})
    expect(videoResolutionOptions('other-video')).toEqual(['720p', '1080p'])
  })
})

/** 价格 chip 的三条计价分支（需求方#674）。构造最小 CatalogModelItem，只给价格相关字段。 */
function priceModel(pricing: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { pricing, ...extra } as unknown as Parameters<typeof dualPriceText>[0]
}

describe('dualPriceText 计价模式分支', () => {
  // 需求方#674：Doubao Seedream 5.0 Lite（文生图）显示成「¥0.22 / ¥0 每M」——
  // 每张的价被当成输入价、不存在的输出价补成 ¥0、单位错成每 M token。
  it('per_call：单价 + /张，不拼输出价、不写每M', () => {
    const text = dualPriceText(priceModel({
      mode: 'per_call', per_call_price: '0.22', input_per_1m: '0.22', output_per_1m: '0', currency: 'CNY',
    }))
    expect(text).toBe('¥0.22/张')
    expect(text).not.toContain('每M')
    expect(text).not.toContain('/ ¥0')
  })

  it('per_call：per_call_price 缺失时回落 input_per_1m（后端把每张价塞在这个字段里）', () => {
    expect(dualPriceText(priceModel({
      mode: 'per_call', input_per_1m: '0.05', output_per_1m: '0', currency: 'CNY',
    }))).toBe('¥0.05/张')
  })

  it('per_call：单价为 0 走限时免费，不显示 ¥0/张', () => {
    const text = dualPriceText(priceModel({
      mode: 'per_call', per_call_price: '0', input_per_1m: '0', output_per_1m: '0', currency: 'CNY',
    }))
    expect(text).not.toContain('/张')
  })

  // 断言结构而不是翻译文案：单测里 i18n 未挂 modelsExperience namespace，t() 会原样回 key。
  // 这里要守的是「token 模式仍是输入/输出两段、且不带 per_call 的 /张」。
  it('token：保持「¥输入 / ¥输出 + 每M 文案」两段式不变', () => {
    const text = dualPriceText(priceModel({
      mode: 'token', input_per_1m: '6.5', output_per_1m: '27', currency: 'CNY',
    }))
    expect(text).toContain('¥6.5 / ¥27')
    expect(text).not.toContain('/张')
    expect(text).not.toContain('/image')
  })

  it('price_tiers 优先于 mode：有分档就按档展示（视频按秒 / 图片矩阵价）', () => {
    expect(dualPriceText(priceModel(
      { mode: 'per_call', per_call_price: '0.22', currency: 'CNY' },
      { price_tiers: [{ label: '480p', label_en: '480p', price: '0.1', unit: '秒', bucket: 'v' }] },
    ))).toBe('¥0.1/秒')
  })

  // 单位后缀跟**界面语言**走（priceUnitSuffix 里是 isZhLang()），与币种无关：
  // 海外用户看人民币价也该是 /image，国内用户看美元价仍是 /张。别把两者绑在一起。
  it('USD 只影响货币符号，单位后缀仍随界面语言（默认 zh → /张）', () => {
    expect(dualPriceText(priceModel({
      mode: 'per_call', per_call_price: '0.03', currency: 'USD',
    }))).toBe('$0.03/张')
  })
})

// qa#624：后端零价下发的是字符串 "0"（truthy），此前判空分支永远不进，
// 13 个未配价模型被拼成「¥0 / ¥0 每M」。§9.1：价格为 0 但未标 free 的仍按付费
// 处理，不得显示「免费」；限免真源是 promotion.free 显式标记。
describe('dualPriceText 零价与限免口径（qa#624）', () => {
  it('无 free 标记且输入/输出都是 "0" → 「—」，不显示 ¥0、不说免费', () => {
    expect(dualPriceText(priceModel({
      input_per_1m: '0', output_per_1m: '0', currency: 'CNY',
    }))).toBe('—')
  })

  it('pricing 金额全缺省 → 同样回落「—」', () => {
    expect(dualPriceText(priceModel({ currency: 'CNY' }))).toBe('—')
  })

  it('promotion.free=true 且价格为 0 → 限时免费（不再是「免费额度」）', () => {
    expect(dualPriceText(priceModel(
      { input_per_1m: '0', output_per_1m: '0', currency: 'CNY' },
      { promotion: { free: true } },
    ))).toBe('modelsExperience.limitedFree')
  })

  it('promotion.free 优先于金额：标记与 pricing 留着原价打架时以标记为准', () => {
    expect(dualPriceText(priceModel(
      { input_per_1m: '10', output_per_1m: '20', currency: 'CNY' },
      { promotion: { free: true } },
    ))).toBe('modelsExperience.limitedFree')
  })

  it('输入为 "0" 但输出有价 → 只显示输出那半（与原型数值 falsy 语义一致）', () => {
    const text = dualPriceText(priceModel({
      input_per_1m: '0', output_per_1m: '8', currency: 'CNY',
    }))
    expect(text).toContain('¥8')
    expect(text).not.toContain(' / ')
    expect(text).not.toContain('¥0')
  })
})

describe('estimateComposerSpend 预估费用口径（prd#851）', () => {
  // prd#851：Doubao-Seedream-4.0（¥0.2/张）首次进入体验页预估显示 <¥0.01——
  // 每张价被套进 token 公式（0.2/1M × 若干 token）。per_call 一次发送 = 一次调用。
  it('per_call：预估 = 单张价，与草稿长度无关', () => {
    const m = priceModel({ mode: 'per_call', per_call_price: '0.2', input_per_1m: '0.2', output_per_1m: '0', currency: 'CNY' })
    expect(estimateComposerSpend(m, '一只在月球上的猫', 4096, '¥')).toBe('¥0.20')
    expect(estimateComposerSpend(m, '', 4096, '¥')).toBe('¥0.20')
  })

  it('per_call：per_call_price 缺失回落 input_per_1m 镜像', () => {
    const m = priceModel({ mode: 'per_call', input_per_1m: '0.05', output_per_1m: '0', currency: 'CNY' })
    expect(estimateComposerSpend(m, 'x', 4096, '¥')).toBe('¥0.05')
  })

  it('per_call：单价为 0 显示 ¥0.00（未配价），不显示 <¥0.01', () => {
    const m = priceModel({ mode: 'per_call', per_call_price: '0', input_per_1m: '0', output_per_1m: '0', currency: 'CNY' })
    expect(estimateComposerSpend(m, 'x', 4096, '¥')).toBe('¥0.00')
  })

  it('token：短草稿仍是 <¥0.01，行为不因抽函数改变', () => {
    const m = priceModel({ mode: 'token', input_per_1m: '0.95', output_per_1m: '1.9', currency: 'CNY' })
    expect(estimateComposerSpend(m, '你好', 4096, '¥')).toBe('<¥0.01')
  })

  it('token：大 max_tokens 上限按 400 截断（原型 estimatePlaygroundTaskSpend）', () => {
    const m = priceModel({ mode: 'token', input_per_1m: '0', output_per_1m: '100', currency: 'CNY' })
    // 400 token × ¥100/1M = ¥0.04
    expect(estimateComposerSpend(m, 'x', 128000, '¥')).toBe('¥0.04')
  })

  it('未选模型 → ¥0.00', () => {
    expect(estimateComposerSpend(null, 'x', 4096, '¥')).toBe('¥0.00')
  })
})
