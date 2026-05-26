import type { QueryParams } from '@/types'
import type { InvitationItem } from '@/types'

/** 邀请列表查询参数 */
export interface InvitationListParams extends QueryParams {
  /** pending | accepted | expired | revoked | all，默认 pending */
  status?: 'pending' | 'accepted' | 'expired' | 'revoked' | 'all'
}

export interface InvitationListResponse {
  items: InvitationItem[]
}
