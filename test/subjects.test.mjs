/**
 * subjects（IP 主体）自检。
 *
 * 判据挑的是「只在真实调用时才炸」或「字段名必须对上」那类坑：
 *   · 枚举值必须与服务端真源一致 —— 本地放行、服务端 400 是最没信息量的失败；
 *   · `role` 必须原样送上去 —— 三视图全靠它，写错就分不出正面/侧面/背面；
 *   · `workspace_id` 必须带**主体自己的那个值**（可能是 null）—— 服务端按
 *     `subject.workspace_id !== body.workspace_id` 判归属，个人主体两边都得是 null，
 *     少传一个字段就变成「主体不存在或不属于这个项目」；
 *   · 外站直链必须在**上传之前**拦下 —— 服务端 toKey() 只认中台自己的域名。
 *
 * 全部用 stub，不打真网络、不碰任何真实素材。
 * 跑： npm test（需要先 npm run build）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSubject,
  listSubjects,
  showSubject,
  addSubjectAsset,
} from '../dist/commands/subjects.js'
import { SUBJECT_KINDS, PERSONA_SOURCES, ASSET_ROLES } from '../dist/client.js'

/** 拦 stdout/stderr：既为了断言输出契约，也为了不让命令的进度刷屏 */
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

const SUBJECT = {
  id: 'subj-1',
  workspace_id: 'ws-1',
  kind: 'person',
  name: '顾栖月',
  traits: { 发型: '长直发' },
  persona_source: 'virtual',
  asset_count: 2,
}

/**
 * 假 client：只记下被调了什么，不做任何网络与文件操作。
 * 默认场景 = 项目 ws-1 下有一个主体 subj-1，名下两张图。
 */
function fakeClient(overrides = {}) {
  const calls = []
  const client = {
    calls,
    subjects: async (workspaceId, kind) => {
      calls.push(['subjects', workspaceId, kind])
      return workspaceId === 'ws-1' ? [{ ...SUBJECT }] : []
    },
    workspaces: async () => [{ id: 'ws-1', name: '江湖' }],
    createSubject: async (input) => { calls.push(['createSubject', input]); return { ...SUBJECT, ...input, id: 'subj-new' } },
    subjectAssets: async (subjectId, workspaceId) => {
      calls.push(['subjectAssets', subjectId, workspaceId])
      return [
        { id: 'a1', role: 'view_front', name: '正面', url: 'https://img.webkubor.online/refs/u/f.png', media_type: 'image' },
        { id: 'a2', role: 'view_side', name: null, url: 'https://img.webkubor.online/refs/u/s.png', media_type: 'image' },
        { id: 'a3', role: 'raw', name: '废片', url: 'https://img.webkubor.online/refs/u/r.png', media_type: 'image' },
      ]
    },
    uploadRef: async (path) => {
      calls.push(['uploadRef', path])
      return { url: `https://img.webkubor.online/refs/u/${path.split('/').pop()}` }
    },
    registerAsset: async (input) => {
      calls.push(['registerAsset', input])
      return { id: 'asset-new', url: `https://img.webkubor.online/${input.r2KeyOrUrl.replace(/^https:\/\/img\.webkubor\.online\//, '')}`, ...input }
    },
    ...overrides,
  }
  return client
}

/**
 * 跑一个必然抛错的调用，返回错误消息。
 * 命令函数是**抛**错、由 index.ts 的 withClient 统一打 stderr 的（那是 CLI 的出口层），
 * 所以这里断言的是 error.message 本身，不是被拦下来的 stderr。
 */
async function expectError(fn) {
  const cap = captureOutput()
  let msg = null
  try {
    await fn()
  } catch (e) {
    msg = e.message
  } finally {
    cap.restore()
  }
  assert.notEqual(msg, null, '本该报错，却成功了')
  return msg
}

// ── 枚举：本地抄本必须与服务端真源逐字一致 ────────────────────────────────
// 这三行是「抄服务端代码」这个约定的机械判据：服务端改了枚举而 CLI 没跟上，先在这里红。
test('枚举值 = 服务端真源（subjects.js / assets.js）', () => {
  assert.deepEqual([...SUBJECT_KINDS], ['product', 'person', 'scene', 'brand'])
  assert.deepEqual([...PERSONA_SOURCES], ['real', 'virtual'])
  assert.deepEqual([...ASSET_ROLES], ['raw', 'standard', 'view_front', 'view_side', 'view_back', 'output'])
})

test('create：非法 kind 中文报错，且不发任何请求（连 --project 解析都不跑）', async () => {
  const client = fakeClient()
  const err = await expectError(() => createSubject(client, { project: '江湖', name: '顾栖月', kind: 'character' }))
  assert.match(err, /主体类型只能是 product \/ person \/ scene \/ brand/)
  assert.match(err, /收到「character」/)
  assert.deepEqual(client.calls, [], '枚举校验必须先于任何网络调用（包括解析项目名）')
})

test('create：非法 persona 中文报错', async () => {
  const client = fakeClient()
  const err = await expectError(() => createSubject(client, { name: '顾栖月', kind: 'person', persona: 'ai' }))
  assert.match(err, /形象来源只能是 real \/ virtual/)
  assert.deepEqual(client.calls, [])
})

test('create：persona 只对人物有意义（product + persona 本地拦下）', async () => {
  const client = fakeClient()
  const err = await expectError(() => createSubject(client, { name: '猫砂盆', kind: 'product', persona: 'virtual' }))
  assert.match(err, /只有「人物」（--kind person）才区分真人和虚拟人/)
  assert.deepEqual(client.calls, [])
})

test('create：名字为空 / 超 60 字本地拦下（与服务端 MAX_NAME 同口径）', async () => {
  const client = fakeClient()
  assert.match(await expectError(() => createSubject(client, { name: '   ' })), /--name 必填/)
  assert.match(await expectError(() => createSubject(client, { name: '长'.repeat(61) })), /名字最多 60 个字，当前 61 个/)
  assert.deepEqual(client.calls, [])
})

test('create：traits 必须是 JSON 对象（数组/坏 JSON 都拦）', async () => {
  const client = fakeClient()
  assert.match(await expectError(() => createSubject(client, { name: '顾栖月', traits: '[1,2]' })), /必须是 JSON 对象/)
  assert.match(await expectError(() => createSubject(client, { name: '顾栖月', traits: '{发型}' })), /不是合法 JSON/)
  assert.deepEqual(client.calls, [])
})

test('create：默认 kind=person，字段名按服务端契约送（snake_case）', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await createSubject(client, { project: '江湖', name: '  顾栖月  ', persona: 'virtual', traits: '{"发型":"长直发"}' })
  } finally {
    cap.restore()
  }
  const [, input] = client.calls.find((c) => c[0] === 'createSubject')
  assert.deepEqual(input, {
    workspaceId: 'ws-1',        // --project 名称解析出来的 id，不是名称本身
    kind: 'person',             // 不传 --kind 时的默认值
    name: '顾栖月',              // 服务端会 trim，本地先 trim 一次，两边存的名字才一样
    traits: { 发型: '长直发' },
    personaSource: 'virtual',
  })
  // stdout 只出 id，方便脚本接着传图
  assert.equal(cap.out().trim(), 'subj-new')
})

test('create：不传 --project = 个人主体（workspaceId 为 null，服务端允许）', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await createSubject(client, { name: '顾栖月' })
  } finally {
    cap.restore()
  }
  const [, input] = client.calls.find((c) => c[0] === 'createSubject')
  assert.equal(input.workspaceId, null)
})

test('list：非法 kind 拦下；不传 --project 只看个人主体', async () => {
  const client = fakeClient()
  assert.match(await expectError(() => listSubjects(client, { kind: 'nope' })), /主体类型只能是/)
  assert.deepEqual(client.calls, [])

  const cap = captureOutput()
  try {
    await listSubjects(client, {})
  } finally {
    cap.restore()
  }
  // 不传项目 → subjects(undefined)：服务端 ownerFilter 按「个人」过滤，不是「全部」
  assert.deepEqual(client.calls, [['subjects', undefined, undefined]])
})

test('list：--project 解析成项目 id 并过滤 kind', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await listSubjects(client, { project: '江湖', kind: 'person' })
  } finally {
    cap.restore()
  }
  assert.deepEqual(client.calls, [['subjects', 'ws-1', 'person']])
  assert.match(cap.err(), /「江湖」主体（1 个）/)
  assert.equal(JSON.parse(cap.out())[0].id, 'subj-1')
})

test('show：按 role 分组，三视图一眼可见（缺的标 —）', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await showSubject(client, 'subj-1', {})
  } finally {
    cap.restore()
  }
  assert.match(cap.err(), /三视图: 正面✓ {2}侧面✓ {2}背面—/)
  assert.match(cap.err(), /\[view_front 正面\] 1 张/)
  assert.match(cap.err(), /\[raw 原图\] 1 张/)
  const payload = JSON.parse(cap.out())
  assert.equal(payload.by_role.view_front[0].id, 'a1')
  assert.equal(payload.by_role.view_side[0].id, 'a2')
  assert.equal(payload.by_role.view_back.length, 0)
})

test('show：不传 --project 时扫个人 + 全部项目（服务端没有按 id 查单个主体的接口）', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await showSubject(client, 'subj-1', {})
  } finally {
    cap.restore()
  }
  assert.deepEqual(client.calls[0], ['subjects', undefined, undefined])   // 个人
  assert.deepEqual(client.calls[1], ['subjects', 'ws-1', undefined])      // 项目 ws-1
  // 拿到主体后按**主体自己的** workspace_id 取图
  assert.deepEqual(client.calls.find((c) => c[0] === 'subjectAssets'), ['subjectAssets', 'subj-1', 'ws-1'])
})

test('show：找不到主体时报错里带出现有主体，便于改指', async () => {
  const client = fakeClient({ subjects: async () => [] })
  const err = await expectError(() => showSubject(client, '不存在', {}))
  assert.match(err, /没有主体「不存在」/)
  assert.match(err, /museav subjects create/)
})

test('add-asset：非法 role 拦下，且不查主体、不上传', async () => {
  const client = fakeClient()
  const err = await expectError(() => addSubjectAsset(client, 'subj-1', './f.png', { role: 'front' }))
  assert.match(err, /素材角色只能是 raw \/ standard \/ view_front \/ view_side \/ view_back \/ output/)
  assert.match(err, /三视图用 view_front \/ view_side \/ view_back/)
  assert.deepEqual(client.calls, [])
})

test('add-asset：外站直链在上传/查主体之前拦下（服务端 toKey 不收外链）', async () => {
  const client = fakeClient()
  const err = await expectError(() => addSubjectAsset(client, 'subj-1', undefined, { url: 'https://example.com/a.png', role: 'view_front' }))
  assert.match(err, /只收中台图库直链/)
  assert.deepEqual(client.calls, [], '外链校验必须先于任何网络调用')
})

test('add-asset：文件与 --url 二选一；都不给要明确报错', async () => {
  const client = fakeClient()
  assert.match(
    await expectError(() => addSubjectAsset(client, 'subj-1', './f.png', { url: 'https://img.webkubor.online/a.png' })),
    /二选一/,
  )
  assert.match(await expectError(() => addSubjectAsset(client, 'subj-1', undefined, {})), /缺图/)
  assert.deepEqual(client.calls, [])
})

test('add-asset：本地文件 → 先 uploadRef 再登记，且带主体自己的 workspace_id', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await addSubjectAsset(client, 'subj-1', './顾栖月-正面.png', { role: 'view_front', name: '顾栖月-正面' })
  } finally {
    cap.restore()
  }
  assert.deepEqual(client.calls.map((c) => c[0]), ['subjects', 'subjects', 'uploadRef', 'registerAsset'])
  const [, input] = client.calls.find((c) => c[0] === 'registerAsset')
  assert.deepEqual(input, {
    workspaceId: 'ws-1',                                       // 主体所在项目，必须带上（服务端按它判归属）
    subjectId: 'subj-1',
    r2KeyOrUrl: 'https://img.webkubor.online/refs/u/顾栖月-正面.png',
    role: 'view_front',                                        // 三视图全靠这个字段
    name: '顾栖月-正面',
  })
  // stdout 只出直链，可直接喂 --ref
  assert.match(cap.out(), /^https:\/\/img\.webkubor\.online\//)
})

test('add-asset：已是中台直链 → 不重复上传（一次 uploadRef 都不调）', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await addSubjectAsset(client, 'subj-1', undefined, {
      url: 'https://img.webkubor.online/refs/u/side.png',
      role: 'view_side',
    })
  } finally {
    cap.restore()
  }
  assert.equal(client.calls.filter((c) => c[0] === 'uploadRef').length, 0, '已是直链不该再传一遍')
  const [, input] = client.calls.find((c) => c[0] === 'registerAsset')
  assert.equal(input.r2KeyOrUrl, 'https://img.webkubor.online/refs/u/side.png')
  assert.equal(input.role, 'view_side')
})

test('add-asset：不传 --role 时用服务端默认值 raw（不猜别的）', async () => {
  const client = fakeClient()
  const cap = captureOutput()
  try {
    await addSubjectAsset(client, 'subj-1', undefined, { url: 'https://img.webkubor.online/refs/u/x.png' })
  } finally {
    cap.restore()
  }
  const [, input] = client.calls.find((c) => c[0] === 'registerAsset')
  assert.equal(input.role, 'raw')
})

test('add-asset：个人主体（workspace_id 为 null）也必须把 null 带上去', async () => {
  // 服务端判的是 `subject.workspace_id !== body.workspace_id`：两边都为 null 才通过，
  // 少传一个字段就变成 undefined !== null → 400「主体不存在或不属于这个项目」
  const personal = { ...SUBJECT, id: 'subj-p', workspace_id: null }
  const client = fakeClient({
    subjects: async (workspaceId) => (workspaceId ? [] : [personal]),
    workspaces: async () => [],
  })
  const cap = captureOutput()
  try {
    await addSubjectAsset(client, 'subj-p', undefined, { url: 'https://img.webkubor.online/refs/u/x.png', role: 'raw' })
  } finally {
    cap.restore()
  }
  const [, input] = client.calls.find((c) => c[0] === 'registerAsset')
  assert.equal(input.workspaceId, null)
  assert.equal(input.subjectId, 'subj-p')
})

// 2026-10-04 实测的线上形状：服务端把上游响应体截到 200 字符，"duplicate key" 被截在
// duplica 处 → assets.js 的 /duplicate key|unique/ 匹配不上 → 契约里的 409 漏成 500。
const TRUNCATED_DUP =
  '中台 API /api/assets 失败: supabase POST assets https://x.supabase.co/rest/v1/assets: HTTP 409 ' +
  '{"code":"23505","details":"Key (workspace_id, r2_key)=(ws-1, refs/u/f.png) already exists.","hint":null,"message":"duplica'

test('add-asset：重复登记（服务端 409 漏成 500）补一句中文，且原始报错原样保留', async () => {
  const client = fakeClient({
    registerAsset: async () => { throw new Error(TRUNCATED_DUP) },
  })
  const err = await expectError(() => addSubjectAsset(client, 'subj-1', undefined, {
    url: 'https://img.webkubor.online/refs/u/f.png',
    role: 'view_side',
  }))
  assert.match(err, /已经登记过了/)
  assert.ok(err.includes(TRUNCATED_DUP), '原始报错必须原样保留，不能被替换掉（否则服务端真因就查不着了）')
})

test('add-asset：其它错误原样透传，不加多余的话', async () => {
  const original = '中台 API /api/assets 失败: 未知的素材角色'
  const client = fakeClient({ registerAsset: async () => { throw new Error(original) } })
  const err = await expectError(() => addSubjectAsset(client, 'subj-1', undefined, {
    url: 'https://img.webkubor.online/refs/u/f.png',
    role: 'raw',
  }))
  assert.equal(err, original)
})
