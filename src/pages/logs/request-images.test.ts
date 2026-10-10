import { describe, expect, it } from 'vitest'
import { extractRequestImages } from './request-images'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

function payload(messages: unknown) {
  return JSON.stringify({ model: 'x', messages })
}

describe('extractRequestImages (#1266)', () => {
  it('识别 data URL 与 http(s) 图片块，并保留消息序号与角色', () => {
    const text = payload([
      { role: 'system', content: 'hi' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: DATA_URL } },
          { type: 'image_url', image_url: 'https://cdn.example.com/a.jpg' },
        ],
      },
    ])
    expect(extractRequestImages(text)).toEqual([
      { messageIndex: 1, role: 'user', src: DATA_URL },
      { messageIndex: 1, role: 'user', src: 'https://cdn.example.com/a.jpg' },
    ])
  })

  it('丢弃非图片协议（javascript:、file:、普通字符串）', () => {
    const text = payload([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'javascript:alert(1)' } },
          { type: 'image_url', image_url: { url: 'file:///etc/passwd' } },
          { type: 'image_url', image_url: { url: 'data:text/html;base64,PGgxPg==' } },
          { type: 'image_url', image_url: 'not a url' },
        ],
      },
    ])
    expect(extractRequestImages(text)).toEqual([])
  })

  it('非 JSON、缺 messages、纯文本 content 一律返回空数组（回退原文）', () => {
    expect(extractRequestImages('')).toEqual([])
    expect(extractRequestImages('not json')).toEqual([])
    expect(extractRequestImages(JSON.stringify({ prompt: 'x' }))).toEqual([])
    expect(extractRequestImages(payload([{ role: 'user', content: 'plain text' }]))).toEqual([])
  })

  it('role 缺失时回落为 user', () => {
    const text = payload([{ content: [{ type: 'image_url', image_url: { url: DATA_URL } }] }])
    expect(extractRequestImages(text)).toEqual([{ messageIndex: 0, role: 'user', src: DATA_URL }])
  })
})
