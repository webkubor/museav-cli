/**
 * 前后端混合加密（RSA + AES）传输工具。
 *
 * 定位：在 HTTPS 之上的「应用层」加密，防抓包复现 / 网关复现 / 内部人员窥探，
 * 并附带防重放字段。**不替代 HTTPS**（通道安全仍由 TLS 负责）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 与后端的互通契约（后端按此实现解密/加密，务必一致）：
 *
 * 算法：
 *   - AES：AES-256-CBC，PKCS7 padding。32 字节密钥 + 16 字节 IV。
 *   - RSA：RSA/ECB/PKCS1Padding（PKCS#1 v1.5，jsencrypt 默认），公钥加密 / 私钥解密。
 *
 * 随机源：AES 密钥与 IV 均由 window.crypto.getRandomValues 生成（CSPRNG），每次请求新生成。
 *
 * 编码：
 *   - aesKey、iv：原始字节的 base64。
 *   - data：AES 密文的 base64。
 *   - key：RSA( base64(aesKey 原始字节) ) 的 base64。
 *
 * 请求信封（前端 → 后端）：
 *   { key, iv, data, ts, nonce }
 *     key   = base64( RSA_pub( base64(aesKeyBytes) ) )
 *     iv    = base64(ivBytes)                 // 明文传输，IV 无需保密
 *     data  = base64( AES-256-CBC(明文JSON, aesKey, iv) )
 *     ts    = 毫秒时间戳                        // 防重放：后端校验时间窗
 *     nonce = 随机串                            // 防重放：后端去重
 *
 * 后端解密步骤：
 *   1. RSA 私钥解密 key → 得到 base64(aesKeyBytes) → 解出 32 字节 AES 密钥
 *   2. base64 解 iv 得 16 字节 IV
 *   3. AES-256-CBC 用 (aesKey, iv) 解 data → 明文 JSON
 *   4. 校验 ts 时间窗 + nonce 未用过（防重放）
 *
 * 响应（后端 → 前端）：复用同一 AES 密钥，返回 { iv, data }（response 用新 IV）；
 *   前端用 encryptRequest 返回的 aesKeyB64 + 响应 iv 调 decryptResponse 解开。
 *
 * 安全说明：
 *   - CBC 模式本身不防篡改（无完整性校验）。如需「防数据篡改」达到强保证，
 *     建议后端升级到 AES-GCM 或对密文加 HMAC；当前依赖 HTTPS + 业务校验兜底。
 * ─────────────────────────────────────────────────────────────────────────
 */
import CryptoJS from 'crypto-js'
import JSEncrypt from 'jsencrypt'

/** 前端 → 后端的加密请求信封 */
export interface SecureEnvelope {
  /** RSA 公钥加密后的 AES 密钥（base64(RSA(base64(aesKeyBytes)))） */
  key: string
  /** AES IV（base64，明文传输） */
  iv: string
  /** AES 密文（base64） */
  data: string
  /** 毫秒时间戳，供后端做重放时间窗校验 */
  ts: number
  /** 一次性随机串，供后端做重放去重 */
  nonce: string
}

/** encryptRequest 的返回：信封 + 本次 AES 密钥（用于解响应） */
export interface EncryptedRequest {
  envelope: SecureEnvelope
  /** 本次会话用的 AES 密钥（base64），解响应时传给 decryptResponse */
  aesKeyB64: string
}

/** 生成 n 字节的 CSPRNG 随机，返回 CryptoJS WordArray（不走 crypto-js 自带 RNG）。 */
function randomBytes(n: number): CryptoJS.lib.WordArray {
  const bytes = new Uint8Array(n)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    throw new Error('当前环境缺少安全随机源 crypto.getRandomValues')
  }
  // Uint8Array → hex → WordArray，避免依赖具体编码内部实现
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return CryptoJS.enc.Hex.parse(hex)
}

/** 动态生成 256-bit AES 密钥（CSPRNG），返回 base64。 */
export function generateAesKeyB64(): string {
  return CryptoJS.enc.Base64.stringify(randomBytes(32))
}

/**
 * AES-256-CBC 加密。
 * @param plaintext 明文字符串
 * @param aesKeyB64 base64 的 32 字节密钥
 * @returns { data: base64密文, iv: base64 IV }
 */
export function aesEncrypt(plaintext: string, aesKeyB64: string): { data: string; iv: string } {
  const key = CryptoJS.enc.Base64.parse(aesKeyB64)
  const iv = randomBytes(16)
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return {
    data: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    iv: CryptoJS.enc.Base64.stringify(iv),
  }
}

/** AES-256-CBC 解密，返回明文字符串。 */
export function aesDecrypt(dataB64: string, aesKeyB64: string, ivB64: string): string {
  const key = CryptoJS.enc.Base64.parse(aesKeyB64)
  const iv = CryptoJS.enc.Base64.parse(ivB64)
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(dataB64) }),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  )
  return decrypted.toString(CryptoJS.enc.Utf8)
}

/** RSA 公钥加密（PKCS#1 v1.5），返回 base64；失败返回 null（如明文超长）。 */
export function rsaEncrypt(text: string, publicKeyPem: string): string | null {
  const enc = new JSEncrypt()
  enc.setPublicKey(publicKeyPem)
  const out = enc.encrypt(text)
  return out === false ? null : out
}

/**
 * 构造加密请求信封：动态 AES 密钥加密业务数据，RSA 公钥加密 AES 密钥。
 * @param body 业务数据（对象或字符串，对象会 JSON.stringify）
 * @param serverPublicKeyPem 后端下发的 RSA 公钥（PEM）
 */
export function encryptRequest(body: unknown, serverPublicKeyPem: string): EncryptedRequest {
  const aesKeyB64 = generateAesKeyB64()
  const plaintext = typeof body === 'string' ? body : JSON.stringify(body)
  const { data, iv } = aesEncrypt(plaintext, aesKeyB64)
  const key = rsaEncrypt(aesKeyB64, serverPublicKeyPem)
  if (!key) throw new Error('RSA 加密 AES 密钥失败（检查公钥是否有效）')
  return {
    aesKeyB64,
    envelope: { key, iv, data, ts: Date.now(), nonce: generateNonce() },
  }
}

/** 解密后端响应（复用请求时的 AES 密钥 + 响应自带的 IV）。 */
export function decryptResponse<T = unknown>(dataB64: string, aesKeyB64: string, ivB64: string): T {
  const json = aesDecrypt(dataB64, aesKeyB64, ivB64)
  return JSON.parse(json) as T
}

/** 一次性随机串（防重放）：16 字节 CSPRNG → base64url。 */
export function generateNonce(): string {
  return CryptoJS.enc.Base64.stringify(randomBytes(16)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
