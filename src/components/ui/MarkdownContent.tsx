/**
 * 全站统一的 Markdown 渲染出口（模型体验 / 平台助手聊天 / 调用日志三处共用）。
 *
 * 存在原因：react-markdown 默认只吃 CommonMark，**表格/删除线/任务列表属于 GFM 扩展**，
 * 不挂 remark-gfm 的话模型回复里的 `| 表头 | ... |` 会被当成普通段落，整张表摊平成
 * 一行竖线文本（2026-07-30 实测：模型回答"OpenAI 协议有哪些接口"的接口对照表全废）。
 * 之前三处各自 `<Markdown>{content}</Markdown>`，插件漏挂就会漏三遍——收敛到这一个出口。
 *
 * 表格外面套 .cs-markdown-table-wrap 做横向滚动：模型输出的表格列数不可控，
 * 不兜住会把消息气泡直接撑破（样式见 styles/effects.css）。
 */
import Markdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

type MarkdownNode = {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
  position?: { start: { offset?: number }; end: { offset?: number } }
  [key: string]: unknown
}

type RemarkPlugin = NonNullable<Options['remarkPlugins']>[number]

/** 只把 GFM 自动识别的裸 URL / 邮箱还原成文本，保留显式 Markdown 链接和其他 GFM 语法。 */
const remarkKeepBareAutolinksAsText = (() =>
  (tree: MarkdownNode, file: { value: unknown }) => {
    const source = String(file.value)

    const transform = (node: MarkdownNode): MarkdownNode => {
      const children = node.children?.map(transform)
      const nextNode = children ? { ...node, children } : node
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      const visibleText = node.children?.length === 1 ? node.children[0]?.value : undefined

      if (
        node.type === 'link' &&
        visibleText &&
        start !== undefined &&
        end !== undefined &&
        source.slice(start, end) === visibleText
      ) {
        return { type: 'text', value: visibleText, position: node.position }
      }

      return nextNode
    }

    return transform(tree)
  }) as RemarkPlugin

const BASE_COMPONENTS: Components = {
  table: ({ children, ...props }) => (
    <div className="cs-markdown-table-wrap">
      <table {...props}>{children}</table>
    </div>
  ),
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
}

export function MarkdownContent({
  children,
  className,
  components,
}: {
  /** 原始 markdown 文本 */
  children: string
  /** 额外类名，叠加在 .cs-markdown 之上 */
  className?: string
  /** 调用方可覆盖/追加节点渲染（如模型体验把 a 换成走 SPA 导航的 MessageLink） */
  components?: Components
}) {
  return (
    <div className={cn('cs-markdown', className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkKeepBareAutolinksAsText]}
        components={{ ...BASE_COMPONENTS, ...components }}
      >
        {children}
      </Markdown>
    </div>
  )
}

export default MarkdownContent
