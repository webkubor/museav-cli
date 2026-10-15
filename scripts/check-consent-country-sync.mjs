#!/usr/bin/env node
// index.html 的首屏门控必须与 src/config 的共享配置逐字一致：
// 内联脚本在 parser-blocking 阶段执行，无法 import 模块，所以两处内容相同但物理重复。
// 改名单或升级 tzdata 后运行：node scripts/check-consent-country-sync.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const zones = read('../src/config/timezone-countries.ts')
const html = read('../index.html')
const policy = read('../src/config/consent-region.ts')

const section = (source, start, end) => {
  const from = source.indexOf(start)
  assert.notEqual(from, -1, `missing ${start}`)
  const to = source.indexOf(end, from)
  assert.notEqual(to, -1, `missing ${end}`)
  return source.slice(from, to)
}

const zonePairs = (body) =>
  [...body.matchAll(/['"]([^'"]+)['"]:\s*['"]([A-Z]{2})['"]/g)].map(([, tz, cc]) => `${tz}=${cc}`).sort()
const codes = (body) => [...body.matchAll(/['"]([A-Z]{2})['"]/g)].map(([, cc]) => cc).sort()

const moduleZones = zonePairs(section(zones, 'TIMEZONE_COUNTRY', '\n}'))
const inlineZones = zonePairs(section(html, 'var TZ_COUNTRY', '};'))
assert.deepEqual(inlineZones, moduleZones, 'index.html 内联时区表与 timezone-countries.ts 不一致')

const groupBodies = [...policy.matchAll(/countries:\s*\[([\s\S]*?)\]/g)].map(([, body]) => body)
const moduleCountries = codes(groupBodies.join('\n'))
const inlineCountries = codes(section(html, 'var REQUIRED = [', '];'))
assert.deepEqual(inlineCountries, moduleCountries, 'index.html 内联国家名单与 consent-region.ts 不一致')

console.log(`consent 配置同步：${moduleZones.length} 个时区，${moduleCountries.length} 个国家`)
