import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// streamExperienceChat builds its URL from apiBaseUrl() and stamps headers via
// injectHeaders(). Neither is under test here — pin both to deterministic stubs
// so the assertions don't couple to .env loading or cookie/locale resolution.
vi.mock('@/lib/request', () => ({
  apiBaseUrl: () => 'https://api.example.test',
}))
vi.mock('@/lib/request-headers', () => ({
  injectHeaders: vi.fn(),
}))

import { parseExperienceSSELine, streamExperienceChat } from '@/services/experience'

// ── helpers ──────────────────────────────────────────────────────────────────

const enc = new TextEncoder()

/** Build a streaming Response whose body emits the given chunks in order. */
function sseResponse(chunks: string[], init?: ResponseInit): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  })
}

function deltaLine(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── parseExperienceSSELine (pure) ─────────────────────────────────────────────

describe('parseExperienceSSELine', () => {
  it('returns null for any line that is not a data: line', () => {
    expect(parseExperienceSSELine('')).toBeNull()
    expect(parseExperienceSSELine(':')).toBeNull() // SSE comment / heartbeat
    expect(parseExperienceSSELine('event: message')).toBeNull()
    expect(parseExperienceSSELine('id: 42')).toBeNull()
    expect(parseExperienceSSELine('retry: 1000')).toBeNull()
    expect(parseExperienceSSELine('  data: {}')).toBeNull() // leading ws → not a data: line
  })

  it('parses a well-formed data: JSON payload into a chunk object', () => {
    const out = parseExperienceSSELine('data: {"choices":[{"delta":{"content":"He"}}]}')
    expect(out).not.toBeNull()
    expect(out).not.toBe('done')
    expect((out as { choices: { delta: { content: string } }[] }).choices[0].delta.content).toBe('He')
  })

  it('returns the "done" sentinel for the [DONE] terminator', () => {
    expect(parseExperienceSSELine('data: [DONE]')).toBe('done')
    expect(parseExperienceSSELine('data:[DONE]')).toBe('done') // no space after colon
  })

  it('returns null for an empty payload (bare data: with no body)', () => {
    expect(parseExperienceSSELine('data:')).toBeNull()
    expect(parseExperienceSSELine('data: ')).toBeNull()
    expect(parseExperienceSSELine('data:   ')).toBeNull()
  })

  it('returns null for malformed JSON instead of throwing', () => {
    expect(parseExperienceSSELine('data: {not json')).toBeNull()
    expect(parseExperienceSSELine('data: {"choices":')).toBeNull()
  })
})

// ── streamExperienceChat ──────────────────────────────────────────────────────

describe('streamExperienceChat — happy SSE path', () => {
  it('reassembles a data line split across two reads, fires onDelta per token, resolves accumulated text', async () => {
    // The first delta line is deliberately cut mid-way across two stream reads
    // to exercise the buffer = lines.pop() reassembly. The split happens INSIDE
    // the JSON, not on a newline boundary.
    const line1 = deltaLine('He') // data: {...content:"He"}\n
    const splitAt = Math.floor(line1.length / 2)
    const chunks = [
      line1.slice(0, splitAt), // partial line — no newline yet
      line1.slice(splitAt) + deltaLine('llo') + deltaLine(' world'),
      'data: [DONE]\n',
    ]
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(chunks))
    vi.stubGlobal('fetch', fetchMock)

    const deltas: string[] = []
    const result = await streamExperienceChat({
      model: 'gpt-x',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (d) => deltas.push(d),
    })

    expect(deltas).toEqual(['He', 'llo', ' world'])
    expect(result).toBe('Hello world')

    // request shape: POST to the experience endpoint, stream:true in the body
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, reqInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/api/v1/experience/chat/completions')
    expect(reqInit.method).toBe('POST')
    expect(reqInit.credentials).toBe('include')
    expect(JSON.parse(reqInit.body as string)).toEqual({
      model: 'gpt-x',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    })
  })

  it('ignores heartbeat/comment lines and empty payloads interleaved in the stream', async () => {
    const chunks = [
      ': keep-alive\n',
      'data:\n', // empty payload → skipped
      deltaLine('A'),
      'event: ping\n',
      deltaLine('B'),
      'data: [DONE]\n',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(chunks)))

    const deltas: string[] = []
    const result = await streamExperienceChat({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      onDelta: (d) => deltas.push(d),
    })
    expect(deltas).toEqual(['A', 'B'])
    expect(result).toBe('AB')
  })

  it('terminates immediately at [DONE] and does not consume later deltas', async () => {
    const chunks = [deltaLine('only'), 'data: [DONE]\n', deltaLine('ignored')]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(chunks)))

    const deltas: string[] = []
    const result = await streamExperienceChat({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      onDelta: (d) => deltas.push(d),
    })
    expect(result).toBe('only')
    expect(deltas).toEqual(['only'])
  })
})

describe('streamExperienceChat — error paths', () => {
  it('throws the OpenAI error.message when a chunk carries an error', async () => {
    const chunks = [
      deltaLine('partial'),
      `data: ${JSON.stringify({ error: { message: '内容安全拦截' } })}\n`,
      'data: [DONE]\n',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(chunks)))

    await expect(
      streamExperienceChat({
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        onDelta: () => {},
      })
    ).rejects.toThrow('内容安全拦截')
  })

  it('throws the ModelGo envelope msg for a non-2xx JSON response', async () => {
    const body = new Response(JSON.stringify({ msg: '余额不足' }), {
      status: 402,
      headers: { 'Content-Type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(body))

    await expect(
      streamExperienceChat({
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        onDelta: () => {},
      })
    ).rejects.toThrow('余额不足')
  })

  it('falls back to OpenAI error.message for a non-2xx JSON response without msg', async () => {
    const body = new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(body))

    await expect(
      streamExperienceChat({
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        onDelta: () => {},
      })
    ).rejects.toThrow('rate limit')
  })

  it('throws a 2xx response whose content-type is NOT text/event-stream', async () => {
    // 200 OK but a JSON body (e.g. a business-code envelope) — must be treated
    // as an error, never as a stream. msg drives the message.
    const body = new Response(JSON.stringify({ msg: '网关未开启流式' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(body))

    await expect(
      streamExperienceChat({
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        onDelta: () => {},
      })
    ).rejects.toThrow('网关未开启流式')
  })

  it('preserves the HTTP status text when the error body is not JSON', async () => {
    const body = new Response('<html>502</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(body))

    await expect(
      streamExperienceChat({
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        onDelta: () => {},
      })
    ).rejects.toThrow('HTTP 502')
  })

  it('propagates an AbortError when the signal aborts (fetch rejects)', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        // mimic the platform: fetch rejects with AbortError once the signal fires
        expect(init.signal).toBe(controller.signal)
        return Promise.reject(abortError)
      })
    )
    controller.abort()

    await expect(
      streamExperienceChat({
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        signal: controller.signal,
        onDelta: () => {},
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
