/**
 * museav speak 的端到端自检（mock 中台）。
 *
 * 这里跑的是**真的 CLI 进程** + **真的 HTTP 往返** + **真的文件落盘**：
 * 起一个本地假中台，按 POST /api/speak 的契约回音频，然后检查
 * stdout 是不是路径、文件是不是那段字节。跑：npm test（需先 npm run build）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url))

/** 一段最小的合法 wav（44 字节头 + 极短采样），当"合成出来的音频" */
function tinyWav() {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(8000, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write('data', 36)
  header.writeUInt32LE(0, 40)
  return header
}

function runCli(args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr })
    })
  })
}

async function withServer(handler, fn) {
  const server = createServer(handler)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  try {
    return await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((r) => server.close(r))
  }
}

test('speak：mock 中台回 base64 音频，CLI 落盘并在 stdout 打印路径', async () => {
  const wav = tinyWav()
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    await withServer(async (req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}')
        assert.equal(parsed.text, '你好')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ audio: wav.toString('base64'), voice: 'mock-voice' }))
      })
    }, async (baseUrl) => {
      const out = join(dir, 'a.wav')
      const r = await runCli(['speak', '你好', '--out', out, '--format', 'wav'], {
        MUSEAV_BASE_URL: baseUrl,
        MUSEAV_API_KEY: 'sk-studio-mock',
      })
      assert.equal(r.code, 0, `stderr: ${r.stderr}`)
      assert.equal(r.stdout.trim(), out)
      const got = await readFile(out)
      assert.deepEqual(got, wav)
      assert.match(r.stderr, /mock-voice/)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：中台给直链时，CLI 下载后落盘', async () => {
  const wav = tinyWav()
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    await withServer(async (req, res) => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'audio/wav' })
        res.end(wav)
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ audio_url: `http://127.0.0.1:${req.socket.localPort}/f.wav` }))
    }, async (baseUrl) => {
      const out = join(dir, 'b.wav')
      const r = await runCli(['speak', '--text', '直链', '--out', out], {
        MUSEAV_BASE_URL: baseUrl,
        MUSEAV_API_KEY: 'sk-studio-mock',
      })
      assert.equal(r.code, 0, `stderr: ${r.stderr}`)
      assert.deepEqual(await readFile(out), wav)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：文本从 --file 读', async () => {
  const wav = tinyWav()
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    const script = join(dir, 'script.txt')
    await (await import('node:fs/promises')).writeFile(script, '  从文件来的句子  ')
    await withServer(async (req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        assert.equal(JSON.parse(body).text, '从文件来的句子')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ audio: wav.toString('base64') }))
      })
    }, async (baseUrl) => {
      const out = join(dir, 'c.wav')
      const r = await runCli(['speak', '--file', script, '--out', out], {
        MUSEAV_BASE_URL: baseUrl,
        MUSEAV_API_KEY: 'sk-studio-mock',
      })
      assert.equal(r.code, 0, `stderr: ${r.stderr}`)
      assert.deepEqual(await readFile(out), wav)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：中台没开语音端点时，退出码 1 且错误可读', async () => {
  await withServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  }, async (baseUrl) => {
    const r = await runCli(['speak', '你好'], {
      MUSEAV_BASE_URL: baseUrl,
      MUSEAV_API_KEY: 'sk-studio-mock',
    })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /\/api\/speak/)
    assert.match(r.stderr, /404/)
  })
})

test('speak：没给文本时报错并给出三种写法', async () => {
  const r = await runCli(['speak'], { MUSEAV_API_KEY: 'sk-studio-mock' })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /--file/)
})

test('speak：--provider minimax 直连上游（mock MiniMax），不需要中台身份', async () => {
  const wav = tinyWav()
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    await withServer(async (req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}')
        assert.equal(parsed.voice_setting.voice_id, 'male-qn-qingse')
        assert.equal(parsed.audio_setting.format, 'mp3')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { audio: wav.toString('hex') },
        }))
      })
    }, async (baseUrl) => {
      const out = join(dir, 'd.mp3')
      const r = await runCli(['speak', '直连', '--provider', 'minimax', '--voice', 'male-qn-qingse', '--out', out], {
        MINIMAX_TTS_BASE_URL: baseUrl,
        MINIMAX_API_KEY: 'mock-key',
        MUSEAV_BASE_URL: 'http://127.0.0.1:1', // 没有中台也得能跑
      })
      assert.equal(r.code, 0, `stderr: ${r.stderr}`)
      assert.deepEqual(await readFile(out), wav)
      assert.match(r.stderr, /不扣中台 credits/)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
