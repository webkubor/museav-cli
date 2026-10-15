#!/usr/bin/env node
// 生成 src/config/timezone-countries.ts：IANA 时区 → ISO 3166-1 alpha-2（大写）。
//
// 数据源是 tzdata 的两个文件：
// - zone.tab：每个标准时区对应的国家，权威表。
// - tzdata.zi 的 L 行：别名（backward 链接）。链接默认沿用目标时区的国家，
//   但 tzdata 2022 起有些国家的时区并入了邻国城市（如 Europe/Amsterdam → Europe/Brussels），
//   这些链接的真实国家写在 LINK_COUNTRY 里覆盖。
//
// 用法：node scripts/gen-timezone-countries.mjs [zoneinfo 目录，默认 /usr/share/zoneinfo]
// tzdata 升级后重新生成并提交结果。只用 Node 内建模块，无第三方依赖。
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ZONEINFO = resolve(process.argv[2] ?? '/usr/share/zoneinfo')
const OUT_FILE = fileURLToPath(new URL('../src/config/timezone-countries.ts', import.meta.url))

/** 链接的真实国家（目标时区属于别国，或目标本身不在 zone.tab 里）。键必须是 tzdata 里真实存在的名字。 */
const LINK_COUNTRY = {
  'Africa/Asmara': 'ER',
  'Africa/Asmera': 'ER',
  'Africa/Timbuktu': 'ML',
  'America/Coral_Harbour': 'CA',
  'America/Virgin': 'VI',
  'Antarctica/DumontDUrville': 'AQ',
  'Antarctica/McMurdo': 'AQ',
  'Antarctica/South_Pole': 'AQ',
  'Antarctica/Syowa': 'AQ',
  'Arctic/Longyearbyen': 'SJ',
  'Asia/Brunei': 'BN',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Phnom_Penh': 'KH',
  'Asia/Vientiane': 'LA',
  'Atlantic/Jan_Mayen': 'SJ',
  'Atlantic/Reykjavik': 'IS',
  'Atlantic/St_Helena': 'SH',
  'Europe/Amsterdam': 'NL',
  'Europe/Bratislava': 'SK',
  'Europe/Busingen': 'DE',
  'Europe/Copenhagen': 'DK',
  'Europe/Guernsey': 'GG',
  'Europe/Isle_of_Man': 'IM',
  'Europe/Jersey': 'JE',
  'Europe/Ljubljana': 'SI',
  'Europe/Luxembourg': 'LU',
  'Europe/Mariehamn': 'AX',
  'Europe/Monaco': 'MC',
  'Europe/Oslo': 'NO',
  'Europe/Podgorica': 'ME',
  'Europe/San_Marino': 'SM',
  'Europe/Sarajevo': 'BA',
  'Europe/Skopje': 'MK',
  'Europe/Stockholm': 'SE',
  'Europe/Vaduz': 'LI',
  'Europe/Vatican': 'VA',
  'Europe/Zagreb': 'HR',
  'Iceland': 'IS',
  'Indian/Antananarivo': 'MG',
  'Indian/Christmas': 'CX',
  'Indian/Cocos': 'CC',
  'Indian/Comoro': 'KM',
  'Indian/Kerguelen': 'TF',
  'Indian/Mahe': 'SC',
  'Indian/Mayotte': 'YT',
  'Indian/Reunion': 'RE',
  'Pacific/Johnston': 'UM',
  'Pacific/Ponape': 'FM',
  'Pacific/Truk': 'FM',
  'Pacific/Yap': 'FM',
}

/**
 * 只是旧缩写、不对应城市的名字。即使目标时区有国家也不收录，
 * 访客落到「查不到」，按「出横幅」处理（fail-closed）。
 */
const ABBREVIATIONS = new Set([
  'CET',
  'CST6CDT',
  'EET',
  'EST',
  'EST5EDT',
  'HST',
  'MET',
  'MST',
  'MST7MDT',
  'PST8PDT',
  'WET',
])

const read = (name) => readFileSync(resolve(ZONEINFO, name), 'utf8')

const canonical = new Map()
for (const line of read('zone.tab').split('\n')) {
  if (!line || line.startsWith('#')) continue
  const [cc, , tz] = line.split('\t')
  canonical.set(tz, cc)
}

const zi = read('tzdata.zi')
const version = zi.match(/^# version (\S+)/m)?.[1] ?? 'unknown'
/** link → target */
const links = new Map()
for (const line of zi.split('\n')) {
  const m = line.match(/^L (\S+) (\S+)$/)
  if (m) links.set(m[2], m[1])
}

for (const tz of Object.keys(LINK_COUNTRY)) {
  if (!links.has(tz) && !canonical.has(tz)) throw new Error(`LINK_COUNTRY 中的 ${tz} 在 tzdata 里不存在，请检查名字`)
}

function countryOf(tz, depth = 0) {
  if (LINK_COUNTRY[tz]) return LINK_COUNTRY[tz]
  if (canonical.has(tz)) return canonical.get(tz)
  if (links.has(tz) && depth < 5) return countryOf(links.get(tz), depth + 1)
  return null
}

const entries = new Map()
for (const tz of [...canonical.keys(), ...links.keys()]) {
  if (ABBREVIATIONS.has(tz)) continue
  const cc = countryOf(tz)
  if (cc) entries.set(tz, cc)
}

const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })
const invalid = [...new Set(entries.values())].filter((cc) => !/^[A-Z]{2}$/.test(cc) || !names.of(cc))
if (invalid.length) throw new Error(`非法国家码：${invalid.join(', ')}`)

const body = [...entries]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([tz, cc]) => `  '${tz}': '${cc}',`)
  .join('\n')

writeFileSync(
  OUT_FILE,
  `// 本文件由 scripts/gen-timezone-countries.mjs 生成，请勿手改（下次生成会覆盖）。
// 数据源：tzdata ${version}（zone.tab + L 行）。值为 ISO 3166-1 alpha-2 大写。
// 不在表中的时区（UTC、Etc/*、旧缩写）查不到国家，调用方按「未知」处理。
export const TIMEZONE_COUNTRY: Readonly<Record<string, string>> = {
${body}
}
`,
)

console.log(`写入 ${OUT_FILE}：${entries.size} 个时区（tzdata ${version}）`)
