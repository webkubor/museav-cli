/**
 * 全站统一的 Markdown 渲染出口（模型体验 / 客服聊天 / 调用日志三处共用）。
 *
 * 存在原因：react-markdown 默认只吃 CommonMark，**表格/删除线/任务列表属于 GFM 扩展**，
 * 不挂 remark-gfm 的话模型回复里的 `| 表头 | ... |` 会被当成普通段落，整张表摊平成
 * 一行竖线文本（2026-07-30 实测：模型回答"OpenAI 协议有哪些接口"的接口对照表全废）。
 * 之前三处各自 `<Markdown>{content}</Markdown>`，插件漏挂就会漏三遍——收敛到这一个出口。
 *
 * 表格外面套 .cs-markdown-table-wrap 做横向滚动：模型输出的表格列数不可控，
 * 不兜住会把消息气泡直接撑破（样式见 styles/effects.css）。
 */
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

const BASE_COMPONENTS: Components = {
  table: ({ children, ...props }) => (
    <div className="cs-markdown-table-wrap">
      <table {...props}>{children}</table>
    </div>
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
      <Markdown remarkPlugins={[remarkGfm]} components={{ ...BASE_COMPONENTS, ...components }}>
        {children}
      </Markdown>
    </div>
  )
}

export default MarkdownContent
