/**
 * API Keys · 标准协议接入横栏
 * 复制对应 Base URL 即可复用现有 SDK。半透明白底协议项 + 文档入口。
 * PRD 2026-07-10（modelgo_prd design-qa.md / api-key-protocol-surface-design）。
 */
import { LuArrowUpRight, LuCodeXml, LuFileText } from 'react-icons/lu'

import { CopyButton } from '@/components/ui/CopyButton'

interface Props {
  openAIBaseUrl: string
  anthropicBaseUrl: string
  docsUrl: string
}

export function ApiKeyProtocolBanner({ openAIBaseUrl, anthropicBaseUrl, docsUrl }: Props) {
  const endpoints = [
    { label: 'OpenAI', value: openAIBaseUrl, copyLabel: '复制 OpenAI 地址' },
    { label: 'Anthropic', value: anthropicBaseUrl, copyLabel: '复制 Anthropic 地址' },
  ].filter((e) => e.value)

  return (
    <section
      aria-label="标准协议接入"
      className="grid min-h-[62px] grid-cols-1 items-center gap-3 rounded-lg border border-brand-base/15 bg-brand-base/8 px-3.5 py-2.5 md:grid-cols-2 xl:grid-cols-[minmax(200px,0.9fr)_minmax(220px,1fr)_minmax(220px,1fr)_auto]"
    >
      <div className="flex min-w-0 items-center gap-2.5 md:col-span-2 xl:col-span-1">
        <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-brand-base/10 text-brand-base">
          <LuCodeXml size={19} />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <strong className="text-[13px] font-bold text-mg-text-1">使用标准协议接入</strong>
          <span className="text-[11px] font-semibold leading-snug text-mg-text-3">
            复制对应 Base URL，即可复用现有 SDK
          </span>
        </div>
      </div>

      {endpoints.map((endpoint) => (
        <div
          key={endpoint.label}
          className="grid min-h-[38px] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-mg-border bg-mg-bg-0/70 px-2.5 shadow-[0_3px_10px_rgba(72,103,166,0.06)]"
        >
          <span className="whitespace-nowrap text-xs font-bold text-mg-text-1">{endpoint.label}</span>
          <code className="min-w-0 font-mono text-xs text-mg-text-2 [overflow-wrap:anywhere]">
            {endpoint.value}
          </code>
          <CopyButton value={endpoint.value} aria-label={endpoint.copyLabel} />
        </div>
      ))}

      <a
        className="inline-flex min-h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-mg-border bg-mg-bg-0 px-2.5 text-xs font-bold text-mg-text-2 transition-colors hover:border-brand-base/35 hover:bg-brand-base/5 md:col-span-2 md:justify-self-start xl:col-span-1 xl:justify-self-auto"
        href={docsUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <LuFileText size={15} />
        查看 API 文档
        <LuArrowUpRight size={14} />
      </a>
    </section>
  )
}
