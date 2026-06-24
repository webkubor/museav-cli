import { describe, expect, it } from 'vitest'
import JSEncrypt from 'jsencrypt'
import {
  aesEncrypt,
  aesDecrypt,
  generateAesKeyB64,
  generateNonce,
  encryptRequest,
  decryptResponse,
} from './secure-transport'

describe('secure-transport 混合加密', () => {
  it('AES 加解密往返一致', () => {
    const key = generateAesKeyB64()
    const plain = JSON.stringify({ email: 'a@b.com', n: 42, zh: '中文' })
    const { data, iv } = aesEncrypt(plain, key)
    expect(data).not.toBe(plain)
    expect(aesDecrypt(data, key, iv)).toBe(plain)
  })

  it('AES 密钥为 256-bit（32 字节 base64）', () => {
    const key = generateAesKeyB64()
    // 32 字节 base64 → 44 字符（含一个 = 填充）
    expect(key).toMatch(/^[A-Za-z0-9+/]{43}=$/)
  })

  it('每次 IV / nonce / key 都不同（CSPRNG）', () => {
    const k1 = generateAesKeyB64()
    const k2 = generateAesKeyB64()
    expect(k1).not.toBe(k2)
    expect(generateNonce()).not.toBe(generateNonce())
    const a = aesEncrypt('x', k1)
    const b = aesEncrypt('x', k1)
    expect(a.iv).not.toBe(b.iv) // 同密钥不同 IV
  })

  it('encryptRequest 信封可被「后端」RSA 私钥 + AES 解开（端到端契约自检）', () => {
    // 模拟后端：生成 RSA 密钥对
    const rsa = new JSEncrypt({ default_key_size: '2048' })
    const publicKey = rsa.getPublicKey()
    const privateKey = rsa.getPrivateKey()

    const body = { action: 'login', email: 'tester@modelgo.com', password: 'Secret123' }
    const { envelope, aesKeyB64 } = encryptRequest(body, publicKey)

    // 信封字段齐全
    expect(envelope.key).toBeTruthy()
    expect(envelope.iv).toBeTruthy()
    expect(envelope.data).toBeTruthy()
    expect(typeof envelope.ts).toBe('number')
    expect(envelope.nonce).toBeTruthy()

    // 后端步骤 1：RSA 私钥解 key → AES 密钥（base64）
    const dec = new JSEncrypt()
    dec.setPrivateKey(privateKey)
    const recoveredAesKey = dec.decrypt(envelope.key)
    expect(recoveredAesKey).toBe(aesKeyB64)

    // 后端步骤 2/3：用 AES 密钥 + iv 解 data
    const plain = aesDecrypt(envelope.data, recoveredAesKey as string, envelope.iv)
    expect(JSON.parse(plain)).toEqual(body)
  })

  it('decryptResponse 用同一 AES 密钥解响应', () => {
    const aesKeyB64 = generateAesKeyB64()
    const respBody = { ok: true, list: [1, 2, 3] }
    const { data, iv } = aesEncrypt(JSON.stringify(respBody), aesKeyB64)
    expect(decryptResponse(data, aesKeyB64, iv)).toEqual(respBody)
  })
})
