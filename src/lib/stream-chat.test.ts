/**
 * SSE 流式工具测试（两层：streamSSE 协议无关分帧 + 协议适配器）
 * 路由：全局
 * API：无（mock fetch）
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { streamSSE, readSSE, extractHTTPError, createOpenAIStream, createCustomEventStream } from '@/lib/stream-chat'

/** 构造一个假的 ReadableStream，按 chunks 顺序吐字符串 */
function makeReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c))
      controller.close()
    },
  })
}

/** SSE 风格成功响应 */
function sseResponse(chunks: string[]): Response {
  return new Response(makeReadableStream(chunks), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const collectEvents = async (gen: AsyncGenerator<{ event: string; data: string }>) => {
  const out: { event: string; data: string }[] = []
  for await (const ev of gen) out.push({ event: ev.event, data: ev.data })
  return out
}

const collectDeltas = async (gen: AsyncGenerator<string>) => {
  const out: string[] = []
  for await (const d of gen) out.push(d)
  return out
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamSSE（第一层：协议无关分帧）', () => {
  it('基本：逐帧派发，空行分帧', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(['data: A\n\ndata: B\n\n']),
    )

    const events = await collectEvents(streamSSE({ url: '/api', body: {} }))

    expect(events).toEqual([
      { event: 'message', data: 'A' },
      { event: 'message', data: 'B' },
    ])
  })

  it('chunk 边界切断换行仍正确分帧（buffer/pop）', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(['data: A\n\nda', 'ta: B\n\n']),
    )

    const events = await collectEvents(streamSSE({ url: '/api', body: {} }))

    expect(events).toEqual([
      { event: 'message', data: 'A' },
      { event: 'message', data: 'B' },
    ])
  })

  it('chunk 切断单个 UTF-8 字符不乱码（中文截断）', async () => {
    // "你好" 的 UTF-8 字节：e4 bd a0 e5 a5 bd，故意在第 4 字节切断
    const bytes = new TextEncoder().encode('data: 你好\n\n')
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(bytes.slice(0, 4 + 3)) // "data: " + "你"的完整字节
            c.enqueue(bytes.slice(4 + 3)) // "好\n\n"
            c.close()
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )

    const events = await collectEvents(streamSSE({ url: '/api', body: {} }))

    expect(events).toEqual([{ event: 'message', data: '你好' }])
  })

  it('event: 字段分流（stats 帧与 message 帧分开）', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([
        'data: {"content":"A"}\n\n',
        'event: modelgo.stats\ndata: {"tokens":10}\n\n',
        'data: {"content":"B"}\n\n',
      ]),
    )

    const events = await collectEvents(streamSSE({ url: '/api', body: {} }))

    expect(events).toEqual([
      { event: 'message', data: '{"content":"A"}' },
      { event: 'modelgo.stats', data: '{"tokens":10}' },
      { event: 'message', data: '{"content":"B"}' },
    ])
  })

  it('多行 data: 用 \\n 连接（SSE 规范）', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(['data: line1\ndata: line2\ndata: line3\n\n']),
    )

    const events = await collectEvents(streamSSE({ url: '/api', body: {} }))

    expect(events[0].data).toBe('line1\nline2\nline3')
  })

  it('冒号开头的注释行被忽略（保活心跳）', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([': heartbeat\n\ndata: A\n\n']),
    )

    const events = await collectEvents(streamSSE({ url: '/api', body: {} }))

    expect(events).toEqual([{ event: 'message', data: 'A' }])
  })

  it('data: 后 value 前的一个空格被去掉（规范），多个空格只去一个', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(['data: one space\ndata:  two spaces\n\n']),
    )

    const events = await collectEvents(streamSSE({ url: '/api', body: {} }))

    // 规范：data 后 value 前的一个空格去掉，多个空格只去一个
    expect(events[0].data).toBe('one space\n two spaces')
  })

  it('流关闭时派发最后一个未空行收尾的事件', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(['data: tail']), // 无尾随空行，连接直接关闭
    )

    const events = await collectEvents(streamSSE({ url: '/api', body: {} }))

    expect(events).toEqual([{ event: 'message', data: 'tail' }])
  })

  it('HTTP 非 2xx 时抛错并解析后端 msg（兼容多种信封）', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ msg: '余额不足' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(collectEvents(streamSSE({ url: '/api', body: {} }))).rejects.toThrow('余额不足')
  })

  it('解析 data.details 信封（modelgo BFF 风格）', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ data: { details: [{ message: '参数非法' }] } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(collectEvents(streamSSE({ url: '/api', body: {} }))).rejects.toThrow('参数非法')
  })

  it('Content-Type 非 event-stream 时抛错', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    await expect(collectEvents(streamSSE({ url: '/api', body: {} }))).rejects.toThrow('HTTP 200')
  })

  it('透传 headers/body/signal 给 fetch', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue(sseResponse(['data: A\n\n']))
    const controller = new AbortController()

    await collectEvents(
      streamSSE({
        url: '/api',
        body: { model: 'gpt' },
        headers: { Authorization: 'Bearer x', 'X-Tenant-Id': 't1' },
        signal: controller.signal,
      }),
    )

    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ model: 'gpt' }))
    expect(init.signal).toBe(controller.signal)
    expect(init.headers.Authorization).toBe('Bearer x')
  })
})

describe('createOpenAIStream（OpenAI 协议适配器）', () => {
  it('逐帧 yield delta，[DONE] 结束', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )

    const deltas = await collectDeltas(createOpenAIStream({ url: '/api', body: {} }))

    expect(deltas).toEqual(['你', '好'])
  })

  it('流中 error 帧 → 抛错', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(['data: {"error":{"message":"审核拦截"}}\n\n']),
    )

    await expect(collectDeltas(createOpenAIStream({ url: '/api', body: {} }))).rejects.toThrow(
      '审核拦截',
    )
  })

  it('跳过非 delta 帧（如纯 role 帧、非 JSON）', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n', // 无 content
        'data: not-json\n\n', // 非 JSON，跳过
        'data: {"choices":[{"delta":{"content":"X"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )

    const deltas = await collectDeltas(createOpenAIStream({ url: '/api', body: {} }))

    expect(deltas).toEqual(['X'])
  })

  it('忽略 event: 非 message 帧（stats 帧不干扰）', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
        'event: modelgo.stats\ndata: {"tokens":10}\n\n',
        'data: {"choices":[{"delta":{"content":"B"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )

    const deltas = await collectDeltas(createOpenAIStream({ url: '/api', body: {} }))

    expect(deltas).toEqual(['A', 'B'])
  })
})

describe('createCustomEventStream（自研协议适配器）', () => {
  it('按 type 字段分流：delta/done/error', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([
        'data: {"type":"start","conversation_id":"c1"}\n\n',
        'data: {"type":"delta","delta":"嗨"}\n\n',
        'data: {"type":"delta","delta":"喽"}\n\n',
        'data: {"type":"done","answer":"嗨喽"}\n\n',
      ]),
    )

    const deltas = await collectDeltas(createCustomEventStream({ url: '/api', body: {} }))

    expect(deltas).toEqual(['嗨', '喽'])
  })

  it('error type → 抛错', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(['data: {"type":"error","error":"服务异常"}\n\n']),
    )

    await expect(collectDeltas(createCustomEventStream({ url: '/api', body: {} }))).rejects.toThrow(
      '服务异常',
    )
  })

  it('支持自定义字段名（豆包式协议）', async () => {
    // 假设某协议用 msg_type 区分，content 取增量
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([
        'data: {"msg_type":"text","content":"豆"}\n\n',
        'data: {"msg_type":"end"}\n\n',
      ]),
    )

    const deltas = await collectDeltas(
      createCustomEventStream({
        url: '/api',
        body: {},
        typeField: 'msg_type',
        deltaType: 'text',
        deltaField: 'content',
        doneType: 'end',
      }),
    )

    expect(deltas).toEqual(['豆'])
  })
})

describe('readSSE（对已有 Response 分帧）', () => {
  it('直接消费 Response，不重新 fetch', async () => {
    const response = sseResponse(['data: A\n\ndata: B\n\n'])
    const events = await collectEvents(readSSE(response))
    expect(events).toEqual([
      { event: 'message', data: 'A' },
      { event: 'message', data: 'B' },
    ])
  })
})

describe('extractHTTPError（错误信封解析）', () => {
  it('解析 {msg}', async () => {
    const res = new Response(JSON.stringify({ msg: '失败' }), { status: 500 })
    const err = await extractHTTPError(res)
    expect(err.message).toBe('失败')
  })

  it('解析 {data:{details:[{message}]}}', async () => {
    const res = new Response(JSON.stringify({ data: { details: [{ message: '参数非法' }] } }), {
      status: 400,
    })
    const err = await extractHTTPError(res)
    expect(err.message).toBe('参数非法')
  })

  it('非 JSON 响应回退 HTTP 状态', async () => {
    const res = new Response('plain', { status: 502 })
    const err = await extractHTTPError(res)
    expect(err.message).toBe('HTTP 502')
  })
})
