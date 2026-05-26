export interface AuthMailTTLResponse {
  expires_in: number
}

export interface CheckLoginEmailResponse {
  registered: boolean
  password_login_enabled: boolean
}
