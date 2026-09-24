/**
 * 反馈附件的白名单与上限，对齐后端三处：
 * web-api `supportAllowedMIME` / `maxSupportObjectBytes`（5MB）、agent `attach.Validate`。
 * 前端先拦一道，避免传上去才被拒。
 *
 * 单独成文件（而不是放在 feedback-form.tsx 里 export）：那里只应导出组件，
 * 导出常量会破坏 react-refresh 的 Fast Refresh。
 */
export const ATTACHMENT_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain']
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.txt'
