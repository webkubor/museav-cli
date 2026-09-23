/** 快速接入目录游标分页的回归测试。 */
import { describe, expect, it, vi } from 'vitest'
import { listAllConnectModels } from './connect-models'
import type { CatalogModelListParams } from '@/interfaces/catalog'
import type { CatalogModelItem, CursorPage } from '@/types'

const model = (model_id: string) => ({ model_id }) as CatalogModelItem

function page(items: CatalogModelItem[], has_more: boolean, next_cursor: string | null): CursorPage<CatalogModelItem> {
  return { items, has_more, next_cursor, page_size: items.length }
}

describe('listAllConnectModels', () => {
  it('合并所有游标页，并在每次请求中保留原客户端筛选参数', async () => {
    const listPage = vi.fn<(params: CatalogModelListParams) => Promise<CursorPage<CatalogModelItem>>>()
      .mockResolvedValueOnce(page([model('a')], true, 'cursor-1'))
      .mockResolvedValueOnce(page([model('b')], true, 'cursor-2'))
      .mockResolvedValueOnce(page([model('c')], false, null))

    const result = await listAllConnectModels('codex', listPage)

    expect(result.map(({ model_id }) => model_id)).toEqual(['a', 'b', 'c'])
    expect(listPage).toHaveBeenNthCalledWith(1, {
      coding_tool: 'codex', include_hidden: true, page_size: 100,
    })
    expect(listPage).toHaveBeenNthCalledWith(2, {
      coding_tool: 'codex', include_hidden: true, page_size: 100, cursor: 'cursor-1',
    })
    expect(listPage).toHaveBeenNthCalledWith(3, {
      coding_tool: 'codex', include_hidden: true, page_size: 100, cursor: 'cursor-2',
    })
  })

  it('has_more 为 false 时立即终止，不读取 next_cursor', async () => {
    const listPage = vi.fn<(params: CatalogModelListParams) => Promise<CursorPage<CatalogModelItem>>>()
      .mockResolvedValue(page([model('only')], false, 'unused-cursor'))

    await expect(listAllConnectModels('claude-code', listPage)).resolves.toEqual([model('only')])
    expect(listPage).toHaveBeenCalledTimes(1)
  })

  it('has_more 为 true 但没有可用 cursor 时明确失败，不返回不完整目录', async () => {
    const listPage = vi.fn<(params: CatalogModelListParams) => Promise<CursorPage<CatalogModelItem>>>()
      .mockResolvedValue(page([model('first')], true, null))

    await expect(listAllConnectModels('claude-code', listPage)).rejects.toThrow('缺少 next_cursor')
    expect(listPage).toHaveBeenCalledTimes(1)
  })

  it('服务端重复返回已用 cursor 时明确失败，不返回不完整目录', async () => {
    const listPage = vi.fn<(params: CatalogModelListParams) => Promise<CursorPage<CatalogModelItem>>>()
      .mockResolvedValueOnce(page([model('first')], true, 'cursor-1'))
      .mockResolvedValueOnce(page([model('second')], true, 'cursor-1'))

    await expect(listAllConnectModels('claude-code', listPage)).rejects.toThrow('重复 cursor')
    expect(listPage).toHaveBeenCalledTimes(2)
  })

  it('服务端持续返回新 cursor 时在页数上限停止', async () => {
    let cursorIndex = 0
    const listPage = vi.fn<(params: CatalogModelListParams) => Promise<CursorPage<CatalogModelItem>>>()
      .mockImplementation(async () => {
        cursorIndex += 1
        return page([model(`page-${cursorIndex}`)], true, `cursor-${cursorIndex}`)
      })

    await expect(listAllConnectModels('codex', listPage)).rejects.toThrow('超过最大页数')
    expect(listPage).toHaveBeenCalledTimes(50)
  })
})
