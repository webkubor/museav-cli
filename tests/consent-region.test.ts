import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONSENT_COUNTRY_GROUPS,
  CONSENT_REQUIRED_COUNTRIES,
  normalizeCountry,
  resolveConsentRegion,
} from '../src/config/consent-region.ts'
import { TIMEZONE_COUNTRY } from '../src/config/timezone-countries.ts'

const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })
const isKnownRegion = (code: string) => /^[A-Z]{2}$/.test(code) && regionNames.of(code) !== undefined

describe('normalizeCountry', () => {
  it('统一为 ISO 3166-1 alpha-2 大写', () => {
    assert.equal(normalizeCountry('de'), 'DE')
    assert.equal(normalizeCountry(' GB '), 'GB')
  })

  it('UK 归一为 GB，EL（欧盟机构写法）归一为 GR', () => {
    assert.equal(normalizeCountry('UK'), 'GB')
    assert.equal(normalizeCountry('EL'), 'GR')
  })

  it('未知、占位与非法输入返回 null', () => {
    for (const raw of ['XX', 'T1', 'ZZ', '', '  ', 'USA', '1', 'D', undefined, null]) {
      assert.equal(normalizeCountry(raw), null, `应为 null：${String(raw)}`)
    }
  })
})

describe('名单', () => {
  it('每个代码都是合法的 ISO alpha-2 地区', () => {
    for (const group of CONSENT_COUNTRY_GROUPS) {
      for (const code of group.countries) {
        assert.ok(isKnownRegion(code), `${group.id} 中的 ${code} 不是合法地区码`)
      }
    }
  })

  it('欧盟 27 国完整，EEA、英国、瑞士与用户指定的 4 国都在内', () => {
    const eu = CONSENT_COUNTRY_GROUPS.find((g) => g.id === 'EU')
    assert.equal(eu?.countries.length, 27)
    assert.equal(CONSENT_REQUIRED_COUNTRIES.size, 36)
    for (const code of ['IS', 'LI', 'NO', 'GB', 'CH', 'TR', 'MK', 'RS', 'TH']) {
      assert.ok(CONSENT_REQUIRED_COUNTRIES.has(code), `应在名单内：${code}`)
    }
  })

  it('名单外的国家不在内，AX 与欧盟海外领地本期未纳入', () => {
    for (const code of ['US', 'UA', 'CN', 'JP', 'TW', 'SG', 'MC', 'VA', 'SM', 'AX', 'GF', 'YT']) {
      assert.equal(CONSENT_REQUIRED_COUNTRIES.has(code), false, `不应在名单内：${code}`)
    }
  })

  it('名单里的每个国家至少有一个时区能映射到它（否则名单无法生效）', () => {
    const reachable = new Set(Object.values(TIMEZONE_COUNTRY))
    for (const code of CONSENT_REQUIRED_COUNTRIES) {
      assert.ok(reachable.has(code), `没有任何时区映射到 ${code}`)
    }
  })
})

describe('时区映射表', () => {
  it('所有映射值都是合法的国家码', () => {
    for (const [tz, code] of Object.entries(TIMEZONE_COUNTRY)) {
      assert.equal(normalizeCountry(code), code, `${tz} 的值 ${code} 不是规范码`)
      assert.ok(isKnownRegion(code), `${tz} 的值 ${code} 不是合法地区码`)
    }
  })
})

describe('resolveConsentRegion', () => {
  const resolve = (tz: string | null | undefined) => resolveConsentRegion(tz, TIMEZONE_COUNTRY)

  it('名单内的时区出横幅（required）', () => {
    for (const tz of [
      'Europe/Berlin',
      'Europe/London',
      'Europe/Amsterdam',
      'Europe/Dublin',
      'Europe/Zurich',
      'Atlantic/Reykjavik',
      'Europe/Vaduz',
      'Europe/Istanbul',
      'Asia/Bangkok',
    ]) {
      assert.equal(resolve(tz), 'required', tz)
    }
  })

  it('名单外的时区不出横幅（not-required）', () => {
    for (const tz of [
      'Asia/Shanghai',
      'Asia/Taipei',
      'Asia/Calcutta',
      'America/New_York',
      'Asia/Tokyo',
      'Europe/Kiev',
      'Europe/Kyiv',
      'Europe/Monaco',
      'Europe/Vatican',
      'Europe/San_Marino',
      'Europe/Jersey',
      'Europe/Mariehamn',
      'Asia/Phnom_Penh',
    ]) {
      assert.equal(resolve(tz), 'not-required', tz)
    }
  })

  it('查不到国家的时区返回 unknown（调用方出横幅）', () => {
    for (const tz of [
      'UTC',
      'Etc/UTC',
      'CET',
      'Mars/Olympus',
      'constructor',
      '__proto__',
      '',
      null,
      undefined,
    ]) {
      assert.equal(resolve(tz), 'unknown', String(tz))
    }
  })
})
