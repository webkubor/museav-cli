/** 店铺 SDK 契约、无网络校验与 CLI 帮助冒烟；不动真实商品或积分。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StudioClient } from '../dist/client.js'
import { Command } from 'commander'
import { registerShop } from '../dist/commands/shop.js'
const ID = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'
const product = { title: '自己的积分', kind: 'credits', credits: 10 }

async function network(fn) {
  const old = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    return new Response(JSON.stringify(url.endsWith('/sales-products') && !init.method ? { owner_id: ID, products: [], templates: [] } : { ok: true }), { status: 200 })
  }
  try { await fn(new StudioClient({ baseUrl: 'https://example.test', token: 'test-token' }), calls) }
  finally { globalThis.fetch = old }
}

test('SDK使用同一JWT，准确映射CRUD、自己公开店铺和发码幂等参数', async () => network(async (client, calls) => {
  await client.shop.show()
  await client.shop.create(product)
  await client.shop.update(ID, { title: '新标题' })
  await client.shop.archive(ID)
  await client.shop.codes()
  const issue = { product_id: ID, channel: 'xianyu', order_ref: 'xy-1', request_id: 'stable-1' }
  await client.shop.issue(issue)
  await client.shop.issue(issue)
  await client.shop.revoke('CODE')
  await client.shop.revokeAccess('CODE2')
  assert.deepEqual(calls.map(c => new URL(c.url).pathname), ['/api/sales-products', '/api/shop', '/api/sales-products', '/api/sales-products', '/api/sales-products', '/api/sales-listing', '/api/sales-listing', '/api/sales-listing', '/api/sales-listing', '/api/sales-listing'])
  assert.equal(new URL(calls[1].url).searchParams.get('owner'), ID)
  assert.ok(calls.every(c => c.headers.Authorization === 'Bearer test-token'))
  assert.deepEqual(JSON.parse(calls[2].body), product)
  assert.deepEqual(JSON.parse(calls[3].body), { title: '新标题', id: ID })
  assert.equal(calls[4].method, 'DELETE')
  assert.deepEqual(JSON.parse(calls[6].body), issue)
  assert.equal(calls[6].body, calls[7].body)
  assert.deepEqual(JSON.parse(calls[8].body), { action: 'disable', code: 'CODE' })
  assert.deepEqual(JSON.parse(calls[9].body), { action: 'revoke', code: 'CODE2' })
}))

test('无效JSON规格和发码参数在HTTP前拒绝，草稿允许壁纸绑定循环', async () => network(async (client, calls) => {
  for (const bad of [null, [], {}, { ...product, product_type: 'credits' }, { ...product, credits: -1 }, { ...product, credits: 1.1 }, { ...product, channel: 'other' }, { ...product, template_ids: ['bad'] }, { ...product, kind: 'wallpaper', credits: 0 }, { ...product, kind: 'bundle', bundle_content: { filename: '../key', content: 'x' } }, { ...product, kind: 'bundle', bundle_content: { filename: '.', content: 'x' } }, { ...product, kind: 'bundle', bundle_content: { filename: 'guide.md', content: '中'.repeat(70000) } }]) {
    await assert.rejects(client.shop.create(bad))
  }
  await assert.rejects(client.shop.issue({ product_id: ID, channel: 'xianyu', request_id: '' }))
  await assert.rejects(client.shop.issue({ product_id: 'bad', channel: 'xianyu', request_id: 'r' }))
  await assert.rejects(client.shop.update(ID, {}))
  assert.equal(calls.length, 0)
  await client.shop.create({ title: '壁纸草稿', kind: 'wallpaper', credits: 0, status: 'draft' })
  await client.shop.create({ title: '安装指导', kind: 'bundle', credits: 0, bundle_content: { filename: 'README.md', content: '安装指导和自有内容' } })
  assert.equal(calls.length, 2)
}))

test('商品创建和更新积分限制与后端int32一致', async () => network(async (client, calls) => {
  for (const credits of [2147483648, Number.MAX_SAFE_INTEGER, Infinity, NaN]) {
    await assert.rejects(client.shop.create({ ...product, credits }), /0–2147483647/)
    await assert.rejects(client.shop.update(ID, { credits }), /0–2147483647/)
  }
  assert.equal(calls.length, 0)
  await client.shop.create({ ...product, credits: 2147483647 })
  await client.shop.update(ID, { credits: 2147483647 })
  await client.shop.update(ID, { credits: 0 })
  assert.deepEqual(calls.map(call => JSON.parse(call.body).credits), [2147483647, 2147483647, 0])
}))

test('创作API Key禁止经营店铺且不会请求网络', async () => network(async (_, calls) => {
  const keyed = new StudioClient({ baseUrl: 'https://example.test', apiKey: 'fake-key' })
  await assert.rejects(keyed.shop.products(), /museav login.*MUSEAV_API_KEY/)
  await assert.rejects(keyed.shop.codes(), /个人登录/)
  assert.equal(calls.length, 0)
}))

test('匿名公开合集列表与详情不携凭据，管理读取仍使用JWT', async () => {
  const calls = []
  const oldFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    return new Response(JSON.stringify({ collections: [] }), { status: 200 })
  }
  try {
    const publicClient = new StudioClient({ baseUrl: 'https://example.test', publicOnly: true })
    await publicClient.shop.collections.listPublic(ID)
    await publicClient.shop.collections.showPublic(ITEM)
    await assert.rejects(publicClient.shop.collections.list(), /个人登录/)
    await assert.rejects(publicClient.shop.collections.show(ID), /个人登录/)
    assert.equal(calls.length, 2)
    assert.equal(new URL(calls[0].url).pathname + new URL(calls[0].url).search, `/api/collections?owner=${ID}`)
    assert.equal(new URL(calls[1].url).pathname + new URL(calls[1].url).search, `/api/collections?id=${ITEM}`)
    assert.ok(calls.every(call => !call.headers.Authorization && !call.headers['X-API-Key']))
    await assert.rejects(publicClient.shop.collections.listPublic('bad'), /UUID/)
  } finally { globalThis.fetch = oldFetch }
  await network(async (client, managementCalls) => {
    await client.shop.collections.list()
    await client.shop.collections.show(ID)
    assert.equal(managementCalls.length, 2)
    assert.ok(managementCalls.every(call => call.headers.Authorization === 'Bearer test-token'))
    assert.ok(managementCalls.every(call => new URL(call.url).pathname === '/api/creator-collections'))
  })
})

test('合集完整保存、条目查询与私有multipart上传契约', async () => network(async (client, calls) => {
  const input = { title: '一期', issue_key: '2026-10', description: '', access_mode: 'product', status: 'draft', product_id: ID, workspace_id: null, cover_asset_id: null, asset_ids: [ITEM] }
  await client.shop.collections.list()
  await client.shop.collections.show(ID)
  await client.shop.collections.save(input)
  await assert.rejects(client.shop.collections.save({ ...input, workspace_id: undefined }), /UUID/)
  const folder = mkdtempSync(join(tmpdir(), 'museav-shop-'))
  try {
    const file = join(folder, 'original.png')
    writeFileSync(file, Buffer.from([137, 80, 78, 71]))
    await client.shop.collections.upload(ID, ITEM, file)
    const upload = calls.at(-1)
    assert.equal(upload.url, 'https://example.test/api/creator-collections')
    assert.ok(upload.body instanceof FormData)
    assert.equal(upload.body.get('collection_id'), ID)
    assert.equal(upload.body.get('item_id'), ITEM)
    assert.equal(upload.body.get('file').name, 'original.png')
    assert.equal(upload.headers['Content-Type'], undefined)
  } finally { rmSync(folder, { recursive: true }) }
  assert.deepEqual(JSON.parse(calls[2].body), input)
}))

test('fromCollection：从合集一键上架，自动返回店铺图片切图、自动回复与带货文案', async () => network(async (client, calls) => {
  const old = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u.includes('creator-collections') && u.includes(`id=${ID}`)) {
      return new Response(JSON.stringify({
        collection: { id: ID, title: '古风武侠壁纸', cover_url: 'https://img.test/cover.png', item_count: 3 },
        items: [
          { id: 'it-1', preview_url: 'https://img.test/pic1.png' },
          { id: 'it-2', preview_url: 'https://img.test/pic2.png' },
        ],
      }))
    }
    if (u.includes('sales-products') && init.method === 'POST') {
      return new Response(JSON.stringify({
        ok: true,
        product: { id: '33333333-3333-4333-8333-333333333333', title: '古风武侠壁纸', kind: 'wallpaper', collection_ids: [ID] },
      }))
    }
    if (u.includes('sales-products') && !init.method) {
      return new Response(JSON.stringify({ owner_id: ID, products: [] }))
    }
    if (u.includes('shop?owner=')) {
      return new Response(JSON.stringify({ seller: { nickname: '山鬼映画' } }))
    }
    return new Response(JSON.stringify({ ok: true }))
  }

  try {
    const pack = await client.shop.fromCollection(ID, { channel: 'xiaohongshu', price: '1.00' })
    assert.equal(pack.price_cny, '1.00')
    assert.equal(pack.item_count, 2)
    assert.equal(pack.delivery_type, '无物流发货')
    assert.equal(pack.stock, 9999)
    assert.deepEqual(pack.product_images, ['https://img.test/cover.png', 'https://img.test/pic1.png', 'https://img.test/pic2.png'])
    assert.match(pack.claim_url, /https:\/\/museav\.top\/claim\/order\?product=33333333-3333-4333-8333-333333333333/)
    assert.match(pack.reply_text, /【山鬼映画】古风武侠壁纸/)
    assert.match(pack.reply_text, /1\.00 元/)
    assert.match(pack.product_copy, /💰 现货拍下自动交付：1\.00 元/)
  } finally {
    globalThis.fetch = old
  }
}))

test('CLI issue参数映射、JSON stdout和stderr错误出口', async () => {
  const original = process.stdout.write
  const chunks = []
  process.stdout.write = chunk => { chunks.push(String(chunk)); return true }
  const calls = []
  const program = new Command()
  registerShop(program, fn => async (...args) => {
    const opts = args[args.length - 2]
    await fn({ shop: { issue: async input => { calls.push(input); return { ok: true, code: 'CODE' } } } }, ...args.slice(0, -2), opts)
  })
  try {
    await program.parseAsync(['shop', 'codes', 'issue', '--product', ID, '--channel', 'xiaohongshu', '--external-order', 'XHS-1', '--request-id', 'stable-1'], { from: 'user' })
  } finally { process.stdout.write = original }
  assert.deepEqual(calls, [{ product_id: ID, channel: 'xiaohongshu', order_ref: 'XHS-1', request_id: 'stable-1' }])
  assert.deepEqual(JSON.parse(chunks.join('')), { ok: true, code: 'CODE' })
  try {
    execFileSync(process.execPath, ['dist/index.js', 'shop', 'products', 'list'], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, MUSEAV_API_KEY: 'fake-key', MUSEAV_NO_WELCOME: '1', NO_UPDATE_NOTIFIER: '1' } })
    assert.fail('应拒绝 API Key')
  } catch (error) {
    assert.equal(error.status, 1)
    assert.equal(error.stdout, '')
    assert.match(error.stderr, /个人登录.*museav login/)
  }
})

test('CLI help覆盖所有入口且不需要凭证', () => {
  for (const args of [['shop'], ['shop', 'show'], ['shop', 'products'], ...['list', 'create', 'update', 'archive'].map(c => ['shop', 'products', c]), ['shop', 'codes'], ...['list', 'issue', 'revoke'].map(c => ['shop', 'codes', c]), ['shop', 'collections'], ...['list', 'show', 'save', 'upload'].map(c => ['shop', 'collections', c])]) {
    const result = execFileSync(process.execPath, ['dist/index.js', ...args, '--help'], { encoding: 'utf8', env: { ...process.env, MUSEAV_NO_WELCOME: '1', NO_UPDATE_NOTIFIER: '1' } })
    assert.match(result, /Usage:/)
  }
  const listHelp = execFileSync(process.execPath, ['dist/index.js', 'shop', 'collections', 'list', '--help'], { encoding: 'utf8', env: { ...process.env, MUSEAV_NO_WELCOME: '1' } })
  const showHelp = execFileSync(process.execPath, ['dist/index.js', 'shop', 'collections', 'show', '--help'], { encoding: 'utf8', env: { ...process.env, MUSEAV_NO_WELCOME: '1' } })
  assert.match(listHelp, /--owner <uuid>/)
  assert.match(showHelp, /--public/)
})
