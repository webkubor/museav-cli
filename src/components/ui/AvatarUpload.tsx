import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCamera, LuZoomIn, LuZoomOut } from 'react-icons/lu'
import { Button } from './Button'

interface AvatarUploadProps {
  src?: string | null
  fallback: string
  size?: number
  loading?: boolean
  disabled?: boolean
  onUpload: (file: File) => void
  outputSize?: number
  maxSizeMB?: number
}

const CANVAS_SIZE = 300
const MIN_SCALE = 0.5
const MAX_SCALE = 3

function compressToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  maxBytes: number,
): Promise<File> {
  return new Promise((resolve) => {
    let quality = 0.92
    const tryCompress = () => {
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(new File([], fileName)); return }
          if (blob.size <= maxBytes || quality <= 0.3) {
            resolve(new File([blob], fileName, { type: 'image/jpeg' }))
          } else {
            quality -= 0.1
            tryCompress()
          }
        },
        'image/jpeg',
        quality,
      )
    }
    tryCompress()
  })
}

export function AvatarUpload({
  src,
  fallback,
  size = 64,
  loading = false,
  disabled = false,
  onUpload,
  outputSize = 512,
  maxSizeMB = 2,
}: AvatarUploadProps) {
  const { t } = useTranslation()
  const [hover, setHover] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleCropDone(file: File) {
    setCropSrc(null)
    onUpload(file)
  }

  return (
    <>
      <label
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative', width: size, height: size, borderRadius: '50%',
          overflow: 'hidden', cursor: disabled ? 'default' : loading ? 'wait' : 'pointer', flexShrink: 0,
          pointerEvents: disabled ? 'none' : undefined,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 3px var(--brand-glow), 0 4px 10px rgba(0,0,0,0.06)',
          backgroundColor: src ? 'var(--mg-fill-0)' : 'var(--mg-primary)',
          border: hover ? '2px solid var(--mg-primary)' : '2px solid transparent',
          transition: 'border-color 0.15s',
        }}
      >
        {src ? (
          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span style={{ color: '#fff', fontSize: size * 0.38, fontWeight: 700 }}>{fallback}</span>
        )}
        {(hover || loading) && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
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
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleFileSelect} />
      </label>

      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          outputSize={outputSize}
          maxBytes={maxSizeMB * 1024 * 1024}
          onConfirm={handleCropDone}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </>
  )
}

// ─── 裁剪弹窗 ────────────────────────────────────────────────

function CropModal({
  imageSrc,
  outputSize,
  maxBytes,
  onConfirm,
  onCancel,
}: {
  imageSrc: string
  outputSize: number
  maxBytes: number
  onConfirm: (file: File) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const fitScale = CANVAS_SIZE / Math.min(img.width, img.height)
      setScale(fitScale)
      setOffset({
        x: (CANVAS_SIZE - img.width * fitScale) / 2,
        y: (CANVAS_SIZE - img.height * fitScale) / 2,
      })
      setImgLoaded(true)
    }
    img.src = imageSrc
  }, [imageSrc])

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    const img = imgRef.current
    if (!ctx || !img) return
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    ctx.save()
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale)
    ctx.restore()
    // 圆形边框
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 1, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [scale, offset])

  useEffect(() => { if (imgLoaded) draw() }, [imgLoaded, draw])

  function handlePointerDown(e: React.PointerEvent) {
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    offsetStart.current = { ...offset }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    setOffset({
      x: offsetStart.current.x + (e.clientX - dragStart.current.x),
      y: offsetStart.current.y + (e.clientY - dragStart.current.y),
    })
  }

  function handlePointerUp() { dragging.current = false }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s - e.deltaY * 0.001)))
  }

  async function handleConfirm() {
    const img = imgRef.current
    if (!img) return
    const out = document.createElement('canvas')
    out.width = outputSize
    out.height = outputSize
    const ctx = out.getContext('2d')!
    const ratio = outputSize / CANVAS_SIZE
    ctx.beginPath()
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, offset.x * ratio, offset.y * ratio, img.width * scale * ratio, img.height * scale * ratio)
    const file = await compressToFile(out, 'avatar.jpg', maxBytes)
    onConfirm(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card-bg border border-mg-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 w-[380px]">
        {/* 标题 */}
        <div className="px-5 py-3.5 border-b border-mg-border text-sm font-bold text-mg-text-0">
          {t('account.info.avatarCropTitle')}
        </div>

        {/* 裁剪区 */}
        <div className="flex justify-center py-5 bg-mg-bg-1/50">
          <div style={{ position: 'relative', width: CANVAS_SIZE, height: CANVAS_SIZE, borderRadius: '50%', overflow: 'hidden', cursor: 'grab' }}>
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
              style={{ display: 'block', touchAction: 'none' }}
            />
          </div>
        </div>

        {/* 缩放条 */}
        <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-mg-border/40">
          <button onClick={() => setScale((s) => Math.max(MIN_SCALE, s - 0.15))} className="p-1.5 rounded-md text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0 transition-colors cursor-pointer">
            <LuZoomOut size={16} />
          </button>
          <input
            type="range"
            min={MIN_SCALE * 100}
            max={MAX_SCALE * 100}
            value={scale * 100}
            onChange={(e) => setScale(Number(e.target.value) / 100)}
            className="flex-1 h-1 accent-brand-base cursor-pointer"
          />
          <button onClick={() => setScale((s) => Math.min(MAX_SCALE, s + 0.15))} className="p-1.5 rounded-md text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0 transition-colors cursor-pointer">
            <LuZoomIn size={16} />
          </button>
        </div>

        {/* 操作 */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-mg-border">
          <Button variant="outline" onClick={onCancel} className="h-8 px-4 text-xs rounded-lg">
            {t('common.cancel')}
          </Button>
          <Button variant="default" onClick={handleConfirm} className="h-8 px-4 text-xs rounded-lg font-semibold">
            {t('common.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
