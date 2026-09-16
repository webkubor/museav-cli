/**
 * qa#719 异步日志渲染回归：契约夹具，不代表 test 环境联调证据。
 * 路由：/logs。
 */
import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CallLogItem } from '@/types'
import { isAsyncCall } from './async-call'
import zh from '@/locales/zh/logs.json'
import en from '@/locales/en/logs.json'

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'logs.metrics.asyncNotCounted') return zh.logs.metrics.asyncNotCounted
      if (key === 'logs.metrics.noTokens') return zh.logs.metrics.noTokens
      return vars ? `${key}:${Object.values(vars).join('/')}` : key
    },
  }),
}))
vi.mock('@/components/ui/SideSheet', () => ({
  SideSheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => false }) }))
vi.mock('@/services/api-keys', () => ({ listApiKeys: async () => ({ items: [] }) }))
vi.mock('@/services/tenants', () => ({ listTenantMembers: async () => ({ items: [] }) }))
const getTask = vi.fn().mockResolvedValue({})
vi.mock('@/services/tasks', () => ({ getTask: (...args: unknown[]) => getTask(...args) }))
const get = vi.fn()
vi.mock('@/lib/request', () => ({ get: (...args: unknown[]) => get(...args) }))

import { LogsTable } from './components'
import { LogDetailSheet } from './detail'
import { listCallLogs } from '@/services/logs'

/** 造一条最小可用的日志记录，按需覆盖字段。 */
function makeRow(over: Partial<CallLogItem> = {}): CallLogItem {
  return {
    call_log_id: 'c1',
    request_id: 'r1',
    started_at: '2026-07-11T00:00:00Z',
    duration_ms: 1200,
    model: { id: 'm', display_name: 'GPT' },
    provider: { id: 'p', name: 'openai', type: 'llm' },
    workspace_id: 'w',
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

function renderTable(row: CallLogItem) {
  return render(<LogsTable items={[row]} hasMore={false} isFetching={false} isLoading={false}
    onNext={() => {}} onPrev={() => {}} onSelectLog={() => {}} page={1} />)
}

function renderDetail(row: CallLogItem) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>
    <LogDetailSheet row={row} open onClose={() => {}} requestPayloadText="" responsePayloadText=""
      payloadView="parsed" onPayloadViewChange={() => {}} payloadLoading={false} onDownload={() => {}} />
  </QueryClientProvider>)
}

const asyncMarkers: Partial<CallLogItem>[] = [
  { call_mode: 'async' },
  { call_kind: 'async_task' },
  { call_mode: 'sync', call_kind: 'async_task' },
]
const emptyUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }

describe('qa#719 异步调用', () => {
  it.each(asyncMarkers)('任一标记识别异步：%o', (marker) => {
    expect(isAsyncCall(marker)).toBe(true)
    renderTable(makeRow({ ...marker, usage: emptyUsage }))
    expect(screen.getAllByText('异步任务暂不统计')).toHaveLength(2)
    expect(screen.queryByText('未产生 Token')).toBeNull()
    expect(screen.queryByText(/logs.table.firstTokenLatency/)).toBeNull()
    expect(screen.queryByTitle('logs.table.latencyTooltip')).toBeNull()
    expect(screen.getByText(/logs.detail.diagnostics.totalDuration/)).toBeTruthy()
    expect(screen.getByText(/0.01/)).toBeTruthy()
  })

  it.each([{}, { call_mode: null, call_kind: null }, { call_kind: 'mcp_tool_call' as const }])(
    '缺失标记或同步 MCP 保留同步空态：%o', (marker) => {
      expect(isAsyncCall(marker)).toBe(false)
      renderTable(makeRow({ ...marker, usage: emptyUsage }))
      expect(screen.getByText('未产生 Token')).toBeTruthy()
      expect(screen.getByText(/logs.table.firstTokenLatency/)).toBeTruthy()
    },
  )

  it('异步有 Token 时保留实际用量', () => {
    renderTable(makeRow({ call_mode: 'async' }))
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.getAllByText('异步任务暂不统计')).toHaveLength(1)
  })

  it('异步缺少费用/耗时时显示占位，不伪造零值', () => {
    renderTable(makeRow({ call_kind: 'async_task', duration_ms: 0, cost: { amount: '', currency: 'USD' }, usage: emptyUsage }))
    expect(screen.queryByText(/logs.detail.diagnostics.totalDuration/)).toBeNull()
    expect(screen.queryByText(/NaN|undefined|0ms/)).toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it.each(asyncMarkers)('详情隐藏首包、TPOT/TPM 和瀑布，保留费用总耗时：%o', (marker) => {
    renderDetail(makeRow({ ...marker, usage: emptyUsage, model_request_state: 'not_started' }))
    expect(screen.queryByText('TPOT')).toBeNull()
    expect(screen.queryByText('TPM')).toBeNull()
    expect(screen.queryByText(/logs.detail.diagnostics.firstTokenHint/)).toBeNull()
    expect(screen.queryByText('logs.detail.timing.firstToken')).toBeNull()
    expect(screen.queryByText('logs.detail.timing.totalResponse')).toBeNull()
    expect(screen.getAllByText('异步任务暂不统计').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('logs.detail.diagnostics.totalDuration')).toBeTruthy()
    expect(screen.getByText(/0.01/)).toBeTruthy()
  })

  it('任务探测优先用 async_task_id', async () => {
    renderDetail(makeRow({ call_mode: 'async', async_task_id: 'task-719' }))
    await waitFor(() => expect(getTask).toHaveBeenCalledWith('task-719'))
  })

  it('任务 ID 缺失时保留历史 request_id 探测', async () => {
    renderDetail(makeRow({ async_task_id: null, request_id: 'legacy-719' }))
    await waitFor(() => expect(getTask).toHaveBeenCalledWith('legacy-719'))
  })

  it('中英文都有新的空态翻译', () => {
    expect(zh.logs.metrics.asyncNotCounted).toBe('异步任务暂不统计')
    expect(en.logs.metrics.asyncNotCounted).toBeTruthy()
    expect(en.logs.metrics.asyncNotCounted).not.toBe(en.logs.metrics.noTokens)
  })

  it('接口组装保留契约字段，缺失值不会被填成 0/false', async () => {
    get.mockResolvedValue({ items: [
      makeRow({ call_mode: 'async', call_kind: 'async_task', async_task_id: 'task-719', response_mode: 'blocking' }),
      makeRow(),
    ] })
    const result = await listCallLogs()
    expect(result.items[0]).toMatchObject({
      call_mode: 'async', call_kind: 'async_task', async_task_id: 'task-719', response_mode: 'blocking',
    })
    for (const field of ['call_mode', 'call_kind', 'async_task_id', 'response_mode'] as const) {
      expect(result.items[1][field]).toBeUndefined()
    }
  })
})
