export interface GatewayEndpoint {
  label: string
  baseUrl: string
}

export const GATEWAY_ENDPOINTS: GatewayEndpoint[] = [
  { label: 'OpenAI 兼容', baseUrl: 'https://api.test.modelgo.com/v1' },
  { label: 'Anthropic 兼容', baseUrl: 'https://api.test.modelgo.com' },
]
