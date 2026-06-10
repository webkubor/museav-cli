export type Status = 'idle' | 'loading' | 'success' | 'error'

export interface EndpointState {
  status: Status
  data: unknown
  error: string | null
  duration: number | null
}

export interface EndpointDef {
  label: string
  method: 'GET' | 'POST'
  path: string
  group: string
  call: () => Promise<unknown>
}
