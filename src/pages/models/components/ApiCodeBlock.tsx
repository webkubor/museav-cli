/**
 * 带行号的 API 示例代码块（ApiQuickCallModal 用；原详情页 ApiAccessPanel 已随详情页拆到官网，prd#1272）。
 *
 * 行号走 CSS counter 的 ::before（见 api-quick-call-modal.css）——伪元素
 * 不进选区，手动框选或复制按钮拿到的都是纯代码，不会混入行号。
 */
export function ApiCodeBlock({ code }: { code: string }) {
  return (
    <pre className="api-quick-call-code-pre">
      <code className="api-code-lines">
        {code.split('\n').map((line, i) => (
          // 空行给一个空格占位，否则 display:block 的空 span 高度塌掉，行号对不齐
          <span key={i} className="api-code-line">{line || ' '}</span>
        ))}
      </code>
    </pre>
  )
}
