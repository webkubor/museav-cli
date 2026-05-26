/**
 * 文档站（§十五）
 * 路由：/docs
 * API：GET /docs/:lang、GET /docs/:lang/page/:slug
 */
import { get } from '@/lib/request'
import type {
  DocsLang,
  DocsNavItemResponse,
  DocsNavResponse,
  DocsPageResponse,
} from '@/interfaces/docs'
import type { DocsNavResult, DocsPage } from '@/types'

function normalizeLang(lang?: string): DocsLang {
  return lang?.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

function encodeSlug(slug: string) {
  return encodeURIComponent(slug.replace(/^\/+/, ''))
}

function navItemId(item: DocsNavItemResponse) {
  return item.slug || item.path || item.title
}

function adaptNav(nav: DocsNavResponse): DocsNavResult {
  const rootPages = nav.items
    .filter((item) => item.type === 'page')
    .map((item) => ({
      id: navItemId(item),
      title: item.title,
      slug: item.slug,
    }))

  const sections = nav.items
    .filter((item) => item.type === 'section')
    .map((item) => ({
      id: navItemId(item),
      title: item.title,
      pages: (item.children ?? [])
        .filter((child) => child.type === 'page')
        .map((child) => ({
          id: navItemId(child),
          title: child.title,
          slug: child.slug,
        })),
    }))
    .filter((section) => section.pages.length > 0)

  return {
    sections: rootPages.length
      ? [{ id: `${nav.lang}-overview`, title: nav.title, pages: rootPages }, ...sections]
      : sections,
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

function renderMarkdown(content: string): Pick<DocsPage, 'html' | 'toc'> {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  const toc: DocsPage['toc'] = []
  const paragraph: string[] = []
  let listOpen = false
  let codeOpen = false
  let codeLang = ''

  const closeParagraph = () => {
    if (!paragraph.length) return
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
    paragraph.length = 0
  }

  const closeList = () => {
    if (!listOpen) return
    html.push('</ul>')
    listOpen = false
  }

  lines.forEach((line) => {
    const codeFence = line.match(/^```(\w+)?\s*$/)
    if (codeFence) {
      closeParagraph()
      closeList()
      if (codeOpen) {
        html.push('</code></pre>')
        codeOpen = false
        codeLang = ''
      } else {
        codeOpen = true
        codeLang = codeFence[1] ?? ''
        html.push(`<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''}>`)
      }
      return
    }

    if (codeOpen) {
      html.push(`${escapeHtml(line)}\n`)
      return
    }

    const trimmed = line.trim()
    if (!trimmed) {
      closeParagraph()
      closeList()
      return
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      closeParagraph()
      closeList()
      const level = heading[1].length
      const title = heading[2].trim()
      const id = `heading-${toc.length + 1}`
      toc.push({ id, title, level })
      html.push(`<h${level} id="${id}">${inlineMarkdown(title)}</h${level}>`)
      return
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/)
    if (listItem) {
      closeParagraph()
      if (!listOpen) {
        html.push('<ul>')
        listOpen = true
      }
      html.push(`<li>${inlineMarkdown(listItem[1])}</li>`)
      return
    }

    paragraph.push(trimmed)
  })

  closeParagraph()
  closeList()
  if (codeOpen) html.push('</code></pre>')

  return { html: html.join('\n'), toc }
}

/** 获取文档站导航树 */
export async function getDocsNav(lang?: string) {
  const nav = await get<DocsNavResponse>(`docs/${normalizeLang(lang)}`)
  return adaptNav(nav)
}

/**
 * 获取指定 slug 的文档内容。
 *
 * @param slug - 文档路径，如 'overview' 或 'openai/text'
 */
export async function getDocsPage(slug: string, lang?: string) {
  const page = await get<DocsPageResponse>(`docs/${normalizeLang(lang)}/page/${encodeSlug(slug)}`)
  const rendered = renderMarkdown(page.content)

  return {
    slug: page.slug,
    title: rendered.toc[0]?.title ?? page.slug,
    html: rendered.html,
    toc: rendered.toc,
    code_examples: [],
    updated_at: '',
  } satisfies DocsPage
}
