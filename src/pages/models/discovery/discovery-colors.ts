/** 模型发现图表的厂牌取色。 */
import { useCallback } from 'react'
import { brandColor } from '@model-go/icons'
import { useActiveTheme } from '@/hooks/use-active-theme'

/* 原型的 providerMarks（42 条厂牌首字母）已删除 —— 模型/厂牌标识改走 ModelIcon，
   见下面 DiscoveryModelIcon 的说明。下面这张色表还留着，只用于图表着色（趋势柱、
   散点点色与图例），不再参与图标渲染。
   ⚠️ 它同样是硬编码的厂牌色，而 @model-go/icons 导出了 brandColor(vendor, theme)
   ——  库里那份还按深浅双轴分了档（深蓝深紫在深底压不住、亮黄亮青在浅底压不住）。
   图表配色换过去是下一步，属独立改动，不混在图标这一刀里。 */
/**
 * 图表用的厂牌主色，走私包 `@model-go/icons` 的 `brandColor(vendor, theme)`。
 *
 * 这里原本硬编码了 32 个厂牌色值。私包才是厂牌色的真源，而且它按**深浅双轴各配一个
 * 生效值**（深蓝深紫在深底压不住、亮黄亮青在浅底压不住），硬编码那份只有一个值，
 * 暗色主题下必然有一批压不住。
 *
 * ⚠️ **`brandColor` 返回 null 不是「查不到」，是「这个厂牌是单色标识」**——
 * OpenAI、Z AI、Moonshot 这类 logo 本身就是黑白的，库刻意不给色值，让它跟随主题
 * （原先硬编码表里给它们填的正是 #111827 近黑）。所以回落值必须是**跟随主题的中性色**，
 * 不能回落到品牌色：那会让所有单色厂牌在图上变成同一片品牌蓝，还和图表主色撞色。
 *
 * 实测 TEXT_CHAT 的 59 家厂商里 24 家有专属品牌色，其余走中性色。
 */
export function useProviderColor(fallback = 'var(--mg-text-2)') {
  const theme = useActiveTheme()
  return useCallback(
    (provider: string) => brandColor(provider, theme) ?? fallback,
    [fallback, theme],
  )
}

  /**
   * 专项排行柱子的取色：同一套 brandColor，但**回落色不同**。
   *
   * 散点/图例是小圆点，无品牌色时回落浅灰(--mg-text-2)没问题；柱子是大色块且
   * 柱内压着白色数值标签，暗色主题下 --mg-text-2 是 rgb(212,212,216)，白字直接
   * 消失。所以这里回落到品牌色——即 2026-09-03 之前四张榜的统一色。
   */
