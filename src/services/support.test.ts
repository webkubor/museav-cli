/**
 * 智能回答评分 wire 契约测试
 * API：POST /support/answers/:id/rating
 * 后端实测（qa#731）：枚举只收 up/down，like/dislike 会被 40001 拒。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/request', () => ({
  get: vi.fn(),
  getPage: vi.fn(),
  post: vi.fn(),
}))

import { post } from '@/lib/request'
import { rateAnswer } from '@/services/support'

const postMock = vi.mocked(post)

describe('rateAnswer', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('like → up / dislike → down（前端语义在 wire 边界映射为后端枚举）', () => {
    rateAnswer('ans_1', 'like')
    expect(postMock).toHaveBeenLastCalledWith('support/answers/ans_1/rating', { rating: 'up' })
    rateAnswer('ans_2', 'dislike')
    expect(postMock).toHaveBeenLastCalledWith('support/answers/ans_2/rating', { rating: 'down' })
  })
})
