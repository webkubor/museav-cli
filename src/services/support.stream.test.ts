import { afterEach, describe, expect, it, vi } from 'vitest'
import { askSupportStream, type SupportAskStreamFrame } from './support'

vi.mock('@/lib/request-headers', () => ({ injectHeaders: vi.fn() }))

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

describe('askSupportStream', () => {
  afterEach(() => vi.restoreAllMocks())

  it('emits status → answer → done, tolerating frames split across chunks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'data: {"type":"status","stage":"retrieving"}\n\nda',
        'ta: {"type":"answer","data":{"answer":"hi","answer_status":"answered"}}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    )
    const frames: SupportAskStreamFrame[] = []
    await askSupportStream({ message: 'x' }, (f) => frames.push(f))
    expect(frames.map((f) => f.type)).toEqual(['status', 'answer', 'done'])
    expect(frames[1].data?.answer).toBe('hi')
  })

  it('synthesizes status/answer/done from a non-SSE JSON envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, msg: 'ok', data: { answer: 'ok', answer_status: 'answered' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const frames: SupportAskStreamFrame[] = []
    await askSupportStream({ message: 'x' }, (f) => frames.push(f))
    expect(frames.map((f) => f.type)).toEqual(['status', 'answer', 'done'])
    expect(frames[1].data?.answer).toBe('ok')
  })

  it('throws when the stream carries an error frame', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse(['data: {"type":"error","error":"boom"}\n\n']))
    await expect(askSupportStream({ message: 'x' }, () => {})).rejects.toThrow('boom')
  })
})
