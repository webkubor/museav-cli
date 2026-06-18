/**
 * 模型目录筛选组件测试
 * 路由：/models/catalog
 * API：无直接请求，使用内联模型数据验证筛选交互
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelCatalogFilters } from './ModelCatalogFilters'
import { DEFAULT_ADVANCED_FILTERS } from './modelCatalogFilterLogic'
import type { CatalogModelItem, CatalogModelTag } from '@/types'

const messages: Record<string, string> = {
  'modelsCatalog.placeholder.search': '搜索模型名称、API ID 或厂商...',
  'modelsCatalog.filter.all': '全部',
  'modelsCatalog.filters.label': '筛选',
  'modelsCatalog.filters.moreLabel': '更多筛选',
  'modelsCatalog.filters.all': '全部',
  'modelsCatalog.filters.category': '模型类别',
  'modelsCatalog.filters.language': '语言支持',
  'modelsCatalog.filters.languageMultilingual': '多语言',
  'modelsCatalog.filters.languageEnglish': '英文',
  'modelsCatalog.filters.languageChinese': '中文',
  'modelsCatalog.filters.context': '推理上下文长度',
  'modelsCatalog.filters.provider': '模型提供方',
  'modelsCatalog.filters.family': '模型系列',
  'modelsCatalog.filters.scenario': '模型场景',
  'modelsCatalog.filters.sort.label': '排序',
  'modelsCatalog.filters.sort.popular': '综合排序',
  'modelsCatalog.filters.sort.newest': '最新发布',
  'modelsCatalog.filters.sort.cheapest': '最低价格',
  'modelsCatalog.filters.reset': '重置筛选',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

const model: CatalogModelItem = {
  id: '1',
  model_id: 'openai/gpt-5',
  display_name: 'GPT 5',
  vendor: 'OpenAI',
  modalities: ['text'],
  tags: ['chat'],
  context_length: 128_000,
  max_output_tokens: 8_192,
  pricing: {
    input_per_1m: '1',
    output_per_1m: '2',
    cache_read_per_1m: '0',
    currency: 'CNY',
  },
  released_at: '2026-01-01',
  knowledge_cutoff: '2026-01-01',
  status: 'enabled',
  logo_url: '',
}

const tag: CatalogModelTag = {
  id: 'tag_chat',
  code: 'chat',
  group_code: 'scenario',
  name_zh: '对话',
  name_en: 'Chat',
  enabled: true,
  sort_order: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

describe('ModelCatalogFilters', () => {
  it('展开更多筛选后只显示补充筛选维度', () => {
    render(
      <ModelCatalogFilters
        search=""
        onSearchChange={vi.fn()}
        category="all"
        onCategoryChange={vi.fn()}
        advancedFilters={{ ...DEFAULT_ADVANCED_FILTERS }}
        onAdvancedFiltersChange={vi.fn()}
        familyOptions={[{ code: 'all', label: '全部' }, { code: 'claude', label: 'Claude' }]}
        family="all"
        onFamilyChange={vi.fn()}
        allModels={[model]}
        apiTags={[tag]}
        modalityFilters={[{ code: 'text', nameZh: '文本生成', nameEn: 'Text' }]}
        isZh
        sort="popular"
        onSortChange={vi.fn()}
      />,
    )

    expect(screen.queryByText('模型类别')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '更多筛选' }))

    expect(screen.queryByText('模型类别')).not.toBeInTheDocument()
    expect(screen.getByText('语言支持')).toBeInTheDocument()
    expect(screen.getByText('推理上下文长度')).toBeInTheDocument()
    expect(screen.getByText('模型系列')).toBeInTheDocument()
    expect(screen.getByText('模型场景')).toBeInTheDocument()
  })
})
