/**
 * GitLab QA Issue 状态通知中转测试。
 * 覆盖状态标签过滤与 GitLab username 原样展示。
 */

import { describe, expect, it } from 'vitest'
import { extractStatusNotification } from './worker'

const label = (title: string) => ({ title })

const issuePayload = (previous: readonly string[], current: readonly string[]) => ({
  object_kind: 'issue',
  project: { id: 1 },
  object_attributes: {
    action: 'update',
    iid: 43,
    title: '登录页面异常',
    url: 'https://gitlab.example.test/qa/ai-quality-platform/-/issues/43',
  },
  changes: {
    labels: {
      previous: previous.map(label),
      current: current.map(label),
    },
  },
  user: { username: 'webkubor' },
})

describe('extractStatusNotification', () => {
  it('提取状态变化并保留 GitLab username', () => {
    expect(extractStatusNotification(issuePayload(
      ['BUG', '进行中'],
      ['BUG', '待验证'],
    ))).toEqual({
      iid: 43,
      title: '登录页面异常',
      from: '进行中',
      to: '待验证',
      username: 'webkubor',
      url: 'https://gitlab.example.test/qa/ai-quality-platform/-/issues/43',
    })
  })

  it('忽略只有业务标签变化的更新', () => {
    expect(extractStatusNotification(issuePayload(
      ['进行中', 'BUG'],
      ['进行中', 'Feature'],
    ))).toBeNull()
  })

  it('忽略非 QA project 1 的事件', () => {
    const payload = {
      ...issuePayload(['进行中'], ['待验证']),
      project: { id: 31 },
    }
    expect(extractStatusNotification(payload)).toBeNull()
  })
})
