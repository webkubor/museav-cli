/**
 * Cookie 同意横幅的国家名单（国外官网）。
 *
 * - 名单内的访客看到横幅，同意前不加载 GA / GTM。
 * - 名单外的访客不出横幅，也就不加载任何追踪（默认不同意；页脚「Cookie 设置」仍可主动打开）。
 * - 查不到国家的访客（UTC、未知时区）出横幅：宁可多问一次，同意前仍不加载任何追踪。
 *
 * 改名单：只改本文件，并递增 CONSENT_COUNTRY_LIST_VERSION。
 * 时区到国家的映射在 timezone-countries.ts（生成文件，由 scripts/gen-timezone-countries.mjs 生成）。
 * 本文件无 import，搬到后端时可原样迁移。
 */

/** 名单版本。改了名单必须递增，便于追溯某次横幅判定用的是哪一版名单。 */
export const CONSENT_COUNTRY_LIST_VERSION = '2026-10-v1'

export interface ConsentCountryGroup {
  id: string
  /** 纳入依据（给法务复核用，不展示给访客）。 */
  basis: string
  since: string
  /** ISO 3166-1 alpha-2 大写。 */
  countries: readonly string[]
}

export const CONSENT_COUNTRY_GROUPS: readonly ConsentCountryGroup[] = [
  {
    id: 'EU',
    basis: '欧盟成员国（GDPR、ePrivacy 第 5(3) 条）',
    since: CONSENT_COUNTRY_LIST_VERSION,
    countries: [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
      'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    ],
  },
  {
    id: 'EEA_EFTA',
    basis: 'EEA 非欧盟成员（EEA 协定）',
    since: CONSENT_COUNTRY_LIST_VERSION,
    countries: ['IS', 'LI', 'NO'],
  },
  {
    id: 'GB',
    basis: '英国（UK GDPR、PECR）',
    since: CONSENT_COUNTRY_LIST_VERSION,
    countries: ['GB'],
  },
  {
    id: 'CH',
    basis: '瑞士（用户指定名单，依据待法务复核）',
    since: CONSENT_COUNTRY_LIST_VERSION,
    countries: ['CH'],
  },
  {
    id: 'EXTRA',
    basis: '用户指定名单（TR、MK、RS、TH），依据待法务确认',
    since: CONSENT_COUNTRY_LIST_VERSION,
    countries: ['TR', 'MK', 'RS', 'TH'],
  },
]

export const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set(
  CONSENT_COUNTRY_GROUPS.flatMap((group) => group.countries),
)

/** 国家码别名：UK 是 GB 的常见写法；EL 是欧盟机构对希腊的写法（ISO 为 GR）。 */
const COUNTRY_ALIASES: Readonly<Record<string, string>> = { UK: 'GB', EL: 'GR' }

/** 表示「未知 / 其它」的占位码，不当作国家。XX 未知，T1 Tor 出口节点，ZZ 未定义。 */
const NON_COUNTRY_CODES: ReadonlySet<string> = new Set(['XX', 'T1', 'ZZ'])

/** 归一为 ISO 3166-1 alpha-2 大写；无法识别返回 null。 */
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  if (NON_COUNTRY_CODES.has(code)) return null
  const mapped = Object.hasOwn(COUNTRY_ALIASES, code) ? COUNTRY_ALIASES[code] : code
  return /^[A-Z]{2}$/.test(mapped) ? mapped : null
}

export type ConsentRegion = 'required' | 'not-required' | 'unknown'

/**
 * 时区 → 地区判定。timeZoneCountries 是 IANA 时区到国家码的映射（见 timezone-countries.ts）。
 * - required：名单内国家，出横幅
 * - not-required：名单外国家，不出横幅
 * - unknown：时区缺失或映射不到国家，出横幅
 */
export function resolveConsentRegion(
  timeZone: string | null | undefined,
  timeZoneCountries: Readonly<Record<string, string>>,
): ConsentRegion {
  if (!timeZone || !Object.hasOwn(timeZoneCountries, timeZone)) return 'unknown'
  const country = normalizeCountry(timeZoneCountries[timeZone])
  if (!country) return 'unknown'
  return CONSENT_REQUIRED_COUNTRIES.has(country) ? 'required' : 'not-required'
}
