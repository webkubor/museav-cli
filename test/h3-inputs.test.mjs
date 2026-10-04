/**
 * H3 高级输入（首尾帧 / 参考素材 / 提示词增强）自检。
 *
 * 三条判据都是「本地就该拦住」或「字段名必须对上」这类**只在真实调用时才炸**的坑：
 *   · 首尾帧与参考素材互斥 —— 拦晚了 = 用户先传几十 MB 素材再被 400；
 *   · 参考图超 9 —— 上限来自上游官方，本地不拦就白等一趟往返；
 *   · --enhance 必须**用增强后的 prompt 提交** —— 忘了替换就是「花了增强的钱、出的还是原话」，
 *     而且这种错在 stderr 上看不出任何异常。
 * 外加客户端契约：body 字段名 / enhancePrompt 的响应映射（中台是 snake_case，CLI 是 camelCase）。
 *
 * 全部用 stub，不打真网络。
 * 跑： npm test（需要先 npm run build）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gen } from '../dist/commands/gen.js'
import { enhance } from '../dist/commands/enhance.js'
import { StudioClient } from '../dist/client.js'

/** 拦 stdout/stderr：既为了断言输出契约，也为了不让测试输出被命令的进度刷屏 */
function captureOutput() {
  const out = []
  const err = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk) => { out.push(String(chunk)); return true }
  process.stderr.write = (chunk) => { err.push(String(chunk)); return true }
  return {
    out: () => out.join(''),
    err: () => err.join(''),
    restore: () => { process.stdout.write = origOut; process.stderr.write = origErr },
  }
}

/** 出图/出视频的假 client：只记下被调了什么，不做任何网络与文件操作 */
function fakeClient(overrides = {}) {
  const calls = []
  const client = {
    calls,
    uploadRef: async (path) => { calls.push(['uploadRef', path]); return { url: `https://cdn.test/${path}` } },
    enhancePrompt: async (opts) => {
      calls.push(['enhancePrompt', opts])
      return { prompt: '增强后的结构化提示词', taskId: 'task-1', originalLength: 6, enhancedLength: 11 }
    },
    generateVideo: async (opts) => { calls.push(['generateVideo', opts]); return { jobId: 'job-1' } },
    waitVideo: async () => ({ status: 'completed', cdn_url: 'https://cdn.test/out.mp4' }),
    ...overrides,
  }
  return client
}

test('首尾帧与参考素材互斥：本地报错，且一个文件都不上传', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await assert.rejects(
      () => gen(client, {
        video: true,
        prompt: '一只猫在窗台上伸懒腰',
        image: 'first-frame.png',              // 首帧
        lastFrame: 'last-frame.png',           // 尾帧
        referenceImage: ['ref.png'],           // 参考素材
      }),
      /互斥/,
    )
  } finally {
    cap.restore()
  }
  // 互斥是 H3 官方限制，跟"传了什么文件"无关——必须在上传之前就拦掉
  assert.deepEqual(client.calls, [], '互斥校验必须先于任何上传/提交')
})

test('首尾帧与参考素材互斥：只给尾帧 + 参考视频同样拦下', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await assert.rejects(
      () => gen(client, { video: true, prompt: 'x', lastFrame: 'tail.png', referenceVideo: ['v.mp4'] }),
      /互斥/,
    )
  } finally {
    cap.restore()
  }
  assert.deepEqual(client.calls, [])
})

test('参考图超 9 张：本地报错（上限来自上游官方，不白等一趟往返）', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await assert.rejects(
      () => gen(client, {
        video: true,
        prompt: 'x',
        referenceImage: Array.from({ length: 10 }, (_, i) => `https://cdn.test/r${i}.png`),
      }),
      /最多 9 张，收到 10 张/,
    )
  } finally {
    cap.restore()
  }
  assert.deepEqual(client.calls, [])
})

test('参考视频/参考音频上限 3：本地报错', async () => {
  const cap = captureOutput()
  try {
    await assert.rejects(
      () => gen(fakeClient(), { video: true, prompt: 'x', referenceVideo: ['1', '2', '3', '4'].map((n) => `v${n}.mp4`) }),
      /参考视频最多 3 个，收到 4 个/,
    )
    await assert.rejects(
      () => gen(fakeClient(), { video: true, prompt: 'x', referenceAudio: ['1', '2', '3', '4'].map((n) => `a${n}.mp3`) }),
      /参考音频最多 3 个，收到 4 个/,
    )
  } finally {
    cap.restore()
  }
})

test('参考素材/尾帧/--enhance 用在非视频命令上：本地报错', async () => {
  const cap = captureOutput()
  try {
    await assert.rejects(() => gen(fakeClient(), { prompt: 'x', referenceVideo: ['v.mp4'] }), /仅 --video 有意义/)
    await assert.rejects(() => gen(fakeClient(), { prompt: 'x', lastFrame: 't.png' }), /仅 --video 有意义/)
    await assert.rejects(() => gen(fakeClient(), { prompt: 'x', enhance: true }), /仅 --video 有意义/)
  } finally {
    cap.restore()
  }
})

test('--enhance：用增强后的 prompt 提交，字数走 stderr、stdout 只有 URL', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await gen(client, {
      video: true,
      prompt: '一只猫在窗台上伸懒腰',
      image: 'https://cdn.test/first.png',
      enhance: true,
      duration: 5,
      ratio: '9:16',
    })
  } finally {
    cap.restore()
  }

  const enhancedCall = client.calls.find(([name]) => name === 'enhancePrompt')
  const submitCall = client.calls.find(([name]) => name === 'generateVideo')
  assert.ok(enhancedCall, '必须先调 enhancePrompt')
  assert.ok(submitCall, '增强后要提交视频')

  // 增强入参：原始提示词 + 参考图 URL（首帧也交给增强器当上下文）+ 目标规格
  assert.equal(enhancedCall[1].prompt, '一只猫在窗台上伸懒腰')
  assert.deepEqual(enhancedCall[1].images, ['https://cdn.test/first.png'])
  assert.equal(enhancedCall[1].duration, 5)
  assert.equal(enhancedCall[1].ratio, '9:16')

  // 提交用的必须是**增强后**的提示词——没替换就是花冤枉钱出原话
  assert.equal(submitCall[1].prompt, '增强后的结构化提示词')
  assert.ok(
    client.calls.findIndex(([n]) => n === 'enhancePrompt') < client.calls.findIndex(([n]) => n === 'generateVideo'),
    '增强必须在提交之前',
  )

  assert.match(cap.err(), /提示词已增强: 6 字 → 11 字/)
  assert.equal(cap.out().trim(), 'https://cdn.test/out.mp4', 'stdout 只放结果 URL，别污染管道')
})

test('--enhance 没给 --prompt：本地报错（模板提示词在服务端展开，本端拿不到）', async () => {
  const cap = captureOutput()
  try {
    await assert.rejects(
      () => gen(fakeClient(), { video: true, template: 'tpl-1', enhance: true }),
      /--enhance 需要配合 --prompt/,
    )
  } finally {
    cap.restore()
  }
})

test('视频高级输入：首尾帧字段名照中台契约进 body', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await gen(client, {
      video: true,
      prompt: 'x',
      image: 'https://cdn.test/head.png',
      lastFrame: 'https://cdn.test/tail.png',
    })
  } finally {
    cap.restore()
  }
  const body = client.calls.find(([name]) => name === 'generateVideo')[1]
  assert.equal(body.last_frame, 'https://cdn.test/tail.png')
  // 首帧：image_url 与 first_frame 两个字段名各有一家上游适配器认，必须一起发
  assert.equal(body.image_url, 'https://cdn.test/head.png')
  assert.equal(body.first_frame, 'https://cdn.test/head.png')
  assert.equal(body.reference_images, undefined, '没给参考素材就别带空字段')
})

test('视频高级输入：参考素材字段名照中台契约进 body', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await gen(client, {
      video: true,
      prompt: 'x',
      referenceImage: ['https://cdn.test/a.png', 'https://cdn.test/b.png'],
      referenceVideo: ['https://cdn.test/v.mp4'],
      referenceAudio: ['https://cdn.test/a.mp3'],
    })
  } finally {
    cap.restore()
  }
  const body = client.calls.find(([name]) => name === 'generateVideo')[1]
  assert.deepEqual(body.reference_images, ['https://cdn.test/a.png', 'https://cdn.test/b.png'])
  assert.deepEqual(body.reference_videos, ['https://cdn.test/v.mp4'])
  assert.deepEqual(body.reference_audios, ['https://cdn.test/a.mp3'])
  assert.equal(body.first_frame, undefined, '参考素材模式不带首帧')
  assert.equal(body.last_frame, undefined)
})

test('图生视频：image_url 与 first_frame 同时下发（两家适配器各认一个）', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await gen(client, { video: true, prompt: 'x', image: 'https://cdn.test/first.png' })
  } finally {
    cap.restore()
  }
  const body = client.calls.find(([name]) => name === 'generateVideo')[1]
  assert.equal(body.image_url, 'https://cdn.test/first.png')
  assert.equal(body.first_frame, 'https://cdn.test/first.png')
})

test('enhance 命令：stdout 只出增强后的提示词', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await enhance(client, { prompt: '粗糙想法', image: ['https://cdn.test/r.png'], duration: 5, ratio: '9:16' })
  } finally {
    cap.restore()
  }
  assert.equal(cap.out().trim(), '增强后的结构化提示词')
  assert.match(cap.err(), /6 字 → 11 字/)
  const call = client.calls.find(([name]) => name === 'enhancePrompt')
  assert.equal(call[1].prompt, '粗糙想法')
  assert.deepEqual(call[1].images, ['https://cdn.test/r.png'])
  assert.equal(client.calls.some(([name]) => name === 'generateVideo'), false, 'enhance 不生成视频')
})

test('enhance 命令：本地文件走 uploadRef 换成直链，直链不重复上传', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await enhance(client, { prompt: 'x', image: ['local.png', 'https://cdn.test/direct.png'] })
  } finally {
    cap.restore()
  }
  assert.deepEqual(
    client.calls.filter(([name]) => name === 'uploadRef').map(([, p]) => p),
    ['local.png'],
  )
  assert.deepEqual(
    client.calls.find(([name]) => name === 'enhancePrompt')[1].images,
    ['https://cdn.test/local.png', 'https://cdn.test/direct.png'],
  )
})

test('enhance 命令：没给提示词直接报错，不打网络', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await assert.rejects(() => enhance(client, {}), /需要 -p/)
  } finally {
    cap.restore()
  }
  assert.deepEqual(client.calls, [])
})

// ── 客户端契约（stub globalThis.fetch，不打真网络）──────────────────────────

function stubFetch(reply) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return { ok: true, status: 200, text: async () => JSON.stringify(reply) }
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

const newClient = () => new StudioClient({ baseUrl: 'https://manager.test', token: 'test-token' })

test('StudioClient.generateVideo：新字段照中台契约进请求体', async () => {
  const stub = stubFetch({ job_id: 'job-9', id: 'up-9' })
  try {
    const r = await newClient().generateVideo({
      prompt: 'p',
      first_frame: 'https://cdn.test/f.png',
      last_frame: 'https://cdn.test/l.png',
      reference_images: ['https://cdn.test/r.png'],
      reference_videos: ['https://cdn.test/v.mp4'],
      reference_audios: ['https://cdn.test/a.mp3'],
    })
    assert.deepEqual(r, { jobId: 'job-9', upstreamTaskId: 'up-9' })
  } finally {
    stub.restore()
  }
  const { url, init } = stub.calls[0]
  assert.equal(url, 'https://manager.test/api/videos')
  assert.equal(init.method, 'POST')
  assert.deepEqual(JSON.parse(init.body), {
    prompt: 'p',
    first_frame: 'https://cdn.test/f.png',
    last_frame: 'https://cdn.test/l.png',
    reference_images: ['https://cdn.test/r.png'],
    reference_videos: ['https://cdn.test/v.mp4'],
    reference_audios: ['https://cdn.test/a.mp3'],
  })
})

test('StudioClient.enhancePrompt：打 /api/enhance-prompt，响应 snake_case → camelCase', async () => {
  const stub = stubFetch({ ok: true, prompt: '增强结果', task_id: 'task-7', original_length: 3, enhanced_length: 4 })
  let r
  try {
    r = await newClient().enhancePrompt({ prompt: '粗糙想法', images: ['https://cdn.test/r.png'], duration: 5, ratio: '9:16' })
  } finally {
    stub.restore()
  }
  assert.deepEqual(r, { prompt: '增强结果', taskId: 'task-7', originalLength: 3, enhancedLength: 4 })
  const { url, init } = stub.calls[0]
  assert.equal(url, 'https://manager.test/api/enhance-prompt')
  assert.equal(init.method, 'POST')
  assert.equal(init.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(init.body), {
    prompt: '粗糙想法',
    images: ['https://cdn.test/r.png'],
    duration: 5,
    ratio: '9:16',
  })
})

test('StudioClient.enhancePrompt：超 7000 字符本地就拦，不发请求', async () => {
  const stub = stubFetch({ ok: true, prompt: 'x' })
  try {
    await assert.rejects(() => newClient().enhancePrompt({ prompt: 'x'.repeat(7001) }), /超长/)
  } finally {
    stub.restore()
  }
  assert.equal(stub.calls.length, 0)
})
