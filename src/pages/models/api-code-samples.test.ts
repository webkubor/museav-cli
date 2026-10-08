/**
 * API 代码示例生成器单测。
 *
 * 锚点：2026-08-28 线上（console.modelgo.com / console.modelgo.ai 双站实测）详情页
 * 「API 接入」的协议 Tab 出现空块——后端 public_protocols 扩到 42 值时本模块没跟上，
 * `content_generation` 既没文案也没端点。本文件钉住三类回归：
 *  1. 后端下发的每个协议都能映射出「有文案 + 有端点」的内部值，不再产生空 Tab；
 *  2. 生成的示例里任何位置都不出现 `undefined`（`https://api.modelgo.aiundefined`
 *     就是端点表漏键拼出来的）；
 *  3. 端点路径与网关探活结果一致（Anthropic 家族是 /v1/messages，不是 /messages）。
 */

import { afterAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import {
  PROTOCOL_LABEL,
  PROTOCOL_LABEL_EN,
  buildCodeSample,
  languageLabel,
  languagesForProtocol,
  mapApiProtocols,
  type ApiCodeLanguage,
  type ApiProtocol,
} from './api-code-samples'
import type { PublicProtocol } from '@/types'

// 语言是全局单例，改完还回去，免得污染同文件/同 worker 的其他断言
afterAll(async () => { await i18n.changeLanguage('zh') })

/** ApiProtocol 的运行时全集：PROTOCOL_LABEL 是 Record<ApiProtocol, string>，由类型保证穷尽。 */
const ALL_API_PROTOCOLS = Object.keys(PROTOCOL_LABEL) as ApiProtocol[]

describe('mapApiProtocols — 后端协议 → 内部协议', () => {
  it('dashscope_realtime 保留为 WebSocket 专用示例协议', () => {
    expect(mapApiProtocols(['dashscope_realtime'])).toEqual(['dashscope_realtime'])
    expect(languagesForProtocol('dashscope_realtime')).toEqual(['nodejs', 'python'])
    expect(languageLabel('dashscope_realtime', 'nodejs')).toBe('Node.js')
    expect(languageLabel('dashscope_realtime', 'python')).toBe('Python')
  })
  it('content_generation 原样保留，不被丢掉也不折成 native（线上空 Tab 的直接成因）', () => {
    expect(mapApiProtocols(['content_generation'])).toEqual(['content_generation'])
  })

  it('线上视频模型的真实组合按 sortProtocols 排序：openai_video 在 content_generation 前', () => {
    // doubao-seedance-2.0-fast / kling-3.0 等 17（国外）/ 8（国内）个模型的真实下发值
    expect(mapApiProtocols(['content_generation', 'openai_video'])).toEqual([
      'openai_video',
      'content_generation',
    ])
  })

  it('各家原生透传与旧 other 折成 native，并且去重（不产生两个一样的 Tab）', () => {
    expect(mapApiProtocols(['kling_text2video', 'kling_image2video', 'other'])).toEqual(['native'])
    expect(mapApiProtocols(['gemini_predict', 'ark_tokenization', 'vidu_img2video'])).toEqual(['native'])
  })

  it('过渡期旧值原样保留', () => {
    expect(mapApiProtocols(['openai', 'anthropic'])).toEqual(['openai', 'anthropic'])
  })

  it('运行时收到比 PublicProtocol 更新的值 → 折成 native，绝不原样透传', () => {
    // 后端先发、前端还没跟的情形。透传的下场就是没文案的空 Tab + undefined 拼进 URL。
    const fromFuture = ['some_vendor_brand_new_thing'] as unknown as PublicProtocol[]
    expect(mapApiProtocols(fromFuture)).toEqual(['native'])
  })

  it('空/缺省输入返回空数组（由调用方决定兜底协议）', () => {
    expect(mapApiProtocols(undefined)).toEqual([])
    expect(mapApiProtocols([])).toEqual([])
  })
})

describe('协议文案 — 不允许出现空标签', () => {
  it('每个内部协议在中英两张兜底表里都有非空文案', () => {
    for (const p of ALL_API_PROTOCOLS) {
      expect(PROTOCOL_LABEL[p], `PROTOCOL_LABEL 缺 ${p}`).toBeTruthy()
      expect(PROTOCOL_LABEL_EN[p], `PROTOCOL_LABEL_EN 缺 ${p}`).toBeTruthy()
    }
  })

  it('两张表的键集完全一致', () => {
    expect(Object.keys(PROTOCOL_LABEL).sort()).toEqual(Object.keys(PROTOCOL_LABEL_EN).sort())
  })

  it('content_generation 与后端目录、model-format 同口径', () => {
    expect(PROTOCOL_LABEL.content_generation).toBe('Content Generation')
    expect(PROTOCOL_LABEL_EN.content_generation).toBe('Content Generation')
  })
})

describe('buildCodeSample — 端点与请求体', () => {
  it('Realtime 使用 WebSocket endpoint 和 Authorization header，不生成 chat completions 示例', () => {
    const node = buildCodeSample('dashscope_realtime', 'nodejs', 'qwen3.8-omni-flash-realtime')
    expect(node).toContain('/api-ws/v1/realtime?model=qwen3.8-omni-flash-realtime')
    expect(node).toMatch(/wss:\/\/api\.[^/]+\/api-ws\/v1\/realtime/)
    expect(node).toContain('Authorization:')
    expect(node).toContain('${process.env.MODELGO_API_KEY}')
    expect(node).toContain('session.update')
    expect(node).not.toContain('/v1/chat/completions')

    const python = buildCodeSample('dashscope_realtime', 'python', 'qwen3.8-omni-flash-realtime')
    expect(python).toContain('websockets.connect')
    expect(python).toContain('MODELGO_API_KEY')
    expect(python).not.toContain('/v1/chat/completions')
  })
  it('content_generation 打平台托管异步任务入口，请求体是 model + prompt', () => {
    const curl = buildCodeSample('content_generation', 'curl', 'doubao-seedance-2.0-fast')
    expect(curl).toContain('/v1/content_generation/tasks')
    expect(curl).toContain('"model":"doubao-seedance-2.0-fast"')
    expect(curl).toContain('"prompt"')
    // 不是 chat messages 形状
    expect(curl).not.toContain('"messages"')
  })

  it('Anthropic 家族是 /v1/messages —— 旧的 /messages 两个网关都实测 404', () => {
    for (const p of ['anthropic', 'anthropic_messages'] as ApiProtocol[]) {
      const curl = buildCodeSample(p, 'curl', 'claude-sonnet-5')
      expect(curl).toContain('/v1/messages')
      expect(curl).not.toMatch(/\.(com|ai)\/messages/)
    }
  })

  it('native 不再指向已下线的 /v1/native/generate', () => {
    const curl = buildCodeSample('native', 'curl', 'some-video-model')
    expect(curl).not.toContain('/v1/native/generate')
    expect(curl).toContain('/v1/content_generation/tasks')
  })

  it('Python (Anthropic) 的 base_url 保持裸域名（SDK 自己拼 /v1/messages）', () => {
    const py = buildCodeSample('anthropic_messages', 'python', 'claude-sonnet-5')
    expect(py).toContain('base_url=')
    expect(py).not.toContain('base_url="https://undefined')
    expect(py).not.toMatch(/base_url="[^"]*\/v1"/)
  })

  it('任何协议 × 任何语言的示例里都不出现 undefined', () => {
    for (const p of ALL_API_PROTOCOLS) {
      for (const lang of languagesForProtocol(p)) {
        const code = buildCodeSample(p, lang, 'test-model')
        expect(code, `${p}/${lang} 生成了空示例`).toBeTruthy()
        expect(code, `${p}/${lang} 示例里有 undefined`).not.toContain('undefined')
      }
    }
  })
})

describe('languageLabel — SDK 后缀只挂在真用 SDK 的协议上', () => {
  it('平台托管链路（content_generation / native）不挂 (OpenAI) 后缀', () => {
    for (const p of ['content_generation', 'native'] as ApiProtocol[]) {
      expect(languageLabel(p, 'python')).toBe('Python')
      expect(languageLabel(p, 'nodejs')).toBe('Node.js')
    }
  })

  it('OpenAI / Anthropic 家族保持原有后缀', () => {
    expect(languageLabel('openai_chat_completions', 'python')).toBe('Python (OpenAI)')
    expect(languageLabel('openai_chat_completions', 'nodejs')).toBe('Node.js (OpenAI)')
    expect(languageLabel('anthropic_messages', 'python')).toBe('Python (Anthropic)')
  })

  it('语言 Tab 集合非空且互不重复', () => {
    for (const p of ALL_API_PROTOCOLS) {
      const langs = languagesForProtocol(p)
      expect(langs.length, `${p} 没有语言 Tab`).toBeGreaterThan(0)
      expect(new Set(langs).size).toBe(langs.length)
      langs.forEach((l: ApiCodeLanguage) => expect(languageLabel(p, l)).toBeTruthy())
    }
  })
})

describe('示例注释跟界面语言走（国际站翻译适配 prd#1098）', () => {
  /** 示例代码是「复制即用」的产物，注释也是用户读到的文案：英文站不能漏中文出去。 */
  const CJK = /[\u4e00-\u9fff]/

  it('英文界面下所有协议 × 所有语言的示例都不含中文', async () => {
    await i18n.changeLanguage('en')
    for (const p of ALL_API_PROTOCOLS) {
      for (const lang of languagesForProtocol(p)) {
        const code = buildCodeSample(p, lang, 'demo-model')
        expect(CJK.test(code), `${p}/${lang} 英文示例里仍有中文：${code}`).toBe(false)
      }
    }
  })

  it('中文界面保留原中文注释（只做语言分支，不是删中文）', async () => {
    await i18n.changeLanguage('zh')
    expect(buildCodeSample('openai_speech', 'typescript', 'demo-model')).toContain('二进制音频数据')
    expect(buildCodeSample('anthropic_messages', 'claudeCode', 'demo-model')).toContain('指定当前模型启动')
  })
})
