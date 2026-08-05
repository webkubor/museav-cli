import i18n from '@/i18n'
import { getActiveTheme } from '@/lib/theme'

/**
 * 跨站链接（目前只有文档站）的上下文参数。
 *
 * 控制台与文档站是两套独立部署，用户在控制台选的主题/语言不会自动带过去，只能靠 URL 传递：
 * - `theme=dark|light`：文档站早已支持（见 lib/theme.ts appendThemeParam）
 * - `lang=zh|en`：文档站原来把语言与域名硬绑定（.com 恒中文、.ai 恒英文），
 *   qa#593 改为 `?lang=` → localStorage → 市场兜底 三级，这里负责把控制台当前语言带过去
 *   （shared/modelgo_prd#374：国际站切成中文后文档页仍是英文）
 *
 * 单独成一个函数而不是分两个链式调用：跨站要同步的上下文以后还会增加（如租户/市场），
 * 集中一处比在每个调用点串一串 append* 更不容易漏。
 */
export function appendCrossSiteParams(url: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    u.searchParams.set('theme', getActiveTheme())
    u.searchParams.set('lang', docsLang())
    return u.toString()
  } catch {
    return url
  }
}

/** 控制台 i18n 语言 → 文档站接受的 lang 值（只有 zh|en 两种） */
function docsLang(): 'zh' | 'en' {
  return (i18n.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
