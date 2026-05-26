import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'

const PREFIX = '/api/v1'

const DOC_PAGES = [
  {
    slug: 'overview',
    content: `# 文本协议 API 概览

用 ModelGo 统一接入主流模型，只需要替换 API Key 和 Base URL。

## 安装 SDK

ModelGo 兼容 OpenAI SDK，前端文档内容由 Docs API 动态返回。

\`\`\`bash
npm install openai
\`\`\`

## 发起调用

生产环境按市场和租户请求头进入对应后端服务。`,
  },
  {
    slug: 'openai/text',
    content: `# OpenAI 文本协议 API

OpenAI 兼容文本接口，包括 Chat Completions、Responses、Legacy Completions 和 Models。

## Chat Completions

使用 OpenAI SDK 时，将 baseURL 指向 ModelGo 网关即可。`,
  },
  {
    slug: 'anthropic/messages',
    content: `# Anthropic Messages 文本协议 API

Anthropic Messages 兼容接口的请求头、消息格式、响应结构和流式事件。`,
  },
]

export const docsHandlers = [
  http.get(`${PREFIX}/docs/:lang`, ({ params }) =>
    HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        lang: String(params.lang),
        title: 'API 文档',
        description: 'ModelGo Agent 支持的 OpenAI 与 Anthropic 兼容文本接口说明',
        items: [
          {
            type: 'page',
            slug: 'overview',
            path: 'overview.md',
            title: '文本协议 API 概览',
            description: '基础地址、认证方式和当前收录范围。',
          },
          {
            type: 'section',
            slug: 'openai',
            path: 'openai/meta.json',
            title: 'OpenAI 兼容协议',
            description: 'Chat Completions、Responses、Completions 与 Models 接口',
            children: [
              {
                type: 'page',
                slug: 'openai/text',
                path: 'openai/text.md',
                title: 'OpenAI 文本协议 API',
                description: 'OpenAI 兼容文本接口。',
              },
            ],
          },
          {
            type: 'section',
            slug: 'anthropic',
            path: 'anthropic/meta.json',
            title: 'Anthropic 兼容协议',
            description: 'Claude Messages 文本接口',
            children: [
              {
                type: 'page',
                slug: 'anthropic/messages',
                path: 'anthropic/messages.md',
                title: 'Anthropic Messages 文本协议 API',
                description: 'Anthropic Messages 兼容接口。',
              },
            ],
          },
        ],
      },
    })
  ),

  http.get(`${PREFIX}/docs/:lang/page/:slug`, ({ params }) => {
    const requestedSlug = decodeURIComponent(String(params.slug))
    const page = DOC_PAGES.find((item) => item.slug === requestedSlug)
    if (!page) {
      return HttpResponse.json(
        { code: 40400, msg: 'Doc page not found', data: null, request_id: uuid() },
        { status: 404 }
      )
    }
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: page })
  }),
]
