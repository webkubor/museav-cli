/**
 * 客服消息区自动滚动回归测试
 * 路由：客服组件内嵌消息线程
 * API：无
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useMessageAutoScroll } from './use-message-scroll'

interface Message {
  id: string
  rating?: 'like' | 'dislike'
}

function MessageThreadFixture() {
  const [messages, setMessages] = useState<Message[]>([{ id: 'answer-1' }])
  const scrollRef = useRef<HTMLDivElement>(null)
  useMessageAutoScroll(scrollRef, messages, false, 'chat')

  return (
    <div
      ref={(node) => {
        scrollRef.current = node
        if (node) {
          Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 900 })
        }
      }}
    >
      {messages.map((message) => (
        <button
          key={message.id}
          type="button"
          aria-label="点赞"
          onClick={() => setMessages((current) => current.map((item) => (
            item.id === message.id ? { ...item, rating: 'like' } : item
          )))}
        >
          {message.rating ?? '未评价'}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setMessages((current) => [...current, { id: `answer-${current.length + 1}` }])}
      >
        追加消息
      </button>
    </div>
  )
}

describe('客服消息区自动滚动', () => {
  it('点击评分只更新消息反馈，不把阅读位置强制移到末尾', () => {
    render(<MessageThreadFixture />)
    const thread = screen.getByRole('button', { name: '点赞' }).parentElement
    if (!thread) throw new Error('消息线程未渲染')

    let scrollTop = 240
    Object.defineProperty(thread, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => { scrollTop = value },
    })

    const ratingButton = screen.getByRole('button', { name: '点赞' })
    ratingButton.focus()
    fireEvent.click(ratingButton)

    expect(ratingButton).toHaveTextContent('like')
    expect(document.activeElement).toBe(ratingButton)
    expect(scrollTop).toBe(240)
  })

  it('新增消息时仍自动定位到最新消息', () => {
    render(<MessageThreadFixture />)
    const thread = screen.getByRole('button', { name: '点赞' }).parentElement
    if (!thread) throw new Error('消息线程未渲染')

    let scrollTop = 0
    Object.defineProperty(thread, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => { scrollTop = value },
    })

    act(() => fireEvent.click(screen.getByRole('button', { name: '追加消息' })))

    expect(scrollTop).toBe(900)
  })
})
