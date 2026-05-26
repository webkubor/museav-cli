import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'

// ── 海外模型（global 市场） ─────────────────────────────────────
const GLOBAL_MODELS = [
  {
    id: '01HV3KGPT4O000000000000001',
    name: 'GPT-4o',
    provider: 'OpenAI',
    context_length: 128000,
    input_price: '0.000005000000',
    output_price: '0.000015000000',
    description: 'Most capable GPT-4 model with vision and multimodal capabilities.',
    tags: ['text', 'image', 'vision', 'code'],
    status: 'available',
    use_cases: ['Complex reasoning', 'Code generation', 'Image analysis', 'Document parsing'],
    providers: [
      {
        name: 'OpenAI Direct',
        status: 'online',
        data_retention: '30 days',
        privacy_url: 'https://openai.com/privacy',
      },
      {
        name: 'Azure OpenAI',
        status: 'online',
        data_retention: '0 days (zero retention)',
        privacy_url: 'https://azure.microsoft.com/privacy',
      },
    ],
  },
  {
    id: '01HV3KGPT4M000000000000002',
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    context_length: 128000,
    input_price: '0.000000150000',
    output_price: '0.000000600000',
    description: 'Affordable small model for lightweight tasks.',
    tags: ['text'],
    status: 'available',
    use_cases: ['Summarization', 'Classification', 'Simple Q&A'],
    providers: [{ name: 'OpenAI Direct', status: 'online', data_retention: '30 days' }],
  },
  {
    id: '01HV3KCLS37S000000000000003',
    name: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    context_length: 200000,
    input_price: '0.000003000000',
    output_price: '0.000015000000',
    description: 'Most intelligent Claude model with extended thinking.',
    tags: ['text', 'reasoning', 'long-context', 'code'],
    status: 'available',
    use_cases: ['Deep analysis', 'Long-document processing', 'Research', 'Complex coding'],
    providers: [
      { name: 'Anthropic Direct', status: 'online', data_retention: '0 days' },
      { name: 'AWS Bedrock', status: 'online', data_retention: '0 days' },
    ],
  },
  {
    id: '01HV3KCLS35H000000000000004',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    context_length: 200000,
    input_price: '0.000000800000',
    output_price: '0.000004000000',
    description: 'Fast, compact Claude model for high-throughput tasks.',
    tags: ['text'],
    status: 'available',
    use_cases: ['Customer support', 'Real-time chat', 'Data extraction'],
    providers: [{ name: 'Anthropic Direct', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01HV3KGEMF2F000000000000005',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    context_length: 1048576,
    input_price: '0.000000100000',
    output_price: '0.000000400000',
    description: "Google's fastest multimodal model with 1M context window.",
    tags: ['text', 'image', 'vision', 'long-context'],
    status: 'available',
    use_cases: ['Real-time applications', 'Multimodal input', 'Long-context retrieval'],
    providers: [
      { name: 'Google AI Studio', status: 'online', data_retention: '0 days' },
      { name: 'Vertex AI', status: 'online', data_retention: '0 days' },
    ],
  },
  {
    id: '01HV3KGEMF1P000000000000006',
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    context_length: 2097152,
    input_price: '0.000001250000',
    output_price: '0.000005000000',
    description: 'Powerful model with 2M token context for complex workloads.',
    tags: ['text', 'image'],
    status: 'available',
    use_cases: ['Video analysis', 'Very long documents', 'Multi-turn research'],
    providers: [{ name: 'Google AI Studio', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01HV3KDPSK000000000000007',
    name: 'DeepSeek-V3',
    provider: 'DeepSeek',
    context_length: 128000,
    input_price: '0.000000140000',
    output_price: '0.000000280000',
    description: 'State-of-the-art open-source MoE model, best price-performance.',
    tags: ['text', 'code', 'reasoning', 'zero-data-retention'],
    status: 'available',
    use_cases: ['Code completion', 'Math reasoning', 'Instruction following'],
    providers: [{ name: 'DeepSeek Direct', status: 'online', data_retention: '30 days' }],
  },
  {
    id: '01HV3KDPSKR1000000000000008',
    name: 'DeepSeek-R1',
    provider: 'DeepSeek',
    context_length: 64000,
    input_price: '0.000000550000',
    output_price: '0.000002190000',
    description: 'Reasoning model with transparent chain-of-thought output.',
    tags: ['text', 'reasoning'],
    status: 'available',
    use_cases: ['Math competition', 'Scientific reasoning', 'Step-by-step analysis'],
    providers: [
      { name: 'DeepSeek Direct', status: 'online', data_retention: '30 days' },
      { name: 'Fireworks AI', status: 'degraded', data_retention: '7 days' },
    ],
  },
  {
    id: '01HV3KQWEN72000000000000009',
    name: 'Qwen2.5-72B',
    provider: 'Alibaba',
    context_length: 131072,
    input_price: '0.000000500000',
    output_price: '0.000001000000',
    description: "Alibaba's flagship open model with strong multilingual performance.",
    tags: ['text'],
    status: 'available',
    use_cases: ['Chinese NLP', 'Multilingual tasks', 'Code generation'],
    providers: [{ name: 'Alibaba Cloud', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01HV3KTXTEMB000000000000010',
    name: 'text-embedding-3-large',
    provider: 'OpenAI',
    context_length: 8191,
    input_price: '0.000000130000',
    output_price: '0.000000000000',
    description: "OpenAI's highest capability embedding model for semantic search.",
    tags: ['embeddings'],
    status: 'available',
    use_cases: ['Semantic search', 'RAG pipelines', 'Clustering', 'Classification'],
    providers: [{ name: 'OpenAI Direct', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01HV3KTXTEMB000000000000011',
    name: 'text-embedding-3-small',
    provider: 'OpenAI',
    context_length: 8191,
    input_price: '0.000000020000',
    output_price: '0.000000000000',
    description: 'Efficient embedding model with great cost-performance ratio.',
    tags: ['embeddings'],
    status: 'available',
    use_cases: ['High-volume embeddings', 'Real-time retrieval'],
    providers: [{ name: 'OpenAI Direct', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01HV3KFLX00000000000000012',
    name: 'FLUX.1 [schnell]',
    provider: 'Black Forest Labs',
    context_length: 0,
    input_price: '0.000300000000',
    output_price: '0.000000000000',
    description: 'Ultra-fast 4-step image generation model.',
    tags: ['image'],
    status: 'available',
    use_cases: ['Rapid prototyping', 'Real-time image generation', 'Creative tools'],
    providers: [
      { name: 'Replicate', status: 'online', data_retention: '7 days' },
      { name: 'Together AI', status: 'online', data_retention: '0 days' },
    ],
  },
  {
    id: '01HV3KFLX00000000000000013',
    name: 'DALL-E 3',
    provider: 'OpenAI',
    context_length: 0,
    input_price: '0.004000000000',
    output_price: '0.000000000000',
    description: 'High-quality text-to-image generation with precise prompt following.',
    tags: ['image'],
    status: 'available',
    use_cases: ['Marketing visuals', 'Creative content', 'Concept illustration'],
    providers: [{ name: 'OpenAI Direct', status: 'online', data_retention: '30 days' }],
  },
  {
    id: '01HV3KLLAMA000000000000014',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    context_length: 128000,
    input_price: '0.000000590000',
    output_price: '0.000000790000',
    description: "Meta's best open-source instruction model at 70B scale.",
    tags: ['text'],
    status: 'available',
    use_cases: ['Open-source deployment', 'Fine-tuning base', 'General tasks'],
    providers: [
      { name: 'Groq', status: 'online', data_retention: '0 days' },
      { name: 'Together AI', status: 'online', data_retention: '0 days' },
      { name: 'Fireworks AI', status: 'online', data_retention: '7 days' },
    ],
  },
  {
    id: '01HV3KMIST000000000000015',
    name: 'Mistral Large 2',
    provider: 'Mistral AI',
    context_length: 131072,
    input_price: '0.000002000000',
    output_price: '0.000006000000',
    description: "Mistral's flagship model with strong coding and reasoning.",
    tags: ['text'],
    status: 'unavailable',
    use_cases: ['European compliance', 'Code generation', 'Multilingual tasks'],
    providers: [{ name: 'Mistral Direct', status: 'offline', data_retention: '0 days' }],
  },
]

// ── 国内模型（domestic 市场，仅国产大模型） ──────────────────────
const DOMESTIC_MODELS = [
  {
    id: '01CN3KDPSK000000000000001',
    name: 'DeepSeek-V3',
    provider: 'DeepSeek',
    context_length: 128000,
    input_price: '0.000000019400',
    output_price: '0.000000038900',
    description: '深度求索旗舰 MoE 模型，代码与推理双强，性价比领跑行业。',
    tags: ['text'],
    status: 'available',
    use_cases: ['代码补全', '数学推理', '指令跟随', '长文档分析'],
    providers: [{ name: 'DeepSeek 官方', status: 'online', data_retention: '30 days' }],
  },
  {
    id: '01CN3KDPSKR1000000000000002',
    name: 'DeepSeek-R1',
    provider: 'DeepSeek',
    context_length: 64000,
    input_price: '0.000000076400',
    output_price: '0.000000305600',
    description: '深度求索推理模型，可见思维链，数学竞赛与科学推断首选。',
    tags: ['text'],
    status: 'available',
    use_cases: ['数学竞赛', '科学推导', '逐步分析', '复杂逻辑'],
    providers: [{ name: 'DeepSeek 官方', status: 'online', data_retention: '30 days' }],
  },
  {
    id: '01CN3KQWEN72000000000000003',
    name: 'Qwen2.5-72B-Instruct',
    provider: 'Alibaba',
    context_length: 131072,
    input_price: '0.000000097200',
    output_price: '0.000000097200',
    description: '通义千问旗舰开源模型，中英双语强，长文本处理出众。',
    tags: ['text'],
    status: 'available',
    use_cases: ['中文 NLP', '多语言任务', '代码生成', '文档理解'],
    providers: [{ name: '阿里云百炼', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KQWENCODE000000000004',
    name: 'Qwen2.5-Coder-32B',
    provider: 'Alibaba',
    context_length: 131072,
    input_price: '0.000000027800',
    output_price: '0.000000027800',
    description: '千问代码专属模型，代码补全与 Bug 修复能力媲美 GPT-4o。',
    tags: ['text'],
    status: 'available',
    use_cases: ['代码补全', 'Bug 修复', '单元测试生成', '代码解释'],
    providers: [{ name: '阿里云百炼', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KGLM4000000000000005',
    name: 'GLM-4-Plus',
    provider: 'Zhipu',
    context_length: 128000,
    input_price: '0.000000138900',
    output_price: '0.000000138900',
    description: '智谱旗舰对话模型，长上下文理解与中文创作能力突出。',
    tags: ['text'],
    status: 'available',
    use_cases: ['长文本对话', '中文写作', '知识问答', '角色扮演'],
    providers: [{ name: '智谱 AI 开放平台', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KGLM4FLASH0000000006',
    name: 'GLM-4-Flash',
    provider: 'Zhipu',
    context_length: 128000,
    input_price: '0.000000000000',
    output_price: '0.000000000000',
    description: '智谱免费轻量模型，高并发场景首选，响应速度极快。',
    tags: ['text'],
    status: 'available',
    use_cases: ['高并发应用', '实时对话', '简单问答', '内容分类'],
    providers: [{ name: '智谱 AI 开放平台', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KKIMI000000000000007',
    name: 'Moonshot-v1-128k',
    provider: 'Moonshot',
    context_length: 128000,
    input_price: '0.000000138900',
    output_price: '0.000000138900',
    description: 'Kimi 超长上下文旗舰模型，128k 窗口处理整本书无压力。',
    tags: ['text'],
    status: 'available',
    use_cases: ['超长文档问答', '合同审核', '代码库分析', '多轮研究'],
    providers: [{ name: 'Moonshot AI', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KDOUBAO000000000000008',
    name: 'Doubao-pro-32k',
    provider: 'ByteDance',
    context_length: 32000,
    input_price: '0.000000013900',
    output_price: '0.000000013900',
    description: '字节跳动豆包旗舰版，综合效果优秀，价格极具竞争力。',
    tags: ['text'],
    status: 'available',
    use_cases: ['内容生成', '智能客服', '数据提取', '摘要生成'],
    providers: [{ name: '火山方舟', status: 'online', data_retention: '30 days' }],
  },
  {
    id: '01CN3KHUNYUAN00000000000009',
    name: 'Hunyuan-Turbo',
    provider: 'Tencent',
    context_length: 256000,
    input_price: '0.000000208300',
    output_price: '0.000000208300',
    description: '腾讯混元高速版，256k 超长上下文，多模态能力全面。',
    tags: ['text', 'image'],
    status: 'available',
    use_cases: ['企业知识库', '多模态理解', '长文档处理', '中文创作'],
    providers: [{ name: '腾讯云', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KMINIMAX00000000000010',
    name: 'MiniMax-Text-01',
    provider: 'MiniMax',
    context_length: 1000000,
    input_price: '0.000000027800',
    output_price: '0.000000027800',
    description: 'MiniMax 百万 Token 超长上下文模型，处理整部小说无需分块。',
    tags: ['text'],
    status: 'available',
    use_cases: ['超长文档', '全文检索', '书籍问答', '代码仓库分析'],
    providers: [{ name: 'MiniMax 开放平台', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KSTEPFUN00000000000011',
    name: 'Step-2-16K',
    provider: 'Stepfun',
    context_length: 16000,
    input_price: '0.000000347200',
    output_price: '0.000000347200',
    description: '阶跃星辰多模态旗舰，视觉与语言双栈融合，推理能力突出。',
    tags: ['text', 'image'],
    status: 'available',
    use_cases: ['图文理解', '复杂推理', '多模态问答', '图表解析'],
    providers: [{ name: '阶跃星辰', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KSPARK000000000000012',
    name: 'Spark-Max',
    provider: 'iFlytek',
    context_length: 128000,
    input_price: '0.000000277800',
    output_price: '0.000000277800',
    description: '科大讯飞星火旗舰版，语音理解与中文任务表现卓越。',
    tags: ['text'],
    status: 'available',
    use_cases: ['语音转文字', '中文问答', '教育辅助', '行业垂直应用'],
    providers: [{ name: '讯飞开放平台', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KEMBALI000000000000013',
    name: 'text-embedding-v3',
    provider: 'Alibaba',
    context_length: 8192,
    input_price: '0.000000006900',
    output_price: '0.000000000000',
    description: '阿里云第三代向量模型，支持中英双语，RAG 检索首选。',
    tags: ['embeddings'],
    status: 'available',
    use_cases: ['语义检索', 'RAG 管道', '文本聚类', '相似度计算'],
    providers: [{ name: '阿里云百炼', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KEMBZHIPU0000000000014',
    name: 'Embedding-3',
    provider: 'Zhipu',
    context_length: 8192,
    input_price: '0.000000006900',
    output_price: '0.000000000000',
    description: '智谱第三代向量模型，中文语义捕捉精准，低延迟。',
    tags: ['embeddings'],
    status: 'available',
    use_cases: ['中文语义搜索', '知识库召回', '文档去重', '推荐系统'],
    providers: [{ name: '智谱 AI 开放平台', status: 'online', data_retention: '0 days' }],
  },
  {
    id: '01CN3KWANX000000000000015',
    name: 'Wan2.1-T2V',
    provider: 'Alibaba',
    context_length: 0,
    input_price: '0.000560000000',
    output_price: '0.000000000000',
    description: '阿里万象文生视频模型，5 秒高清视频，动作流畅自然。',
    tags: ['image'],
    status: 'available',
    use_cases: ['短视频生成', '广告创意', '产品展示', '内容创作'],
    providers: [{ name: '阿里云百炼', status: 'online', data_retention: '0 days' }],
  },
]

const ALL_MODELS = [...GLOBAL_MODELS, ...DOMESTIC_MODELS]

const MODALITY_TAGS = new Set(['text', 'image', 'embeddings', 'embedding'])

function toApiModel(m: (typeof ALL_MODELS)[number]) {
  const vendor = m.provider.toLowerCase().replace(/\s+/g, '-')
  const modelId = `${vendor}/${m.name.toLowerCase().replace(/\s+/g, '-')}`
  const inputPer1m = (parseFloat(m.input_price) * 1_000_000).toFixed(6)
  const outputPer1m = (parseFloat(m.output_price) * 1_000_000).toFixed(6)
  const modalities = m.tags
    .filter((t) => MODALITY_TAGS.has(t))
    .map((t) => (t === 'embeddings' ? 'embedding' : t))
  const capabilityTags = m.tags.filter((t) => !MODALITY_TAGS.has(t))
  return {
    id: m.id,
    model_id: modelId,
    name: m.name,
    display_name: m.name,
    provider: m.provider,
    vendor,
    modalities,
    tags: capabilityTags,
    context_length: m.context_length,
    max_output_tokens: 0,
    pricing: {
      input_per_1m: inputPer1m,
      output_per_1m: outputPer1m,
      cache_read_per_1m: '0',
      currency: 'USD',
    },
    description: m.description,
    providers_count: m.providers.length,
    released_at: '',
    knowledge_cutoff: '',
    monthly_tokens: '',
    zero_data_retention: m.providers.some((p) => p.data_retention === '0 days'),
    in_region_routing: false,
    status: m.status,
    logo_url: '',
  }
}

const now = new Date().toISOString()

const MODEL_TAGS = [
  // ── modality 分组 ──────────────────────────────
  {
    id: 'tag-modality-text',
    code: 'text',
    group_code: 'modality',
    name_zh: '文本',
    name_en: 'Text',
    enabled: true,
    sort_order: 10,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'tag-modality-image',
    code: 'image',
    group_code: 'modality',
    name_zh: '图像',
    name_en: 'Image',
    enabled: true,
    sort_order: 20,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'tag-modality-embedding',
    code: 'embedding',
    group_code: 'modality',
    name_zh: '嵌入',
    name_en: 'Embedding',
    enabled: true,
    sort_order: 30,
    created_at: now,
    updated_at: now,
  },
  // ── capability 分组 ────────────────────────────
  {
    id: 'tag-cap-reasoning',
    code: 'reasoning',
    group_code: 'capability',
    name_zh: '推理',
    name_en: 'Reasoning',
    enabled: true,
    sort_order: 10,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'tag-cap-vision',
    code: 'vision',
    group_code: 'capability',
    name_zh: '视觉',
    name_en: 'Vision',
    enabled: true,
    sort_order: 20,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'tag-cap-code',
    code: 'code',
    group_code: 'capability',
    name_zh: '代码',
    name_en: 'Code',
    enabled: true,
    sort_order: 30,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'tag-cap-long-context',
    code: 'long-context',
    group_code: 'capability',
    name_zh: '长上下文',
    name_en: 'Long Context',
    enabled: true,
    sort_order: 40,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'tag-cap-zero-data',
    code: 'zero-data-retention',
    group_code: 'capability',
    name_zh: '零数据留存',
    name_en: 'Zero Data Retention',
    enabled: true,
    sort_order: 50,
    created_at: now,
    updated_at: now,
  },
]

const PREFIX = '/api/v1'

export const modelsHandlers = [
  http.get(`${PREFIX}/catalog/model-tags`, ({ request }) => {
    const enabled = new URL(request.url).searchParams.get('enabled')
    const items =
      enabled === null ? MODEL_TAGS : MODEL_TAGS.filter((tag) => String(tag.enabled) === enabled)

    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: { items, total: items.length },
      request_id: uuid(),
    })
  }),

  http.get(`${PREFIX}/catalog/models`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const capability = url.searchParams.get('capability')
    const modality = url.searchParams.get('modality')
    const provider = url.searchParams.get('provider')
    const market = request.headers.get('X-Market') ?? 'global'

    let results = market === 'domestic' ? [...DOMESTIC_MODELS] : [...GLOBAL_MODELS]
    if (q)
      results = results.filter(
        (m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)
      )
    if (capability) results = results.filter((m) => m.tags.includes(capability))
    if (modality) results = results.filter((m) => m.tags.includes(modality))
    if (provider) results = results.filter((m) => m.provider === provider)

    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: {
        items: results.map(toApiModel),
        page_size: results.length,
        has_more: false,
        next_cursor: null,
      },
      request_id: uuid(),
    })
  }),

  http.get(`${PREFIX}/catalog/models/:vendor/:modelName/providers`, ({ params }) => {
    const modelId = `${params.vendor}/${params.modelName}`
    const model = ALL_MODELS.find((m) => toApiModel(m).model_id === modelId)
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: {
        items: (model?.providers ?? []).map((provider, index) => ({
          provider_id: `${modelId}-${index}`,
          provider_name: provider.name,
          provider_type: provider.name.toLowerCase().replace(/\s+/g, '-'),
          status: provider.status,
          input_price: model?.input_price ?? '0',
          output_price: model?.output_price ?? '0',
          currency: 'USD',
          zero_data_retention: provider.data_retention === '0 days',
          in_region_routing: true,
          latency_p50_ms: 280 + index * 40,
          uptime_7d: 99.9 - index * 0.1,
        })),
        next_cursor: null,
        total: model?.providers.length ?? 0,
      },
      request_id: uuid(),
    })
  }),

  http.get(`${PREFIX}/catalog/models/:vendor/:modelName`, ({ params }) => {
    const modelId = `${params.vendor}/${params.modelName}`
    const model = ALL_MODELS.find((m) => toApiModel(m).model_id === modelId)
    if (!model) {
      return HttpResponse.json(
        { code: 40400, msg: 'Model not found', data: null, request_id: uuid() },
        { status: 404 }
      )
    }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: toApiModel(model),
      request_id: uuid(),
    })
  }),

  http.get(`${PREFIX}/catalog/providers`, () => {
    const providers = Array.from(new Set(ALL_MODELS.map((model) => model.provider))).map(
      (provider, index) => ({
        provider_id: provider.toLowerCase(),
        name: provider,
        type: provider.toLowerCase(),
        logo_url: '',
        status: 'online',
        model_count: ALL_MODELS.filter((model) => model.provider === provider).length,
        daily_tokens: 1_000_000 + index * 250_000,
        uptime_7d: 99.9,
        zero_data_retention: index % 2 === 0,
        in_region_routing: true,
      })
    )
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: { items: providers, next_cursor: null, total: providers.length },
      request_id: uuid(),
    })
  }),

  http.get(`${PREFIX}/catalog/pricing/plans`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        plans: [
          {
            plan_id: 'free',
            name: 'Free',
            monthly_fee: { amount: '0.00', currency: 'USD' },
            features: {
              platform_fees_pct: 0,
              models: '20+',
              providers: '3',
              chat_api: true,
              activity_logs_export: false,
              budgets_and_spend_controls: false,
              provisioning_keys_sso: false,
              custom_data_policies: false,
              soc2_hipaa: false,
              dedicated_infra: false,
              volume_discount: false,
              priority_support: false,
            },
            cta: { type: 'signup', label: '免费开始' },
          },
          {
            plan_id: 'payg',
            name: 'PAYG',
            monthly_fee: { amount: '99.00', currency: 'USD' },
            features: {
              platform_fees_pct: 3,
              models: '200+',
              providers: '20+',
              chat_api: true,
              activity_logs_export: true,
              budgets_and_spend_controls: true,
              provisioning_keys_sso: false,
              custom_data_policies: false,
              soc2_hipaa: false,
              dedicated_infra: false,
              volume_discount: true,
              priority_support: true,
            },
            cta: { type: 'signup', label: '立即升级' },
          },
          {
            plan_id: 'enterprise',
            name: 'Enterprise',
            monthly_fee: { amount: '0.00', currency: 'USD' },
            features: {
              platform_fees_pct: 0,
              models: 'All',
              providers: 'All',
              chat_api: true,
              activity_logs_export: true,
              budgets_and_spend_controls: true,
              provisioning_keys_sso: true,
              custom_data_policies: true,
              soc2_hipaa: true,
              dedicated_infra: true,
              volume_discount: true,
              priority_support: true,
            },
            cta: { type: 'contact_sales', label: '联系销售' },
          },
        ],
        faq: [
          {
            id: 'byok',
            question: '是否支持 BYOK？',
            answer: '支持。企业版可以配置自有 Provider Key，并保持统一日志与预算管控。',
          },
          {
            id: 'credits',
            question: 'Credits 如何扣费？',
            answer: '根据实际模型输入输出 tokens 与供应商价格实时换算，交易记录可导出。',
          },
        ],
      },
    })
  }),
]
