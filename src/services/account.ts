/**
 * 账号管理（§三）
 * 路由：/account/profile、/account/settings
 * API：GET|PATCH /account/profile、PUT /account/avatar、POST|DELETE /account/connect/:provider、POST /account/password、POST /account/delete-request
 */
import { del, get, patch, post, upload } from '@/lib/request'
import type { AvatarResponse, OAuthAuthorizeResponse, OAuthProvider } from '@/interfaces/account'
import type {
  AccountProfile,
  ChangePasswordRequest,
  DeleteAccountRequest,
  DeleteAccountResult,
  UpdateProfileRequest,
} from '@/types'

/** 获取当前账号的个人资料 */
export function getProfile() {
  return get<AccountProfile>('account/profile')
}

/** 更新个人资料（当前仅允许修改 display_name） */
export function updateProfile(body: UpdateProfileRequest) {
  return patch<AccountProfile>('account/profile', body)
}

/**
 * 绑定手机号（国内环境唯一性校验）。先经 /auth/sms-code/send 发码，再用手机号 + 验证码绑定。
 * 契约：POST /account/phone/bind { phone, code }（Swagger account.BindPhoneRequest）。
 */
export function bindPhone(phone: string, code: string) {
  return post<AccountProfile | null>('account/phone/bind', { phone, code })
}

/**
 * 绑定邮箱到当前账号（qa#397）。先经 /auth/email-code/send 发码，再用邮箱 + 验证码绑定。
 * 契约：POST /account/email/bind { email, code }（Swagger account.BindEmailRequest）。
 */
export function bindEmail(email: string, code: string) {
  return post<AccountProfile | null>('account/email/bind', { email, code })
}

/**
 * 自助换绑手机号 / 邮箱（shared/modelgo_prd#837，后端契约 2026-09-14 落地，Swagger 202609141230）。
 *
 * 票据式两步流程（后端不维护 DB 行，票据是 HMAC 短时效凭证，绑定 account + channel）：
 *   ① POST /account/rebind/current-code/send { channel }        → 向当前绑定的手机/邮箱发码（无滑块）
 *   ① POST /account/rebind/verify-current    { channel, code }  → 校验当前码，签发 rebind_ticket（600s）
 *   ② POST /account/rebind/commit { rebind_ticket, new_value, new_code } → 校验新凭证码 + 占用，替换绑定
 * 新凭证的发码仍复用 /auth/sms-code/send、/auth/email-code/send（services/auth）。
 *
 * ⚠️ commit 成功后端会吊销该账号**全部**会话（含当前）——调用方成功后不要再发任何请求
 * （invalidateQueries 会撞 40101 触发「会话过期」toast），直接清鉴权态引导重新登录。
 *
 * 业务码（web-api 已带中英 catalog 文案，未特判的直接透出 msg）：
 *   40035 当前验证码错误 · 40037 当前凭证未绑定 · 40103 票据失效/不匹配（退回第一步重验）
 *   40911 新号/邮箱已被其他账号占用 · 42901 24h 内已换绑过
 */
export type RebindCurrentChannel = 'phone' | 'email'

export const REBIND_ERROR_CODE = {
  /** 当前凭证验证码错误 */
  CURRENT_CODE_INVALID: 40035,
  /** 当前凭证未绑定（如无手机号却选 phone 验身） */
  CURRENT_NOT_BOUND: 40037,
  /** 换绑票据失效 / 不匹配：回到第一步重新验身 */
  TICKET_INVALID: 40103,
  /** 新手机号 / 邮箱已被其他账号占用 */
  OCCUPIED: 40911,
  /** 换绑过于频繁（24h 内仅允许一次） */
  TOO_FREQUENT: 42901,
} as const

export interface RebindCodeSentResponse {
  /** 验证码有效期（秒） */
  expires_in: number
}

export interface RebindTicketResponse {
  rebind_ticket: string
  /** 票据有效期（秒） */
  expires_in: number
}

/** 换绑第一步：向当前绑定的手机 / 邮箱发验证码 */
export function sendRebindCurrentCode(channel: RebindCurrentChannel) {
  return post<RebindCodeSentResponse>('account/rebind/current-code/send', { channel })
}

/** 换绑第一步校验：验证当前凭证验证码，签发换绑票据 */
export function verifyRebindCurrent(channel: RebindCurrentChannel, code: string) {
  return post<RebindTicketResponse>('account/rebind/verify-current', { channel, code })
}

/**
 * 换绑第二步：票据 + 新凭证验证码完成换绑。
 * 响应沿用 bind 口径（更新后的 profile 或空 data）；成功即全部会话被吊销，见文件头说明。
 */
export function commitRebind(rebindTicket: string, newValue: string, newCode: string) {
  return post<AccountProfile | null>('account/rebind/commit', {
    rebind_ticket: rebindTicket,
    new_value: newValue,
    new_code: newCode,
  })
}

/**
 * 上传头像。
 * 文件限制：≤ 2 MiB，仅支持 PNG / JPG / WebP。
 */
export function uploadAvatar(file: File): Promise<AvatarResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return upload<AvatarResponse>('put', 'account/avatar', formData)
}

/** 发起 OAuth 关联起步，返回厂商授权 URL */
export function connectOAuth(
  provider: OAuthProvider,
  redirect: string
): Promise<OAuthAuthorizeResponse> {
  return post<OAuthAuthorizeResponse>(`account/connect/${provider}`, { redirect })
}

/** 断开 OAuth 关联（至少保留 1 种登录方式，否则 42201） */
export function disconnectOAuth(provider: OAuthProvider) {
  return del<null>(`account/connect/${provider}`)
}

/** 修改密码 */
export function changePassword(body: ChangePasswordRequest) {
  return post<null>('account/password', body)
}

/** 申请删除账户（7 天宽限期） */
export function deleteAccount(body: DeleteAccountRequest) {
  return post<DeleteAccountResult>('account/delete-request', body)
}
