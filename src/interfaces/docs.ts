export type DocsLang = 'zh' | 'en'

export interface DocsNavItemResponse {
  type: 'page' | 'section'
  slug: string
  title: string
  description?: string
  path?: string
  children?: DocsNavItemResponse[]
}

export interface DocsNavResponse {
  lang: DocsLang
  title: string
  description: string
  items: DocsNavItemResponse[]
}

export interface DocsPageResponse {
  slug: string
  content: string
}
