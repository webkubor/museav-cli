/**
 * skillhub 参数拼装自检：这里错的代价是把错的 source/tag 提交到平台，
 * 而 Skill ID 提交后跨版本不可改，所以校验分支必须有断言兜着。
 * 跑： npm test（需要先 npm run build）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPublishArgs } from '../dist/commands/skillhub.js'

test('缺 tag 直接拒，并指向 tags 命令', () => {
  assert.throws(() => buildPublishArgs('/tmp/s', {}), /缺 --tag[\s\S]*skillhub tags/)
})

test('source 只收 original / repost', () => {
  assert.throws(() => buildPublishArgs('/tmp/s', { tag: '效率工具', source: '原创' }), /只能是 original/)
})

test('转载必须带来源，原创不许带', () => {
  assert.throws(() => buildPublishArgs('/tmp/s', { tag: '效率工具', source: 'repost' }), /repost-source/)
  assert.throws(
    () => buildPublishArgs('/tmp/s', { tag: '效率工具', repostSource: '知乎' }),
    /只在 --source repost 时有意义/,
  )
})

test('默认原创，且不带 --yes 时强制 dry-run（不外发）', () => {
  const args = buildPublishArgs('/tmp/s', { tag: '效率工具,编程开发' })
  assert.deepEqual(args.slice(1), [
    'publish', '/tmp/s', '--agent', '--source', 'original', '--tag', '效率工具,编程开发', '--dry-run',
  ])
})

test('--yes 才去掉 dry-run，转载参数与 identifier 一并透传', () => {
  const args = buildPublishArgs('/tmp/s', {
    tag: '内容创作', source: 'repost', repostSource: '知乎', identifier: 'my-skill', yes: true,
  })
  assert.ok(!args.includes('--dry-run'))
  assert.deepEqual(args.slice(1), [
    'publish', '/tmp/s', '--agent', '--source', 'repost', '--tag', '内容创作',
    '--repost-source', '知乎', '--identifier', 'my-skill',
  ])
})
