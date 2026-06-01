import { getMarket } from '@/lib/market'

export interface GatewayEndpoint {
  label: string
  baseUrl: string
}

const GATEWAY_DOMAIN = import.meta.env.VITE_API_GATEWAY_DOMAIN || (getMarket() === 'domestic' ? 'api.modelgo.com' : 'api.modelgo.ai')

export const GATEWAY_ENDPOINTS: GatewayEndpoint[] = [
  { label: 'OpenAI 兼容', baseUrl: `https://${GATEWAY_DOMAIN}/v1` },
  { label: 'Anthropic 兼容', baseUrl: `https://${GATEWAY_DOMAIN}` },
]
