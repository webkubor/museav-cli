import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCamera } from 'react-icons/lu'

interface AvatarUploadProps {
  src?: string | null
  fallback: string
  size?: number
  loading?: boolean
  onUpload: (file: File) => void
  maxSizeMB?: number
}

export function AvatarUpload({
  src,
  fallback,
  size = 64,
  loading = false,
  onUpload,
  maxSizeMB = 2,
}: AvatarUploadProps) {
  const { t } = useTranslation()
  const [hover, setHover] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > maxSizeMB * 1024 * 1024) {
      return
    }
    onUpload(file)
    e.target.value = ''
  }

  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        cursor: loading ? 'wait' : 'pointer',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 0 3px var(--brand-glow), 0 4px 10px rgba(0,0,0,0.06)',
        backgroundColor: src ? 'var(--mg-fill-0)' : 'var(--mg-primary)',
        border: hover ? '2px solid var(--mg-primary)' : '2px solid transparent',
        transition: 'border-color 0.15s',
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <span style={{ color: '#fff', fontSize: size * 0.38, fontWeight: 700 }}>
          {fallback}
        </span>
      )}
      {(hover || loading) && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 2,
        }}>
          {loading ? (
            <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <LuCamera size={size * 0.22} color="#fff" />
          )}
          <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>
            {loading ? t('common.loading') : t('account.info.avatarChange')}
          </span>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </label>
  )
}
