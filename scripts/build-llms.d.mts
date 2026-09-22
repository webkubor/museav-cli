/**
 * scripts/build-llms.mjs 的类型声明。
 *
 * 为什么单独一份：vite.config.ts 走 tsc 类型检查（tsconfig.node.json，未开 allowJs），
 * 直接 import 无类型的 .mjs 会报「找不到声明文件」。.mjs ↔ .d.mts 是 TS 的标准配对，
 * 加这一份既能保住实现只有一处（.mjs 兼顾 CLI），又让 vite.config.ts 拿到类型。
 */
export type LlmsMarket = 'both' | 'china' | 'global'

/** 渲染 llms.txt 全文（按市场选模板 + 替换域名占位）。 */
export declare function renderLlms(market?: LlmsMarket): string

/** 渲染并写入目标目录（默认 dist/）。 */
export declare function writeLlms(opts?: {
  market?: LlmsMarket
  outDir?: string
}): { outPath: string; market: LlmsMarket; bytes: number }
