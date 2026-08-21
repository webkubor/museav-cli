/**
 * 图标解析纯逻辑（需求方#791）。
 *
 * 用 React.memo / forwardRef 替身而不是真的 @lobehub/icons：真包在 vitest 里导入不了
 * （es 产物含目录式 import，Node ESM 解析器不支持），唯一绕法 server.deps.inline
 * 实测把全量测试从 37s 拉到 81s。替身与真图标的运行时形状完全一致 —— 都是带
 * $$typeof 的对象，而这正是 #791 的病根所在。
 */
import { memo, forwardRef } from 'react'
import { describe, expect, it } from 'vitest'

import {
  isRenderableComponent,
  pickIconComponent,
  resolveVendorKeyFrom,
  BRAND_ALIASES,
} from './icon-resolve'

/** 与 lobehub 图标同形：memo 对象，外挂 Color / Text / Avatar 变体。 */
function fakeLobehubIcon(label: string) {
  const Base = memo(() => null) as unknown as Record<string, unknown>
  Base.Color = memo(() => null)
  Base.Text = memo(() => null)
  Base.Avatar = forwardRef(() => null)
  Base.colorPrimary = '#123456' // 非组件的字符串属性，注册表里真实存在
  Base.title = label
  return Base
}

describe('isRenderableComponent', () => {
  it('memo 对象算可渲染 —— 这是 #791 的病根：typeof 是 object 不是 function', () => {
    const M = memo(() => null)
    expect(typeof M).toBe('object') // 先钉住前提，前提变了这条会先红
    expect(isRenderableComponent(M)).toBe(true)
  })

  it('forwardRef 对象算可渲染', () => {
    expect(isRenderableComponent(forwardRef(() => null))).toBe(true)
  })

  it('普通函数组件算可渲染', () => {
    expect(isRenderableComponent(() => null)).toBe(true)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['字符串', '#123456'],
    ['数字', 28],
    ['普通对象', { a: 1 }],
  ])('%s 不算可渲染', (_label, value) => {
    expect(isRenderableComponent(value)).toBe(false)
  })
})

describe('pickIconComponent', () => {
  const registry = {
    Qwen: fakeLobehubIcon('Qwen'),
    Minimax: fakeLobehubIcon('Minimax'),
    Moonshot: fakeLobehubIcon('Moonshot'),
  }

  // 后端 catalog 实测出现过的 logo_url 形态
  it.each([
    'Qwen.Color',
    'Qwen',
    'Qwen.Text',
    'Moonshot',
    'Minimax.Color',
    'MiniMax.Color', // 后端同一厂商的另一种大小写，数据里两种都有
    'minimax.Color', // 全小写也该命中
  ])('解析 %s 拿到组件，不返回 null', (logo) => {
    expect(pickIconComponent(registry, logo), `${logo} 解析成 null —— 第一层 logo_url 又成死代码了`).not.toBeNull()
  })

  it('未知变体回落到基础图标，而不是 null', () => {
    expect(pickIconComponent(registry, 'Qwen.NotAVariant')).toBe(registry.Qwen)
  })

  it('变体指向非组件属性时回落到基础图标', () => {
    // colorPrimary 是字符串，不能当组件渲染
    expect(pickIconComponent(registry, 'Qwen.colorPrimary')).toBe(registry.Qwen)
  })

  it('注册表里没有的名字返回 null（交由 vendor / 文字兜底）', () => {
    expect(pickIconComponent(registry, 'TotallyUnknown')).toBeNull()
    expect(pickIconComponent(registry, 'TotallyUnknown.Color')).toBeNull()
  })

  it('空值安全', () => {
    expect(pickIconComponent(registry, null)).toBeNull()
    expect(pickIconComponent(registry, undefined)).toBeNull()
    expect(pickIconComponent(registry, '')).toBeNull()
    expect(pickIconComponent(registry, '.Color')).toBeNull()
  })

  it('注册表值为 null/非组件时返回 null，不抛错', () => {
    expect(pickIconComponent({ Broken: null }, 'Broken.Color')).toBeNull()
    expect(pickIconComponent({ Broken: 'not-a-component' }, 'Broken')).toBeNull()
  })
})

describe('resolveVendorKeyFrom', () => {
  const keys = ['openai', 'qwen', 'alibaba', 'aliyun', 'tongyi', 'deepseek', 'anthropic']

  it('精确命中', () => {
    expect(resolveVendorKeyFrom(keys, 'alibaba')).toBe('alibaba')
    expect(resolveVendorKeyFrom(keys, 'ALIBABA')).toBe('alibaba')
  })

  it('包含匹配（"OpenAI GPT-4" 命中 openai）', () => {
    expect(resolveVendorKeyFrom(keys, 'OpenAI GPT-4')).toBe('openai')
  })

  it('未命中返回 null', () => {
    expect(resolveVendorKeyFrom(keys, 'nobody')).toBeNull()
    expect(resolveVendorKeyFrom(keys, null)).toBeNull()
    expect(resolveVendorKeyFrom(keys, '')).toBeNull()
  })
})

describe('#791 回归：阿里系 vendor 收敛', () => {
  // text-embedding-v4 的 vendor 实测就是 "alibaba"
  it.each(['alibaba', 'aliyun', 'tongyi'])('%s 收敛到 qwen', (v) => {
    expect(BRAND_ALIASES[v]).toBe('qwen')
  })

  it('三个写法收敛到同一品牌，避免同品牌重复出图标', () => {
    const brands = ['alibaba', 'aliyun', 'tongyi'].map((v) => BRAND_ALIASES[v] ?? v)
    expect(new Set(brands).size).toBe(1)
  })
})

describe('#818 回归：可灵 / 小米 MiMo vendor 收敛', () => {
  // 可灵 vendor 在 catalog 里有中英两种写法（快手 / kuaishou）
  it.each(['kuaishou', '快手'])('%s 收敛到 kling', (v) => {
    expect(BRAND_ALIASES[v]).toBe('kling')
  })

  it('中文 vendor「快手」可被 resolveVendorKeyFrom 精确命中', () => {
    expect(resolveVendorKeyFrom(['kling', 'kuaishou', '快手'], '快手')).toBe('快手')
  })

  it('mimo 收敛到 xiaomi', () => {
    expect(BRAND_ALIASES['mimo']).toBe('xiaomi')
  })
})
