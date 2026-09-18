/**
 * 调用日志详情「请求 / 响应原文」空态回归（2026-09-17 cn 事故）。
 *
 * 事故现象：工作区明明开着输入/输出日志、原文也在 OSS 上，打开详情却显示
 * 「该工作空间未开启输入/输出日志」。根因在后端（空间负责人读自己调用的
 * payload 被判越权 → 40401），但前端把两种完全不同的情况合并成了同一句话：
 *   ① 原文接口报错（40401 / 5xx）—— 拿不到，可能是可见范围或服务异常；
 *   ② 接口成功但正文为空 —— 空间确实没开采集，或该次调用早于开关开启（#557）。
 * 这里钉住「两者必须显示不同文案，且报错态给重试入口」。
 *
 * 契约夹具，不代表 test 环境联调证据。路由：/logs（组件级）。
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CallLogItem } from '@/types'
import zh from '@/locales/zh/logs.json'

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const path = key.replace(/^logs\./, '').split('.')
      let node: unknown = zh.logs
      for (const seg of path) node = (node as Record<string, unknown>)?.[seg]
      const text = typeof node === 'string' ? node : key
      return vars ? `${text}:${Object.values(vars).join('/')}` : text
    },
  }),
}))

import { TranscriptSection } from './detail'

function makeRow(over: Partial<CallLogItem> = {}): CallLogItem {
  return {
    call_log_id: 'c1',
    request_id: 'gw_test',
    started_at: '2026-09-17T00:00:00Z',
    duration_ms: 1200,
    model: { id: 'm', display_name: 'GPT' },
    provider: { id: 'p', name: 'openai', type: 'llm' },
    workspace_id: '01kzraghy4v3sgdfnnn711xkr0',
    tenant_id: 't',
    trace_id: 'tr',
    requested_model: 'gpt',
    upstream_model: 'gpt',
    path: '/v1/chat',
    call_type: 'chat',
    http_status: 200,
    tpot_ms: 0,
    fallback_count: 0,
    api_key: { api_key_id: 'k', name: 'key', masked: '***' },
    api_key_type: 'personal',
    account: { account_id: 'a', display_name: 'user' },
    app_name: null,
    status: 'succeeded',
    finish_reason: 'stop',
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cache_read_tokens: 0, cache_write_tokens: 0 },
    usage_type: 'billed',
    speed: { tps: 10, first_token_ms: 100 },
    cost: { amount: '0.01', currency: 'USD' },
    billing_status: 'billed',
    error: null,
    ...over,
  }
}

function renderSection(over: {
  requestPayloadText?: string
  responsePayloadText?: string
  payloadFailed?: boolean
  payloadLoading?: boolean
} = {}) {
  return render(
    <TranscriptSection
      row={makeRow()}
      requestPayloadText={over.requestPayloadText ?? ''}
      responsePayloadText={over.responsePayloadText ?? ''}
      payloadFailed={over.payloadFailed}
      payloadLoading={over.payloadLoading ?? false}
      payloadView="raw"
      onPayloadViewChange={() => {}}
      onDownload={() => {}}
      onRetryPayload={() => {}}
      onOpenLogSettings={() => {}}
    />,
  )
}

describe('登录日志详情 · 原文空态', () => {
  it('接口报错时说明是「获取失败」，不指控空间没开采集，并给重试', () => {
    renderSection({ payloadFailed: true })
    expect(screen.getByText(zh.logs.detail.payload.fetchFailedTitle)).toBeTruthy()
    // 事故的那句话绝不能出现在报错态里 —— 空间开关可能是开着的
    expect(screen.queryByText(zh.logs.detail.payload.captureDisabledTitle)).toBeNull()
    expect(screen.getByText(zh.logs.detail.payload.retry)).toBeTruthy()
    // 报错态不给「去开启日志与转发」的引导（会把用户带向错误的方向）
    expect(screen.queryByText(zh.logs.detail.payload.openSettings)).toBeNull()
  })

  it('接口成功但正文为空时，才提示「该工作空间未开启输入/输出日志」', () => {
    renderSection({ payloadFailed: false })
    expect(screen.getByText(zh.logs.detail.payload.captureDisabledTitle)).toBeTruthy()
    expect(screen.getByText(zh.logs.detail.payload.openSettings)).toBeTruthy()
    expect(screen.queryByText(zh.logs.detail.payload.fetchFailedTitle)).toBeNull()
  })

  it('拿到正文时正常渲染两栏，不出现任何空态', () => {
    renderSection({ requestPayloadText: '{"model":"gpt"}', responsePayloadText: '{"ok":true}' })
    expect(screen.queryByText(zh.logs.detail.payload.captureDisabledTitle)).toBeNull()
    expect(screen.queryByText(zh.logs.detail.payload.fetchFailedTitle)).toBeNull()
    expect(screen.getByText(zh.logs.detail.payload.captureEnabled)).toBeTruthy()
  })
})
