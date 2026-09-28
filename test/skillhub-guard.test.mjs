/**
 * 平台公共模板护栏自检。
 *
 * 这道护栏的价值全在「不误伤」：把引用平台模板的正常集成 Skill 拦掉，
 * 比放行一次搬运更伤——那等于让用户把自己的 Skill 也发不出去。
 * 所以正例和反例一样重要。
 *
 * 跑： npm test（需要先 npm run build）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectPlatformFingerprints,
  findFingerprintHits,
  collectTextFiles,
  findManagedAssetDir,
  inspectPublishTarget,
  formatGuardRejection,
  collectPublicLibrarySlugs,
} from '../dist/skillhub-guard.js'

/** 造一个平台公共模板：正文够长、指纹有区分度 */
const PLATFORM_TEMPLATE = {
  id: 'ecommerce-white-bg',
  category: '电商',
  zh_name: '电商白底图',
  ratio: '1:1',
  tenant_id: null,
  source: 'platform',
  generation_configs: [
    {
      model: 'seedream',
      prompt_template:
        '生成一张电商白底商品主图：纯白背景，商品居中，柔和均匀的顶部光，' +
        '无投影无装饰，边缘干净，适合直接上架使用，画面中不要出现任何文字与水印。',
    },
  ],
}

const TENANT_TEMPLATE = {
  ...PLATFORM_TEMPLATE,
  id: 'tenant-private-poster',
  source: 'mine',
  tenant_id: 'tenant-42',
}

function makeSkill(files) {
  const dir = mkdtempSync(join(tmpdir(), 'skill-guard-'))
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body, 'utf8')
  }
  return dir
}

test('抄了平台模板正文 → 拦下，并指出是哪张模板', () => {
  const dir = makeSkill({
    'SKILL.md':
      '# 电商白底图生成\n\n' +
      '生成一张电商白底商品主图：纯白背景，商品居中，柔和均匀的顶部光，' +
      '无投影无装饰，边缘干净，适合直接上架使用，画面中不要出现任何文字与水印。\n',
  })
  const r = inspectPublishTarget({ skillPath: dir, templates: [PLATFORM_TEMPLATE] })
  assert.equal(r.ok, false)
  assert.equal(r.copiedTemplates[0].id, 'ecommerce-white-bg')

  const msg = formatGuardRejection(r, dir)
  assert.match(msg, /平台公共模板/)
  assert.match(msg, /ecommerce-white-bg/)
  assert.match(msg, /不能复制后挂到小红书上再分发/)

  rmSync(dir, { recursive: true, force: true })
})

test('只引用平台模板 slug、不抄正文 → 放行（这是合法集成，不能误伤）', () => {
  const dir = makeSkill({
    'SKILL.md':
      '# 电商出图助手\n\n' +
      '调用平台模板出白底图：\n\n' +
      '```bash\nmuseav gen --template ecommerce-white-bg --input "一支口红"\n```\n',
  })
  const r = inspectPublishTarget({ skillPath: dir, templates: [PLATFORM_TEMPLATE] })
  assert.equal(r.ok, true)
  assert.deepEqual(r.copiedTemplates, [])
  assert.equal(r.contentChecked, true)

  rmSync(dir, { recursive: true, force: true })
})

test('改过空白的搬运也能认出来（归一化后仍命中）', () => {
  const dir = makeSkill({
    'SKILL.md':
      '生成一张电商白底商品主图：纯白背景，  商品居中，柔和均匀的顶部光，' +
      '无投影无装饰，边缘干净，\n\n适合直接上架使用，画面中不要出现任何文字与水印。\n',
  })
  const r = inspectPublishTarget({ skillPath: dir, templates: [PLATFORM_TEMPLATE] })
  assert.equal(r.ok, false, '换行/多余空格不应让搬运漏网')

  rmSync(dir, { recursive: true, force: true })
})

test('租户自己建的模板不算平台资产，照发', () => {
  const body =
    '生成一张电商白底商品主图：纯白背景，商品居中，柔和均匀的顶部光，' +
    '无投影无装饰，边缘干净，适合直接上架使用，画面中不要出现任何文字与水印。'
  const dir = makeSkill({ 'SKILL.md': `# 我的模板\n\n${body}\n` })
  const r = inspectPublishTarget({ skillPath: dir, templates: [TENANT_TEMPLATE] })
  assert.equal(r.ok, true, '租户资产不归平台管，不该被这条护栏拦')

  rmSync(dir, { recursive: true, force: true })
})

test('拉不到清单时放行，但明确标记「未校验」（而不是假装有护栏）', () => {
  const dir = makeSkill({ 'SKILL.md': '# x\n' })
  const r = inspectPublishTarget({ skillPath: dir, templates: null })
  assert.equal(r.ok, true)
  assert.equal(r.contentChecked, false, '调用方据此提示用户本次没校验')

  rmSync(dir, { recursive: true, force: true })
})

test('.zip 源包不本地解包，内容校验交给官方 CLI', () => {
  const r = inspectPublishTarget({ skillPath: '/tmp/whatever.zip', templates: [PLATFORM_TEMPLATE] })
  assert.equal(r.ok, true)
  assert.equal(r.contentChecked, false)
})

test('落在平台托管目录里直接按路径拒（离线也生效）', () => {
  const dir = findManagedAssetDir(`${process.env.HOME}/.museav-models/whatever`)
  assert.equal(dir, '.museav-models')
  assert.equal(findManagedAssetDir('/tmp/my-skill'), null)
})

test('正文太短的模板不建指纹（否则通用占位文案会误伤一片）', () => {
  const fps = collectPlatformFingerprints([
    { ...PLATFORM_TEMPLATE, id: 'too-short', generation_configs: [{ model: 'm', prompt_template: '生成一张图' }] },
    PLATFORM_TEMPLATE,
  ])
  assert.equal(fps.has('too-short'), false)
  assert.equal(fps.has('ecommerce-white-bg'), true)
})

test('collectTextFiles 跳过二进制与隐藏目录，不被大文件拖死', () => {
  const dir = makeSkill({
    'SKILL.md': '# ok\n',
    '.hidden/secret.md': 'x',
    'node_modules/pkg/index.md': 'x',
    'pic.png': 'x',
  })
  const { files } = collectTextFiles(dir)
  assert.equal(files.length, 1)
  assert.match(files[0], /SKILL\.md$/)

  rmSync(dir, { recursive: true, force: true })
})

test('findFingerprintHits 去重：一个模板多处命中只报一次', () => {
  const body = PLATFORM_TEMPLATE.generation_configs[0].prompt_template
  const dir = makeSkill({ 'a.md': body, 'b.md': body })
  const { files } = collectTextFiles(dir)
  const hits = findFingerprintHits(files, collectPlatformFingerprints([PLATFORM_TEMPLATE]))
  assert.equal(hits.length, 1)
  assert.equal(hits[0].id, 'ecommerce-white-bg')

  rmSync(dir, { recursive: true, force: true })
})

test('collectPublicLibrarySlugs 只取公共库（排除私有与租户专属）', () => {
  const slugs = collectPublicLibrarySlugs([
    { slug: 'public-a', private: false, agency: false },
    { slug: 'mine-b', private: true },
    { slug: 'agency-c', agency: true },
  ])
  assert.deepEqual(slugs, ['public-a'])
})
