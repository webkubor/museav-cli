import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'
import type { DeadLetter, ForwardItem, LoggingConfig } from '@/types'

const PREFIX = '/api/v1'

let loggingConfig: LoggingConfig = {
  input_output_logging_enabled: true,
  broadcast_enabled: false,
  retention_days: 30,
}

const forwards: ForwardItem[] = [
  {
    forward_id: '01HV3KFWD000000000000001',
    platform: 'opentelemetry',
    name: 'OpenTelemetry Demo',
    enabled: true,
    config: { endpoint: 'https://otel.example.com/v1/logs' },
    scope: { workspace_ids: ['01HV3KWS000000000000001'] },
    last_success_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    last_error: null,
  },
]

const deadLetters: DeadLetter[] = [
  {
    dead_letter_id: '01HV3KDL0000000000000001',
    forward_id: '01HV3KFWD000000000000001',
    platform: 'opentelemetry',
    payload_excerpt: '{"workspace_id":"01HV3KWS000000000000001","event":"chat.completion"}',
    error_message: 'Upstream endpoint timed out after 30s',
    attempts: 3,
    status: 'pending',
    created_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    last_attempted_at: new Date(Date.now() - 15 * 60_000).toISOString(),
  },
  {
    dead_letter_id: '01HV3KDL0000000000000002',
    forward_id: '01HV3KFWD000000000000001',
    platform: 'opentelemetry',
    payload_excerpt: '{"workspace_id":"01HV3KWS000000000000001","event":"usage.aggregate"}',
    error_message: 'Received HTTP 401 from destination',
    attempts: 5,
    status: 'retrying',
    created_at: new Date(Date.now() - 8 * 60 * 60_000).toISOString(),
    last_attempted_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    dead_letter_id: '01HV3KDL0000000000000003',
    forward_id: '01HV3KFWD000000000000001',
    platform: 'datadog',
    payload_excerpt: '{"workspace_id":"01HV3KWS000000000000001","event":"budget.alert"}',
    error_message: 'Destination rejected payload schema',
    attempts: 2,
    status: 'ignored',
    created_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
    last_attempted_at: new Date(Date.now() - 20 * 60 * 60_000).toISOString(),
  },
]

export const observabilityHandlers = [
  http.get(`${PREFIX}/workspaces/:workspaceId/observability/logging`, () =>
    HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: loggingConfig })
  ),

  http.patch(`${PREFIX}/workspaces/:workspaceId/observability/logging`, async ({ request }) => {
    const body = (await request.json()) as Partial<LoggingConfig>
    loggingConfig = { ...loggingConfig, ...body }
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: loggingConfig })
  }),

  http.get(`${PREFIX}/observability/platforms`, () =>
    HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        items: [
          {
            platform: 'opentelemetry',
            display_name: 'OpenTelemetry',
            logo_url: '',
            config_schema: {
              fields: [
                { key: 'endpoint', type: 'string', required: true, label: 'Endpoint' },
                { key: 'token', type: 'secret', required: false, label: 'Token' },
              ],
            },
          },
          {
            platform: 'datadog',
            display_name: 'Datadog',
            logo_url: '',
            config_schema: {
              fields: [{ key: 'apiKey', type: 'secret', required: true, label: 'API Key' }],
            },
          },
        ],
      },
    })
  ),

  http.get(`${PREFIX}/tenants/:tenantId/observability/forwards`, () =>
    HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: { items: forwards } })
  ),

  http.post(`${PREFIX}/tenants/:tenantId/observability/forwards`, async ({ request }) => {
    const body = (await request.json()) as Omit<
      ForwardItem,
      'forward_id' | 'last_success_at' | 'last_error'
    >
    const forward: ForwardItem = {
      ...body,
      forward_id: uuid(),
      last_success_at: null,
      last_error: null,
    }
    forwards.unshift(forward)
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: forward })
  }),

  http.patch(
    `${PREFIX}/tenants/:tenantId/observability/forwards/:forwardId`,
    async ({ request, params }) => {
      const body = (await request.json()) as Partial<ForwardItem>
      const idx = forwards.findIndex((item) => item.forward_id === params.forwardId)
      if (idx !== -1) forwards[idx] = { ...forwards[idx], ...body }
      return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: forwards[idx] })
    }
  ),

  http.delete(`${PREFIX}/tenants/:tenantId/observability/forwards/:forwardId`, ({ params }) => {
    const idx = forwards.findIndex((item) => item.forward_id === params.forwardId)
    if (idx !== -1) forwards.splice(idx, 1)
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: null })
  }),

  http.get(`${PREFIX}/tenants/:tenantId/observability/dead-letters`, ({ request }) => {
    const url = new URL(request.url)
    const forwardId = url.searchParams.get('forward_id')
    const status = url.searchParams.get('status')
    const cursor = url.searchParams.get('cursor')
    const pageSize = Number(url.searchParams.get('page_size') ?? 10)
    const start = cursor ? Number(cursor) : 0
    const filtered = deadLetters.filter((item) => {
      if (forwardId && item.forward_id !== forwardId) return false
      if (status && item.status !== status) return false
      return true
    })
    const items = filtered.slice(start, start + pageSize)
    const nextCursor = start + pageSize < filtered.length ? String(start + pageSize) : null

    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        items,
        has_more: Boolean(nextCursor),
        next_cursor: nextCursor,
        page_size: pageSize,
      },
    })
  }),

  http.post(
    `${PREFIX}/tenants/:tenantId/observability/dead-letters/:deadLetterId/retry`,
    ({ params }) => {
      const idx = deadLetters.findIndex((item) => item.dead_letter_id === params.deadLetterId)
      if (idx !== -1) {
        deadLetters[idx] = {
          ...deadLetters[idx],
          status: 'retrying',
          attempts: deadLetters[idx].attempts + 1,
          last_attempted_at: new Date().toISOString(),
        }
      }
      return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: null })
    }
  ),

  http.delete(
    `${PREFIX}/tenants/:tenantId/observability/dead-letters/:deadLetterId`,
    ({ params }) => {
      const idx = deadLetters.findIndex((item) => item.dead_letter_id === params.deadLetterId)
      if (idx !== -1) {
        deadLetters[idx] = { ...deadLetters[idx], status: 'ignored' }
      }
      return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: null })
    }
  ),
]
