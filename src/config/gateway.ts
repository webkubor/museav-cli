export interface GatewayEndpoint {
  label: string
  baseUrl: string
}

const domain = import.meta.env.VITE_API_GATEWAY_DOMAIN || 'api.test.modelgo.com'

export const GATEWAY_ENDPOINTS: GatewayEndpoint[] = [
  { label: 'OpenAI 兼容', baseUrl: `https://${domain}/v1` },
  { label: 'Anthropic 兼容', baseUrl: `https://${domain}` },
]
