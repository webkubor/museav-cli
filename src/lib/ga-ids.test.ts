import { describe, expect, it } from 'vitest'
import { readGaIdentifiers } from './ga-ids'

describe('readGaIdentifiers', () => {
  it('_ga 的 GA1 格式：取末两段作为 client_id', () => {
    expect(readGaIdentifiers('_ga=GA1.1.1234567890.1700000000')).toEqual({ ga_client_id: '1234567890.1700000000' })
    expect(readGaIdentifiers('_ga=GA1.2.1234567890.1700000000')).toEqual({ ga_client_id: '1234567890.1700000000' })
  })

  it('_ga_WCEKH5ZZEH 的 GS1 格式：第三段是 session_id', () => {
    expect(readGaIdentifiers('_ga_WCEKH5ZZEH=GS1.1.1760000000.3.1.1760000100.0.0.0')).toEqual({ ga_session_id: '1760000000' })
  })

  it('_ga_WCEKH5ZZEH 的 GS2 格式：s 之后、第一个 $ 之前的数字是 session_id', () => {
    expect(readGaIdentifiers('_ga_WCEKH5ZZEH=GS2.1.s1760000000$o1$g1$t1760000100$j60$l0$h0')).toEqual({ ga_session_id: '1760000000' })
  })

  it('_gcl_aw 的 GCL 格式：取 gclid 段', () => {
    expect(readGaIdentifiers('_gcl_aw=GCL.1760000000.Cj0KCQjw-abc_DEF')).toEqual({ gcl_aw: 'Cj0KCQjw-abc_DEF' })
  })

  it('三个 cookie 同时存在时一次取全，URL 编码的值先解码', () => {
    const cookie = '_ga=GA1.1.111.222; theme=dark; _ga_WCEKH5ZZEH=GS1.1.333.4.1; _gcl_aw=GCL.5.gc%5Fid'
    expect(readGaIdentifiers(cookie)).toEqual({ ga_client_id: '111.222', ga_session_id: '333', gcl_aw: 'gc_id' })
  })

  it('cookie 缺失时返回空对象', () => {
    expect(readGaIdentifiers('')).toEqual({})
    expect(readGaIdentifiers('theme=dark; lang=zh')).toEqual({})
  })

  it('格式不对的值一律省略，不返回 undefined 字段', () => {
    expect(readGaIdentifiers('_ga=GA2.1.1.2; _ga_WCEKH5ZZEH=GS1.2.3.4; _gcl_aw=GCL.abc.gclid')).toEqual({})
    expect(readGaIdentifiers('_ga=<script>alert(1)</script>; _gcl_aw=GCL.1760000000.')).toEqual({})
    expect(readGaIdentifiers('_ga=GA1.1.abc.def; _ga_WCEKH5ZZEH=GS2.1.sabc$o1')).toEqual({})
  })

  it('非法的百分号编码按读不到处理，不抛错', () => {
    expect(() => readGaIdentifiers('_ga=%E0%A4%A; _gcl_aw=GCL.1760000000.ok')).not.toThrow()
    expect(readGaIdentifiers('_ga=%E0%A4%A; _gcl_aw=GCL.1760000000.ok')).toEqual({ gcl_aw: 'ok' })
  })

  it('_ga 只精确匹配键名，不误中 _ga_WCEKH5ZZEH；其它测量 ID 的 _ga_ cookie 不取', () => {
    expect(readGaIdentifiers('_ga_WCEKH5ZZEH=GS1.1.1760000000.3')).not.toHaveProperty('ga_client_id')
    expect(readGaIdentifiers('_ga_OTHERID1=GS1.1.1760000000.3; _ga_OTHERID1x=GS2.1.s9$o1')).toEqual({})
  })

  it('不传参数时读 document.cookie', () => {
    document.cookie = '_gcl_aw=GCL.1760000000.fromdoc; path=/'
    try {
      expect(readGaIdentifiers()).toEqual({ gcl_aw: 'fromdoc' })
    } finally {
      document.cookie = '_gcl_aw=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    }
  })
})
