/**
 * API 代码示例生成器单测。
 *
 * 锚点：2026-08-28 线上（console.modelgo.com / console.modelgo.ai 双站实测）详情页
 * 「API 接入」的协议 Tab 出现空块——后端 public_protocols 扩到 42 值时本模块没跟上，
 * `content_generation` 既没文案也没端点。详情页 prd#1272 已拆到官网，后端协议 → 内部协议
 * 的映射随之删除；本文件仍钉住两类回归：
 *  1. 生成的示例里任何位置都不出现 `undefined`（`https://api.modelgo.aiundefined`
 *     就是端点表漏键拼出来的），每个内部协议都有文案与语言 Tab；
 *  2. 端点路径与网关探活结果一致（Anthropic 家族是 /v1/messages，不是 /messages）。
 */

import { afterAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import {
  PROTOCOL_LABEL,
  PROTOCOL_LABEL_EN,
  buildCodeSample,
  languagesForProtocol,
  type ApiProtocol,
} from './api-code-samples'

// 语言是全局单例，改完还回去，免得污染同文件/同 worker 的其他断言
afterAll(async () => { await i18n.changeLanguage('zh') })

/** ApiProtocol 的运行时全集：PROTOCOL_LABEL 是 Record<ApiProtocol, string>，由类型保证穷尽。 */
const ALL_API_PROTOCOLS = Object.keys(PROTOCOL_LABEL) as ApiProtocol[]

describe('languagesForProtocol — 语言 Tab', () => {
  it('dashscope_realtime 只给 WebSocket 能用的 Node.js / Python', () => {
    expect(languagesForProtocol('dashscope_realtime')).toEqual(['nodejs', 'python'])
  })

  it('语言 Tab 集合非空且互不重复', () => {
    for (const p of ALL_API_PROTOCOLS) {
      const langs = languagesForProtocol(p)
      expect(langs.length, `${p} 没有语言 Tab`).toBeGreaterThan(0)
      expect(new Set(langs).size).toBe(langs.length)
    }
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
