/**
 * Benchmark 排名说明与分组标题的 i18n 完整性（需求方 prd#1067）。
 *
 * 分组标题那几条 key 是**拼出来的**（`benchmarkGroupKey(code)`），而
 * `scripts/check-i18n.mjs` 只静态校验 `t('字面量')` 的引用 —— 拼接 key 它一条都看不到。
 * 漏一条不会有人报错，页面上只会渲染出 `modelsCatalog.detail.benchmarkGroup.CODING`
 * 这种裸 key，所以由本文件逐条兜住。
 *
 * 第二条断言是这张单的核心：**英文资源里不许出现汉字**。#1067 的形状正是「英文站整块中文」，
 * 而中文混进英文资源既不报错也不崩，只有人打开 modelgo.ai 才看得见。
 */
import { describe, expect, it } from 'vitest'
import zhModelsCatalog from '@/locales/zh/modelsCatalog.json'
import enModelsCatalog from '@/locales/en/modelsCatalog.json'
import { LOCALIZED_GROUP_CODES, benchmarkGroupKey } from './benchmark-i18n'

const HAN = /[一-龥]/

const RESOURCES = {
  zh: zhModelsCatalog as unknown as Record<string, unknown>,
  en: enModelsCatalog as unknown as Record<string, unknown>,
}

/** 按 i18next 的点号路径取值；取不到返回 undefined（而不是抛），断言里好读。 */
function lookup(language: 'zh' | 'en', key: string) {
  let node: unknown = RESOURCES[language]
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string' ? node : undefined
}

const KEYS = [
  'modelsCatalog.detail.benchmarkRank',
  'modelsCatalog.detail.benchmarkRankAhead',
  'modelsCatalog.detail.benchmarkDistributionAria',
  'modelsCatalog.detail.benchmarkDistributionAriaBrief',
  ...[...LOCALIZED_GROUP_CODES].map(benchmarkGroupKey),
]

describe('Benchmark i18n 资源', () => {
  it.each(KEYS)('%s 在中英两份资源里都有非空文案', (key) => {
    expect(lookup('zh', key), `zh 缺 ${key}`).toBeTruthy()
    expect(lookup('en', key), `en 缺 ${key}`).toBeTruthy()
  })

  it('英文资源里不含汉字（#1067 就是英文站显示中文）', () => {
    expect(KEYS.filter((key) => HAN.test(lookup('en', key) ?? ''))).toEqual([])
  })

  it('带占位符的文案中英两边占位符集合一致（少一个就会漏渲染一段信息）', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
    for (const key of KEYS) {
      expect(placeholders(lookup('en', key) ?? ''), key).toEqual(placeholders(lookup('zh', key) ?? ''))
    }
  })
})
