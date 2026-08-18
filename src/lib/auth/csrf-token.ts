/**
 * CSRF token 的内存单一来源（需求方#676）。
 *
 * 为什么不能再从 cookie 读：`document.cookie` 只给字符串、看不到属性，顺序按
 * RFC 6265 §5.4 只由 path 长度与创建时间决定（**与域特异性无关**），而覆写同名
 * cookie 不更新创建时间 —— 所以 `split('; ').find(...)` 拿到的永远是**先创建**
 * 那一枚。服务端 `sessionCookieValue` 是 last-wins，用**最后一枚** session 派生
 * 校验值。两边方向相反：浏览器里只要存在第二枚同名 cookie（cookie 作用域迁移期
 * 留下的 host-only / 父域影子），每一个写请求都必然 40302，且客户端无法自愈
 * （服务端只能覆盖自己作用域那一枚，碰不到影子）。
 *
 * 唯一无歧义的来源是 `GET /auth/session` 响应体里的 `data.csrf_token` ——
 * 它就是服务端按「校验时会用的那枚 session」派生出来的值。
 *
 * 刻意存内存、不落 localStorage：它是会话派生凭据（`SHA256(sep|sessionID)`、
 * 永不轮换），持久化只会扩大泄露面；而每次进页面 AuthProvider 都会拉一次
 * session，内存值天然够用。
 */

let csrfToken: string | null = null

/** 从 /auth/session 响应体收下 token。空值不覆盖已有值（避免旧接口回包把它擦掉）。 */
export function setCsrfToken(token: string | null | undefined): void {
  if (token) csrfToken = token
}

export function getCsrfToken(): string | null {
  return csrfToken
}

/** 退出登录时清掉，避免下一个账号复用上一个会话的派生值。 */
export function clearCsrfToken(): void {
  csrfToken = null
}
