/**
 * 内置排版模板。不联网、不登录也能出片 —— 这是 slideshow 最重要的属性，
 * 接中台模板库之后也必须保住。
 *
 * `sticker-pink-mint` 与中台 slideshow_layouts 里平台预置的同名模板**是同一份 DSL**
 * （见 supabase/migrations/20260828120000_slideshow_layouts.sql）。存两份是刻意的：
 * 中台那份是给人看、给人改的起点，这份是断网兜底。两份必须一致，改动时同步。
 *
 * 想要别的版面不要在这里加 —— 去中台建模板（museav slideshow-layouts create），
 * 那才是排版体系的落点。这里只留「默认」和「深色默认」两套兜底。
 */
import type { Layout } from './local-slideshow.js'

export const PRESET_LIGHT: Layout = {
  version: 1,
  canvas: { w: 1080, h: 1920, bg: '#ffffff' },
  seconds: 2.5,
  layers: [
    { type: 'ellipse', cx: 190, cy: -131, rx: 510, ry: 430, fill: '#ffd6e2' },
    { type: 'ellipse', cx: 1110, cy: 1901, rx: 291, ry: 280, fill: '#baebe2' },
    { type: 'text', bind: 'title', x: 540, y: 394, size: 84, weight: 600, fill: '#2b2d31', align: 'center', maxWidth: 0.86, minSize: 36 },
    { type: 'text', bind: 'subtitle', x: 540, y: 495, size: 44, fill: '#8c929b', align: 'center' },
    { type: 'slot', bind: 'image', box: [281, 660, 518, 701], fit: 'contain', trim: true },
    { type: 'text', bind: 'caption', x: 540, y: 1578, size: 72, weight: 600, fill: '#2b2d31', align: 'center', maxWidth: 0.86, minSize: 28 },
    { type: 'text', bind: 'footer', x: 540, y: 1776, size: 33, fill: '#8c929b', align: 'center' },
  ],
}

export const PRESET_DARK: Layout = {
  ...PRESET_LIGHT,
  canvas: { w: 1080, h: 1920, bg: '#16181c' },
  layers: PRESET_LIGHT.layers.map((l) => {
    if (l.type === 'ellipse') return { ...l, fill: l.fill === '#ffd6e2' ? '#3a2b33' : '#22383a' }
    if (l.type === 'text') return { ...l, fill: l.fill === '#2b2d31' ? '#e9ebef' : '#8b929c' }
    return l
  }),
}

export const PRESETS: Record<string, Layout> = {
  'sticker-pink-mint': PRESET_LIGHT,
  'sticker-pink-mint-dark': PRESET_DARK,
}
