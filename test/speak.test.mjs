/**
 * museav speak 的端到端自检（mock 上游）。
 *
 * 这里跑的是**真的 CLI 进程** + **真的 HTTP 往返** + **真的文件落盘**：
 * 起一个本地假 TTS 上游，按 MiniMax t2a_v2 的响应形态回音频（data.audio 是 hex），
 * 然后检查 stdout 是不是路径、文件是不是那段字节。
 *
 * 为什么不 mock 中台：中台没有语音合成端点（现网路由不存在），没有契约可 mock；
 * 测一个不存在的契约，只会把幻觉固定下来。
 *
 * 跑：npm test（需先 npm run build）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertAudioBytes, decodeAudioHex, findFfmpeg, sniffAudioFormat, validateSpeed } from '../dist/speech.js'

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url))

/** 一段最小的合法 mp3 字节（当"合成出来的音频"） */
function fakeMp3() {
  const b = Buffer.from('fffb9064000000000000', 'hex')
  return Buffer.concat([Buffer.from('ID3'), b])
}

function runCli(args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr })
    })
  })
}

/**
 * 起一个假上游，把收到的请求体交给 onBody，按 opts 回响应。
 */
async function withUpstream(onBody, fn, { audioHex = fakeMp3().toString('hex'), status = 200, payload } = {}) {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (onBody) onBody(JSON.parse(body || '{}'), req)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload ?? {
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { audio: audioHex },
      }))
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  try {
    return await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((r) => server.close(r))
  }
}

test('speak：直连上游合成 mp3 落盘，stdout 只有路径', async () => {
  const mp3 = fakeMp3()
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    await withUpstream((parsed, req) => {
      assert.equal(parsed.text, '你好')
      assert.equal(parsed.model, 'speech-02-hd')
      assert.equal(parsed.stream, false)
      assert.equal(parsed.voice_setting.voice_id, 'male-qn-qingse')
      assert.equal(parsed.voice_setting.speed, 1)
      assert.equal(parsed.audio_setting.format, 'mp3')
      assert.equal(req.headers.authorization, 'Bearer mock-key')
    }, async (baseUrl) => {
      const out = join(dir, 'a.mp3')
      const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse', '--out', out], {
        MINIMAX_TTS_BASE_URL: baseUrl,
        MINIMAX_API_KEY: 'mock-key',
      })
      assert.equal(r.code, 0, `stderr: ${r.stderr}`)
      assert.equal(r.stdout.trim(), out)
      assert.deepEqual(await readFile(out), mp3)
      assert.match(r.stderr, /不扣中台 credits/)
    }, { audioHex: mp3.toString('hex') })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：文本从 --file 读', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    const script = join(dir, 'script.txt')
    await writeFile(script, '  从文件来的句子  ')
    await withUpstream((parsed) => {
      assert.equal(parsed.text, '从文件来的句子')
    }, async (baseUrl) => {
      const out = join(dir, 'b.mp3')
      const r = await runCli(['speak', '--file', script, '--voice', 'male-qn-qingse', '--out', out], {
        MINIMAX_TTS_BASE_URL: baseUrl,
        MINIMAX_API_KEY: 'mock-key',
      })
      assert.equal(r.code, 0, `stderr: ${r.stderr}`)
      assert.equal(r.stdout.trim(), out)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：没给文本时报错并给出三种写法', async () => {
  const r = await runCli(['speak', '--voice', 'male-qn-qingse'], { MINIMAX_API_KEY: 'mock-key' })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /--file/)
})

test('speak：走中台的通道被明确拒绝，并说明现状', async () => {
  const r = await runCli(['speak', '你好', '--provider', 'studio'], { MINIMAX_API_KEY: 'mock-key' })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /中台没有语音合成端点/)
  assert.match(r.stderr, /minimax/)
})

test('speak：没配 MiniMax key 时报错并给出两种配置方式', async () => {
  const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse'], {
    MINIMAX_API_KEY: '',
    MUSEAV_API_KEY: '',
    STUDIO_API_KEY: '',
  })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /MINIMAX_API_KEY/)
})

test('speak：--language zh 映射成上游的 language_boost', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  await withUpstream((parsed) => {
    assert.equal(parsed.language_boost, 'Chinese')
  }, async (baseUrl) => {
    const r = await runCli(['speak', '你好', '--language', 'zh', '--voice', 'male-qn-qingse', '--out', join(dir, 'zh.mp3')], {
      MINIMAX_TTS_BASE_URL: baseUrl,
      MINIMAX_API_KEY: 'mock-key',
    })
    assert.equal(r.code, 0, `stderr: ${r.stderr}`)
  })
  await rm(dir, { recursive: true, force: true })
})

test('speak：不认识的语言在调用上游之前就报错', async () => {
  let called = false
  await withUpstream(() => { called = true }, async (baseUrl) => {
    const r = await runCli(['speak', 'bonjour', '--language', 'fr', '--voice', 'male-qn-qingse'], {
      MINIMAX_TTS_BASE_URL: baseUrl,
      MINIMAX_API_KEY: 'mock-key',
    })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /--language/)
  })
  assert.equal(called, false, '语言不合法时不该打到上游（那会计费）')
})

test('speak：上游回非零 base_resp 时退出码 1 且错误可读', async () => {
  await withUpstream(() => {}, async (baseUrl) => {
    const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse'], {
      MINIMAX_TTS_BASE_URL: baseUrl,
      MINIMAX_API_KEY: 'mock-key',
    })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /MiniMax/)
  }, {
    payload: { base_resp: { status_code: 1004, status_msg: 'insufficient balance' }, data: {} },
  })
})

test('speak：输出文件已存在时不覆盖（--overwrite 才覆盖）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    const out = join(dir, 'c.mp3')
    await writeFile(out, 'old')
    await withUpstream(() => {}, async (baseUrl) => {
      const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse', '--out', out], {
        MINIMAX_TTS_BASE_URL: baseUrl,
        MINIMAX_API_KEY: 'mock-key',
      })
      assert.equal(r.code, 1)
      assert.match(r.stderr, /已存在/)
      assert.equal(await readFile(out, 'utf-8'), 'old')
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：上游回空音频时退出码 1 且不落盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    await withUpstream(() => {}, async (baseUrl) => {
      const out = join(dir, 'empty.mp3')
      const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse', '--out', out], {
        MINIMAX_TTS_BASE_URL: baseUrl,
        MINIMAX_API_KEY: 'mock-key',
      })
      assert.equal(r.code, 1)
      assert.match(r.stderr, /音频/)
      assert.deepEqual(await readdir(dir), [], '空音频不该落任何文件')
    }, { audioHex: '   ' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：上游回非法 hex 时退出码 1 且不落盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    await withUpstream(() => {}, async (baseUrl) => {
      const out = join(dir, 'badhex.mp3')
      const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse', '--out', out], {
        MINIMAX_TTS_BASE_URL: baseUrl,
        MINIMAX_API_KEY: 'mock-key',
      })
      assert.equal(r.code, 1)
      assert.match(r.stderr, /hex/)
      assert.deepEqual(await readdir(dir), [], '非法 hex 不该落任何文件')
    }, { audioHex: 'zzzz' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：上游回的不是音频时退出码 1 且不落盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    await withUpstream(() => {}, async (baseUrl) => {
      const out = join(dir, 'notaudio.mp3')
      const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse', '--out', out], {
        MINIMAX_TTS_BASE_URL: baseUrl,
        MINIMAX_API_KEY: 'mock-key',
      })
      assert.equal(r.code, 1)
      assert.match(r.stderr, /不是音频/)
      assert.deepEqual(await readdir(dir), [], '非音频内容不该落任何文件')
    }, { audioHex: Buffer.from('{"error":"boom"}').toString('hex') })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：--speed 不是数字时在调用上游之前就报错', async () => {
  let called = false
  await withUpstream(() => { called = true }, async (baseUrl) => {
    const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse', '--speed', 'abc'], {
      MINIMAX_TTS_BASE_URL: baseUrl,
      MINIMAX_API_KEY: 'mock-key',
    })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /--speed/)
    assert.match(r.stderr, /abc/)
  })
  assert.equal(called, false, '语速不合法时不该打到上游（那会计费）')
})

test('speak：--speed 超出范围时在调用上游之前就报错', async () => {
  let called = false
  await withUpstream(() => { called = true }, async (baseUrl) => {
    const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse', '--speed', '9'], {
      MINIMAX_TTS_BASE_URL: baseUrl,
      MINIMAX_API_KEY: 'mock-key',
    })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /--speed/)
  })
  assert.equal(called, false, '语速越界时不该打到上游（那会计费）')
})

test('speak：--speed 合法值照常发给上游', async () => {
  await withUpstream((parsed) => {
    assert.equal(parsed.voice_setting.speed, 1.25)
  }, async (baseUrl) => {
    const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
    const r = await runCli(['speak', '你好', '--voice', 'male-qn-qingse', '--speed', '1.25', '--out', join(dir, 'sp.mp3')], {
      MINIMAX_TTS_BASE_URL: baseUrl,
      MINIMAX_API_KEY: 'mock-key',
    })
    assert.equal(r.code, 0, `stderr: ${r.stderr}`)
    await rm(dir, { recursive: true, force: true })
  })
})

test('音频字节校验：空值与非法 hex 都被拦下', () => {
  assert.throws(() => decodeAudioHex(''), /空的（0 字节）/)
  assert.throws(() => decodeAudioHex('   '), /空的（0 字节）/)
  assert.throws(() => decodeAudioHex('abc'), /不是合法的 hex/)
  assert.throws(() => decodeAudioHex('zz'), /不是合法的 hex/)
  assert.equal(decodeAudioHex('494433').toString('ascii'), 'ID3')
})

test('音频魔数嗅探：真 mp3 / wav 通过，别的字节被拒', () => {
  assert.equal(sniffAudioFormat(Buffer.from('ID3\x03\x00', 'binary')), 'mp3')
  assert.equal(sniffAudioFormat(Buffer.from('fffb9064', 'hex')), 'mp3')
  assert.equal(sniffAudioFormat(Buffer.from('524946462000000057415645', 'hex')), 'wav')
  assert.equal(sniffAudioFormat(Buffer.from('{"error":1}', 'utf-8')), null)
  assert.throws(() => assertAudioBytes(Buffer.from('{"error":1}', 'utf-8')), /不是音频/)
  assert.doesNotThrow(() => assertAudioBytes(fakeMp3()))
})

test('语速校验：只收 0.5–2.0 的数字', () => {
  assert.equal(validateSpeed(undefined), undefined)
  assert.equal(validateSpeed(1), 1)
  assert.equal(validateSpeed('1.5'), 1.5)
  assert.throws(() => validateSpeed('abc'), /--speed/)
  assert.throws(() => validateSpeed(''), /--speed/)
  assert.throws(() => validateSpeed('0.1'), /范围/)
  assert.throws(() => validateSpeed('3'), /范围/)
})

test('ffmpeg 探测：PATH 里有就能找到（哪怕不在那三条硬编码路径里）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'museav-ffmpeg-'))
  const oldPath = process.env.PATH
  try {
    // 造一个只在 PATH 里、绝不在 /usr/bin、/opt/homebrew/bin、/usr/local/bin 的 ffmpeg
    const fake = join(dir, 'ffmpeg')
    await writeFile(fake, '#!/bin/sh\necho "ffmpeg version 0.0-test"\n')
    await chmod(fake, 0o755)
    process.env.PATH = dir
    assert.equal(findFfmpeg(), 'ffmpeg', 'PATH 里的 ffmpeg 应该被找到')
  } finally {
    process.env.PATH = oldPath
    await rm(dir, { recursive: true, force: true })
  }
})

test('speak：--format wav 时落盘的是真 wav（不是改后缀的 mp3）', async (t) => {
  // 用实现自己的探测口径（本仓怎么找 ffmpeg，测试就怎么找），不再拿 which 另开一套
  if (!findFfmpeg()) return t.skip('本机没有 ffmpeg，跳过转码用例')

  const dir = await mkdtemp(join(tmpdir(), 'museav-speak-'))
  try {
    // 一段真的 mp3：用 ffmpeg 从 wav 转出来当素材
    const srcWav = join(dir, 'src.wav')
    const mp3 = join(dir, 'src.mp3')
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2',
        '-ar', '44100', '-ac', '1', srcWav], (e) => (e ? reject(e) : resolve()))
    })
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', srcWav, mp3], (e) => (e ? reject(e) : resolve()))
    })
    const mp3Bytes = await readFile(mp3)

    await withUpstream(() => {}, async (baseUrl) => {
      const out = join(dir, 'out.wav')
      const r = await runCli(['speak', '要 wav', '--format', 'wav', '--voice', 'male-qn-qingse', '--out', out], {
        MINIMAX_TTS_BASE_URL: baseUrl,
        MINIMAX_API_KEY: 'mock-key',
      })
      assert.equal(r.code, 0, `stderr: ${r.stderr}`)
      const written = await readFile(out)
      assert.equal(written.subarray(0, 4).toString('ascii'), 'RIFF', '落盘的应该是 wav，不是 mp3 改个后缀')
      assert.equal(written.subarray(8, 12).toString('ascii'), 'WAVE')
      // 中间文件不留在输出目录里
      const leftovers = await readdir(dir)
      assert.deepEqual(leftovers.filter((f) => f.includes('.tmp')), [], '转换中间文件不该留在输出目录')
    }, { audioHex: mp3Bytes.toString('hex') })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
