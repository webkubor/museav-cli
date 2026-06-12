import { describe, expect, it } from 'vitest'

import { buildCode128B, encodeCode128BValues } from './code128'

describe('Code 128-B encoder', () => {
  it('encodes ASCII payloads with the correct checksum and stop code', () => {
    expect(encodeCode128BValues('ABC')).toEqual([104, 33, 34, 35, 1, 106])
  })

  it('builds scannable bar modules with quiet zones', () => {
    const barcode = buildCode128B('WX202606100001')

    expect(barcode.value).toBe('WX202606100001')
    expect(barcode.width).toBeGreaterThan(160)
    expect(barcode.bars[0]).toEqual({ x: 10, width: 2 })
    expect(barcode.bars.length).toBeGreaterThan(40)
  })

  it('rejects values that Code 128-B cannot represent exactly', () => {
    expect(() => buildCode128B('订单号')).toThrow(/cannot encode/)
  })
})
