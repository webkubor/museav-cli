export type OAuthProvider = 'google' | 'github' | 'wechat'

export interface AvatarResponse {
  avatar_url: string
}

export interface OAuthAuthorizeResponse {
  authorize_url: string
}
