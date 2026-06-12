const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
] as const

const START_CODE_B = 104
const STOP_CODE = 106
const QUIET_ZONE_MODULES = 10

export interface Code128Bar {
  x: number
  width: number
}

export interface Code128Barcode {
  bars: Code128Bar[]
  value: string
  width: number
}

function normalizeCode128BValue(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Code 128 value is empty')
  }

  for (const char of normalized) {
    const codePoint = char.charCodeAt(0)
    if (codePoint < 32 || codePoint > 126) {
      throw new Error(`Code 128-B cannot encode character ${JSON.stringify(char)}`)
    }
  }

  return normalized
}

export function encodeCode128BValues(value: string) {
  const normalized = normalizeCode128BValue(value)
  const dataCodes = Array.from(normalized, (char) => char.charCodeAt(0) - 32)
  const checksum = dataCodes.reduce((sum, code, index) => sum + code * (index + 1), START_CODE_B) % 103
  return [START_CODE_B, ...dataCodes, checksum, STOP_CODE]
}

export function buildCode128B(value: string): Code128Barcode {
  const normalized = normalizeCode128BValue(value)
  const codeValues = encodeCode128BValues(normalized)
  const bars: Code128Bar[] = []
  let cursor = QUIET_ZONE_MODULES

  for (const codeValue of codeValues) {
    const pattern = CODE128_PATTERNS[codeValue]
    if (!pattern) {
      throw new Error(`Missing Code 128 pattern for value ${codeValue}`)
    }

    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i])
      if (i % 2 === 0) {
        bars.push({ x: cursor, width })
      }
      cursor += width
    }
  }

  return {
    bars,
    value: normalized,
    width: cursor + QUIET_ZONE_MODULES,
  }
}
