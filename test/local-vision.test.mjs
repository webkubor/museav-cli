/**
 * reverse --local 的引擎委托自检（2026-09-16 从内置 Ollama 换成 mlx-vlm-kit 的 vlm）。
 * 这两条钉住的都是「运行时才炸、而那时模型已经白加载一轮」的坑。
 * 跑： npm test（需要先 npm run build）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVlmArgs, parseVlmOutput } from '../dist/local-vision.js'

test('全局参数排在子命令前 —— 写反了 vlm 的 argparse 直接报未知参数', () => {
  const args = buildVlmArgs('/tmp/a.jpg', '反推这张图')
  const sub = args.indexOf('ask')
  assert.ok(sub > 0, 'ask 必须存在')
  for (const flag of ['--json', '--max-tokens']) {
    assert.ok(args.indexOf(flag) < sub, `${flag} 必须在 ask 之前，实际: ${args.join(' ')}`)
  }
  // 问题走 --q，图片是 ask 的位置参数；顺序错了 vlm 会把提示词当图片路径
  assert.equal(args[sub + 1], '/tmp/a.jpg')
  assert.equal(args[args.indexOf('--q') + 1], '反推这张图')
})

test('max-tokens 必须远高于 vlm 默认的 400 —— SCULPT 六要素 + 中英双 prompt 会被截断', () => {
  const args = buildVlmArgs('/tmp/a.jpg', 'q')
  assert.ok(Number(args[args.indexOf('--max-tokens') + 1]) >= 1000)
})

test('剥掉 vlm --json 的外层信封拿模型原话', () => {
  assert.equal(parseVlmOutput('{"ok":true,"text":"{\\"prompt\\":\\"x\\"}","elapsed_secs":3}'), '{"prompt":"x"}')
})

test('信封里没内容要抛错，让调用方回落 API，而不是喂空串给解析器', () => {
  assert.throws(() => parseVlmOutput('{"ok":true,"text":"  "}'), /空内容/)
})
