import { useState } from 'react'
import { Spin, Input, Typography } from '@douyinfe/semi-ui'
import { IconSearch } from '@douyinfe/semi-icons'
import { useQuery } from '@tanstack/react-query'
import Anthropic from '@lobehub/icons/es/Anthropic'
import Claude from '@lobehub/icons/es/Claude'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Gemini from '@lobehub/icons/es/Gemini'
import Google from '@lobehub/icons/es/Google'
import DeepSeek from '@lobehub/icons/es/DeepSeek'
import Qwen from '@lobehub/icons/es/Qwen'
import Mistral from '@lobehub/icons/es/Mistral'
import Ollama from '@lobehub/icons/es/Ollama'
import Meta from '@lobehub/icons/es/Meta'
import Moonshot from '@lobehub/icons/es/Moonshot'
import Minimax from '@lobehub/icons/es/Minimax'
import ChatGLM from '@lobehub/icons/es/ChatGLM'
import Cohere from '@lobehub/icons/es/Cohere'
import Groq from '@lobehub/icons/es/Groq'
import Zhipu from '@lobehub/icons/es/Zhipu'
import Baidu from '@lobehub/icons/es/Baidu'
import { listModels, listModelTags } from '@/services/catalog'
import type { CatalogModelItem } from '@/types'

const VENDOR_ICON: Record<string, React.ReactNode> = {
  anthropic: <Anthropic.Color size={28} />,
  claude:    <Claude.Color size={28} />,
  openai:    <OpenAI.Color size={28} />,
  chatgpt:   <OpenAI.Color size={28} />,
  gemini:    <Gemini.Color size={28} />,
  google:    <Google.Color size={28} />,
  deepseek:  <DeepSeek.Color size={28} />,
  qwen:      <Qwen.Color size={28} />,
  mistral:   <Mistral.Color size={28} />,
  ollama:    <Ollama.Color size={28} />,
  meta:      <Meta.Color size={28} />,
  llama:     <Meta.Color size={28} />,
  moonshot:  <Moonshot.Color size={28} />,
  kimi:      <Moonshot.Color size={28} />,
  minimax:   <Minimax.Color size={28} />,
  chatglm:   <ChatGLM.Color size={28} />,
  zhipu:     <Zhipu.Color size={28} />,
  cohere:    <Cohere.Color size={28} />,
  groq:      <Groq.Color size={28} />,
  baidu:     <Baidu.Color size={28} />,
  ernie:     <Baidu.Color size={28} />,
}

const { Text } = Typography

const MODALITY_LABEL: Record<string, string> = {
  text: '文本',
  image: '图像',
  audio: '音频',
  video: '视频',
  embedding: '向量',
  reranker: '重排',
}

function ModalityBadge({ modality }: { modality: string }) {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    text:      { bg: 'var(--semi-color-primary-light-default)', color: 'var(--semi-color-primary)', border: 'var(--semi-color-primary-light-active)' },
    image:     { bg: '#f5f3ff', color: '#7c3aed', border: '#ede9fe' },
    audio:     { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
    video:     { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
    embedding: { bg: '#fef9c3', color: '#ca8a04', border: '#fef08a' },
    reranker:  { bg: 'var(--semi-color-bg-1)', color: 'var(--semi-color-text-1)', border: 'var(--semi-color-fill-0)' },
  }
  const cfg = colors[modality] ?? colors.reranker
  return (
    <span style={{
      fontSize: '11px',
      fontWeight: 600,
      padding: '1px 7px',
      borderRadius: '10px',
      backgroundColor: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      {MODALITY_LABEL[modality] ?? modality}
    </span>
  )
}

function ModelCard({ model }: { model: CatalogModelItem }) {
  const ctxK = model.context_length >= 1000
    ? `${(model.context_length / 1000).toFixed(0)}K`
    : String(model.context_length)

  const priceIn = model.pricing?.input_per_1m
    ? `$${parseFloat(model.pricing.input_per_1m).toFixed(2)}/M`
    : null
  const priceOut = model.pricing?.output_per_1m
    ? `$${parseFloat(model.pricing.output_per_1m).toFixed(2)}/M`
    : null

  return (
    <div style={{
      background: 'var(--semi-color-bg-0)',
      border: '1px solid var(--semi-color-fill-0)',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      cursor: 'default',
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.08)'
        e.currentTarget.style.borderColor = 'var(--semi-color-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = 'var(--semi-color-fill-0)'
      }}
    >
      {/* 头部：Logo + 名称 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {model.logo_url
            ? <img src={model.logo_url} alt={model.vendor} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : (VENDOR_ICON[model.vendor?.toLowerCase() ?? ''] ?? (
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--semi-color-fill-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--semi-color-text-2)' }}>
                {(model.vendor ?? model.display_name).charAt(0).toUpperCase()}
              </div>
            ))
          }
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--semi-color-text-0)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.display_name}
          </div>
          {model.vendor && (
            <div style={{ fontSize: '11.5px', color: 'var(--semi-color-text-2)', marginTop: '1px' }}>{model.vendor}</div>
          )}
        </div>
      </div>

      {/* 模态标签 */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {model.modalities.map((m) => <ModalityBadge key={m} modality={m} />)}
      </div>

      {/* 参数行 */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--semi-color-text-1)' }}>
        <span>上下文 <b style={{ color: 'var(--semi-color-text-0)' }}>{ctxK}</b></span>
        {priceIn && <span>输入 <b style={{ color: 'var(--semi-color-text-0)' }}>{priceIn}</b></span>}
        {priceOut && <span>输出 <b style={{ color: 'var(--semi-color-text-0)' }}>{priceOut}</b></span>}
      </div>
    </div>
  )
}

export default function ModelsPage() {
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const modelsQuery = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ limit: 100 }),
    staleTime: 5 * 60_000,
  })

  const tagsQuery = useQuery({
    queryKey: ['catalog-tags'],
    queryFn: () => listModelTags(),
    staleTime: 10 * 60_000,
  })

  const allModels = modelsQuery.data?.items ?? []
  const tags = tagsQuery.data?.items ?? []

  const filtered = allModels.filter((m) => {
    const matchSearch = !search.trim() ||
      m.display_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.vendor ?? '').toLowerCase().includes(search.toLowerCase()) ||
      m.model_id.toLowerCase().includes(search.toLowerCase())
    const matchTag = !activeTag || m.tags.includes(activeTag)
    return matchSearch && matchTag
  })

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          模型目录
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
          浏览 ModelGo 支持的全部模型，查看上下文长度、价格与可用模态。
        </p>
      </div>

      {/* 搜索栏 */}
      <Input
        placeholder="搜索模型名称、供应商或 ID"
        prefix={<IconSearch style={{ color: 'var(--semi-color-text-2)' }} />}
        value={search}
        onChange={(v) => setSearch(v)}
        style={{ width: '320px', borderRadius: '9999px', border: '1px solid var(--semi-color-border)', marginBottom: '20px' }}
      />

      {/* 标签筛选 */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px' }}>
          <button
            onClick={() => setActiveTag(null)}
            style={{
              padding: '4px 14px',
              borderRadius: '9999px',
              border: `1px solid ${!activeTag ? 'var(--semi-color-text-0)' : 'var(--semi-color-border)'}`,
              background: !activeTag ? 'var(--semi-color-text-0)' : 'transparent',
              color: !activeTag ? 'var(--semi-color-bg-0)' : 'var(--semi-color-text-1)',
              fontSize: '12.5px',
              fontWeight: !activeTag ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            全部
          </button>
          {tags.filter((t) => t.enabled).sort((a, b) => a.sort_order - b.sort_order).map((tag) => (
            <button
              key={tag.code}
              onClick={() => setActiveTag(activeTag === tag.code ? null : tag.code)}
              style={{
                padding: '4px 14px',
                borderRadius: '9999px',
                border: `1px solid ${activeTag === tag.code ? 'var(--semi-color-text-0)' : 'var(--semi-color-border)'}`,
                background: activeTag === tag.code ? 'var(--semi-color-text-0)' : 'transparent',
                color: activeTag === tag.code ? 'var(--semi-color-bg-0)' : 'var(--semi-color-text-1)',
                fontSize: '12.5px',
                fontWeight: activeTag === tag.code ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tag.name_zh || tag.name_en}
            </button>
          ))}
        </div>
      )}

      {/* 模型网格 */}
      {modelsQuery.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <Spin size="large" />
        </div>
      ) : modelsQuery.isError ? (
        <div style={{ color: '#ef4444', fontSize: '13px', padding: '24px 0' }}>加载模型目录失败，请稍后重试。</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>未找到匹配的模型</Text>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
        }}>
          {filtered.map((model) => (
            <ModelCard key={model.model_id} model={model} />
          ))}
        </div>
      )}
    </div>
  )
}
