import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listModels, listModelTags, getModel, listModelProviders } from '@/services/catalog'
import type { CatalogModelListParams } from '@/interfaces/catalog'

export function useModels(params?: Omit<CatalogModelListParams, 'page_size'>) {
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const modelsQuery = useQuery({
    queryKey: ['catalog-models', params],
    queryFn: () => listModels({ page_size: 100, ...params }),
    staleTime: 5 * 60_000,
  })

  const tagsQuery = useQuery({
    queryKey: ['catalog-model-tags'],
    queryFn: () => listModelTags(),
    staleTime: 10 * 60_000,
  })

  const detailQuery = useQuery({
    queryKey: ['catalog-model-detail', selectedId],
    queryFn: () => getModel(selectedId!),
    enabled: !!selectedId,
    staleTime: 5 * 60_000,
  })

  const providersQuery = useQuery({
    queryKey: ['catalog-model-providers', selectedId],
    queryFn: () => listModelProviders(selectedId!),
    enabled: !!selectedId,
    staleTime: 5 * 60_000,
  })

  const allModels = modelsQuery.data?.items ?? []
  const tags = tagsQuery.data?.items ?? []

  const filteredModels = allModels.filter((m) => {
    const matchSearch = !search.trim() ||
      m.display_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.vendor ?? '').toLowerCase().includes(search.toLowerCase()) ||
      m.model_id.toLowerCase().includes(search.toLowerCase())
    const matchTag = !activeTag || m.tags.includes(activeTag)
    return matchSearch && matchTag
  })

  return {
    search,
    setSearch,
    activeTag,
    setActiveTag,
    selectedId,
    setSelectedId,
    modelsQuery,
    tagsQuery,
    detailQuery,
    providersQuery,
    filteredModels,
    tags,
  }
}
