import type { CatalogModelItem } from '@/types/catalog'

/**
 * 海外(global)模型广场静态兜底数据。
 *
 * 背景:海外 catalog 后端接口暂未到位,为让海外控制台先上线,global 市场下前端不请求
 * `GET /catalog/models`,直接展示这份当下主流的国际模型清单(手工维护)。
 * 接口就绪后:去掉 catalog/index.tsx 里的 isGlobal 门禁即可回到后端数据。
 *
 * 价格 = 每百万 token 美元价(约值,供展示);字段对齐 CatalogModelItem。
 */
const m = (x: Partial<CatalogModelItem> & Pick<CatalogModelItem, 'model_id' | 'display_name' | 'vendor'>): CatalogModelItem => ({
  id: x.model_id,
  provider: x.vendor,
  modalities: ['text'],
  tags: [],
  context_length: 128000,
  max_output_tokens: 16384,
  pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'USD' },
  providers_count: 1,
  released_at: '2026-01-01',
  knowledge_cutoff: '2025-10',
  status: 'active',
  logo_url: '',
  ...x,
})

export const GLOBAL_FALLBACK_MODELS: CatalogModelItem[] = [
  m({
    model_id: 'gpt-5.5', display_name: 'GPT-5.5', vendor: 'openai',
    modalities: ['text', 'image'], tags: ['Flagship', 'Multimodal', 'Reasoning'],
    context_length: 400000, max_output_tokens: 128000,
    pricing: { input_per_1m: '1.25', output_per_1m: '10.00', cache_read_per_1m: '0.13', currency: 'USD' },
    released_at: '2026-03-01', knowledge_cutoff: '2025-10', providers_count: 3,
  }),
  m({
    model_id: 'gpt-5', display_name: 'GPT-5', vendor: 'openai',
    modalities: ['text', 'image'], tags: ['Flagship', 'Multimodal'],
    context_length: 400000, max_output_tokens: 128000,
    pricing: { input_per_1m: '1.10', output_per_1m: '8.00', cache_read_per_1m: '0.10', currency: 'USD' },
    released_at: '2025-08-01', knowledge_cutoff: '2025-06', providers_count: 3,
  }),
  m({
    model_id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', vendor: 'anthropic',
    modalities: ['text', 'image'], tags: ['Flagship', 'Reasoning', 'Coding'],
    context_length: 200000, max_output_tokens: 64000,
    pricing: { input_per_1m: '5.00', output_per_1m: '25.00', cache_read_per_1m: '0.50', currency: 'USD' },
    released_at: '2026-05-01', knowledge_cutoff: '2026-01', providers_count: 2,
  }),
  m({
    model_id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', vendor: 'anthropic',
    modalities: ['text', 'image'], tags: ['Balanced', 'Coding', 'Multimodal'],
    context_length: 200000, max_output_tokens: 64000,
    pricing: { input_per_1m: '3.00', output_per_1m: '15.00', cache_read_per_1m: '0.30', currency: 'USD' },
    released_at: '2026-02-01', knowledge_cutoff: '2025-10', providers_count: 2,
  }),
  m({
    model_id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', vendor: 'anthropic',
    modalities: ['text', 'image'], tags: ['Fast', 'Cost-effective'],
    context_length: 200000, max_output_tokens: 32000,
    pricing: { input_per_1m: '1.00', output_per_1m: '5.00', cache_read_per_1m: '0.10', currency: 'USD' },
    released_at: '2025-10-01', knowledge_cutoff: '2025-06', providers_count: 2,
  }),
  m({
    model_id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', vendor: 'google',
    modalities: ['text', 'image', 'audio'], tags: ['Flagship', 'Multimodal', 'Long-context'],
    context_length: 1000000, max_output_tokens: 65536,
    pricing: { input_per_1m: '1.25', output_per_1m: '10.00', cache_read_per_1m: '0.31', currency: 'USD' },
    released_at: '2025-06-01', knowledge_cutoff: '2025-01', providers_count: 1,
  }),
  m({
    model_id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', vendor: 'google',
    modalities: ['text', 'image', 'audio'], tags: ['Fast', 'Cost-effective', 'Long-context'],
    context_length: 1000000, max_output_tokens: 65536,
    pricing: { input_per_1m: '0.30', output_per_1m: '2.50', cache_read_per_1m: '0.075', currency: 'USD' },
    released_at: '2025-06-01', knowledge_cutoff: '2025-01', providers_count: 1,
  }),
  m({
    model_id: 'llama-4-maverick', display_name: 'Llama 4 Maverick', vendor: 'meta',
    modalities: ['text', 'image'], tags: ['Open-source', 'Multimodal'],
    context_length: 1000000, max_output_tokens: 16384,
    pricing: { input_per_1m: '0.20', output_per_1m: '0.60', cache_read_per_1m: '0.05', currency: 'USD' },
    released_at: '2025-04-01', knowledge_cutoff: '2024-12', providers_count: 4,
  }),
  m({
    model_id: 'mistral-large-2', display_name: 'Mistral Large 2', vendor: 'mistral',
    modalities: ['text'], tags: ['Coding', 'Multilingual'],
    context_length: 128000, max_output_tokens: 32000,
    pricing: { input_per_1m: '2.00', output_per_1m: '6.00', cache_read_per_1m: '0.50', currency: 'USD' },
    released_at: '2025-07-01', knowledge_cutoff: '2024-10', providers_count: 2,
  }),
  m({
    model_id: 'grok-4', display_name: 'Grok 4', vendor: 'xai',
    modalities: ['text', 'image'], tags: ['Flagship', 'Reasoning', 'Realtime'],
    context_length: 256000, max_output_tokens: 64000,
    pricing: { input_per_1m: '3.00', output_per_1m: '15.00', cache_read_per_1m: '0.75', currency: 'USD' },
    released_at: '2025-07-01', knowledge_cutoff: '2025-04', providers_count: 1,
  }),
  m({
    model_id: 'deepseek-v3', display_name: 'DeepSeek-V3', vendor: 'deepseek',
    modalities: ['text'], tags: ['Open-source', 'Cost-effective', 'Reasoning'],
    context_length: 128000, max_output_tokens: 16384,
    pricing: { input_per_1m: '0.27', output_per_1m: '1.10', cache_read_per_1m: '0.07', currency: 'USD' },
    released_at: '2025-12-01', knowledge_cutoff: '2025-07', providers_count: 3,
  }),
]
