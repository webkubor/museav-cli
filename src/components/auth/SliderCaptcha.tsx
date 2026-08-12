/**
 * 自研滑块拼图人机校验（注册页前置防刷）。
 *
 * 定位：前端轻量防刷「减速带」，挡低级脚本/误触；**非安全边界**。
 * 直连接口（不走页面）可绕过，真正拦截依赖后端频控 + proof 校验（见看板 #234）。
 * 通过时回传 captcha proof（拖动轨迹摘要 + nonce + 时间戳），供后端就绪后校验。
 *
 * 双市场自研（不接 Turnstile/hCaptcha）：国内大陆访问第三方挑战不稳定，国内外一套一致。
 * 背景用本地真实图片（public/modelgo/*），拼块为图片切片，质感对齐真实验证码。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LuCheck, LuChevronsRight, LuRefreshCw } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'

const W = 320
const H = 150
const PIECE = 44
const RADIUS = 8
const TOLERANCE = 7
// 手柄宽度按拼块占比走，保证手柄与拼块行程 1:1（任意显示宽度下触点都对齐）
const HANDLE_PCT = (PIECE / W) * 100

// 本地打包的背景图池（同源，canvas 绘制无跨域/CSP 问题），随机抽一张作底图
const IMAGES = [
  '/modelgo/model-experience-all.webp',
  '/modelgo/model-experience-reasoning.webp',
  '/modelgo/model-experience-multimodal.webp',
  '/modelgo/model-experience-image.webp',
  '/modelgo/model-experience-video.webp',
  '/modelgo/model-experience-text.webp',
  '/modelgo/model-experience-code.webp',
]

type Status = 'idle' | 'dragging' | 'success' | 'fail'

interface Puzzle {
  src: string
  gap: { x: number; y: number }
}

interface SliderCaptchaProps {
  /** 校验状态变化：通过时带 proof，重置时 verified=false */
  onChange: (verified: boolean, proof?: string) => void
  /** 禁用：不可拖动、灰显。「能否使用」是调用方的业务策略，组件只负责呈现 */
  disabled?: boolean
  /** 禁用态提示文案，由调用方按业务给出（组件不预设任何业务语义） */
  lockedHint?: string
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function genPuzzle(): Puzzle {
  return {
    src: IMAGES[Math.floor(Math.random() * IMAGES.length)],
    gap: {
      x: Math.round(W * 0.45 + Math.random() * (W * 0.42 - PIECE)),
      y: Math.round(12 + Math.random() * (H - PIECE - 24)),
    },
  }
}

export function SliderCaptcha({ onChange, disabled = false, lockedHint }: SliderCaptchaProps) {
  const { t } = useTranslation('account')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const [puzzle, setPuzzle] = useState(genPuzzle)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const pieceXRef = useRef(0)
  const trailRef = useRef<{ x: number; t: number }[]>([])
  const startTsRef = useRef(0)
  const draggingRef = useRef(false)

  const [status, setStatus] = useState<Status>('idle')
  const [ratio, setRatio] = useState(0)

  // 加载底图（onload 异步回调里 setState，非 effect 同步）
  useEffect(() => {
    let alive = true
    const image = new Image()
    image.onload = () => { if (alive) setImg(image) }
    image.src = puzzle.src
    return () => { alive = false }
  }, [puzzle.src])

  const regenerate = useCallback(() => {
    // 不清空 img：旧图保留到新图加载完，避免刷新瞬间露出白底闪烁
    setPuzzle(genPuzzle())
    pieceXRef.current = 0
    trailRef.current = []
    setRatio(0)
    setStatus('idle')
    onChange(false)
  }, [onChange])

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // 底图（cover 适配）；未加载时给个占位底色
    let dx = 0, dy = 0, dw = W, dh = H
    if (img && img.width) {
      const ar = img.width / img.height
      if (ar > W / H) { dh = H; dw = H * ar } else { dw = W; dh = W / ar }
      dx = (W - dw) / 2; dy = (H - dh) / 2
      ctx.drawImage(img, dx, dy, dw, dh)
    } else {
      // 占位底（首图加载前）：深色品牌调渐变，避免裸白框
      const ph = ctx.createLinearGradient(0, 0, W, H)
      ph.addColorStop(0, '#2f335a')
      ph.addColorStop(1, '#23263f')
      ctx.fillStyle = ph
      ctx.fillRect(0, 0, W, H)
    }

    const { x: gapX, y: gapY } = puzzle.gap
    // 缺口：暗色凹槽 + 边缘高光，做出凹陷感
    ctx.save()
    roundRect(ctx, gapX, gapY, PIECE, PIECE, RADIUS)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.stroke()
    roundRect(ctx, gapX + 0.8, gapY + 0.8, PIECE - 1.6, PIECE - 1.6, RADIUS - 1)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.stroke()
    ctx.restore()

    // 拼块：图片切片（与缺口同内容）+ 投影 + 高光描边
    const px = pieceXRef.current
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = status === 'dragging' ? 14 : 8 // 拖动时投影加深，做出"抬起"手感
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 3
    roundRect(ctx, px, gapY, PIECE, PIECE, RADIUS)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.restore()

    ctx.save()
    roundRect(ctx, px, gapY, PIECE, PIECE, RADIUS)
    ctx.clip()
    if (img && img.width) {
      // 整图按相同 cover 变换、再水平平移 (px-gapX)，使缺口处内容落到拼块上
      ctx.drawImage(img, dx + (px - gapX), dy, dw, dh)
    } else {
      ctx.fillStyle = '#cdd2e4'
      ctx.fillRect(px, gapY, PIECE, PIECE)
    }
    ctx.restore()

    // 边缘：先一道暗描边垫底，再一道亮描边，保证在任意底图上都清晰立体
    ctx.save()
    roundRect(ctx, px, gapY, PIECE, PIECE, RADIUS)
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'
    ctx.stroke()
    roundRect(ctx, px + 0.6, gapY + 0.6, PIECE - 1.2, PIECE - 1.2, RADIUS - 1)
    ctx.lineWidth = 1
    ctx.strokeStyle =
      status === 'success' ? '#1d9e75' : status === 'fail' ? '#e24b4a' : 'rgba(255,255,255,0.95)'
    ctx.stroke()
    // 左上高光，玻璃质感
    const hl = ctx.createLinearGradient(px, gapY, px, gapY + PIECE)
    hl.addColorStop(0, 'rgba(255,255,255,0.35)')
    hl.addColorStop(0.4, 'rgba(255,255,255,0)')
    ctx.fillStyle = hl
    ctx.fill()
    if (status === 'success') {
      ctx.fillStyle = 'rgba(29,158,117,0.26)'
      ctx.fill()
    } else if (status === 'fail') {
      ctx.fillStyle = 'rgba(226,75,74,0.26)'
      ctx.fill()
    }
    ctx.restore()
  }, [img, puzzle, status])

  useEffect(() => { draw() }, [draw, ratio])

  const moveTo = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    pieceXRef.current = r * (W - PIECE)
    trailRef.current.push({ x: Math.round(r * 1000) / 1000, t: Math.round(performance.now() - startTsRef.current) })
    setRatio(r)
  }, [])

  const begin = useCallback((clientX: number) => {
    if (disabled || status === 'success') return
    draggingRef.current = true
    startTsRef.current = performance.now()
    trailRef.current = []
    setStatus('dragging')
    moveTo(clientX)
  }, [disabled, status, moveTo])

  const end = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const aligned = Math.abs(pieceXRef.current - puzzle.gap.x) <= TOLERANCE
    const duration = Math.round(performance.now() - startTsRef.current)
    if (aligned) {
      setStatus('success')
      const proof = btoa(
        JSON.stringify({
          g: Math.round(puzzle.gap.x),
          p: Math.round(pieceXRef.current),
          d: duration,
          n: trailRef.current.length,
          ts: Date.now(),
          nonce: Math.random().toString(36).slice(2, 12),
        })
      )
      onChange(true, proof)
    } else {
      setStatus('fail')
      onChange(false)
      const reset = () => { pieceXRef.current = 0; setRatio(0); setStatus('idle') }
      if (reducedMotion()) reset()
      else setTimeout(reset, 360)
    }
  }, [onChange, puzzle])

  useEffect(() => {
    const onMove = (e: PointerEvent) => { if (draggingRef.current) moveTo(e.clientX) }
    const onUp = () => end()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [moveTo, end])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || status === 'success') return
    const step = (1 / (W - PIECE)) * 3
    if (e.key === 'ArrowRight') { e.preventDefault(); const r = Math.min(1, ratio + step); pieceXRef.current = r * (W - PIECE); setRatio(r) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); const r = Math.max(0, ratio - step); pieceXRef.current = r * (W - PIECE); setRatio(r) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startTsRef.current = startTsRef.current || performance.now(); draggingRef.current = true; end() }
  }

  const failShake = status === 'fail' && !reducedMotion()

  return (
    <div className="mx-auto w-full max-w-[320px] select-none">
      <div
        className={`relative w-full overflow-hidden rounded-lg border border-mg-border bg-mg-fill-0 transition-opacity ${disabled && status !== 'success' ? 'opacity-50' : ''}`}
        style={{ aspectRatio: `${W} / ${H}`, animation: failShake ? 'sc-shake 0.36s' : undefined }}
      >
        <canvas ref={canvasRef} width={W} height={H} className="block h-full w-full" />
        <button
          type="button"
          onClick={regenerate}
          aria-label={t('account.auth.sliderCaptcha.refresh')}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/35 text-white/85 backdrop-blur-sm transition-colors hover:text-white"
        >
          <LuRefreshCw size={13} />
        </button>
      </div>

      {/* 滑块轨道 */}
      <div
        ref={trackRef}
        className="relative mt-2 h-9 w-full overflow-hidden rounded-full bg-mg-fill-0 outline-none transition-[box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-brand-base/40"
        style={
          status === 'success'
            ? {
                background: 'var(--mg-brand-gradient)',
                boxShadow: 'var(--mg-btn-primary-shadow-hover)',
              }
            : undefined
        }
        role="slider"
        aria-disabled={disabled}
        tabIndex={disabled || status === 'success' ? -1 : 0}
        aria-label={t('account.auth.sliderCaptcha.dragAria')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        onKeyDown={onKeyDown}
      >
        {/* 提示：未填完→引导填表；填完空闲→引导拖动 */}
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-mg-text-3 transition-opacity duration-200"
          style={{ opacity: status === 'success' ? 0 : disabled || status === 'idle' ? 1 : 0 }}
        >
          {disabled ? lockedHint ?? t('account.auth.sliderCaptcha.lockedHint') : t('account.auth.sliderCaptcha.dragHint')}
        </span>
        {/* 成功：蓝→紫渐变 + 一道扫光 + 居中文案（统一成功信号） */}
        {status === 'success' && (
          <>
            <span
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.5) 50%, transparent 65%)',
                animation: reducedMotion() ? undefined : 'sc-sheen 1.1s ease-out forwards',
              }}
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 text-xs font-bold text-white">
              <LuCheck size={13} /> {t('account.auth.sliderCaptcha.verified')}
            </span>
          </>
        )}
        {/* 进度填充：仅手柄身后的轨迹，末端落在手柄中心（被手柄盖住），不超出手柄 */}
        {status !== 'success' && (
          <span
            className={`absolute left-0 top-0 h-9 transition-colors ${status === 'fail' ? 'bg-mg-danger/15' : 'bg-brand-base/15'}`}
            style={{ width: `calc(${ratio} * (100% - ${HANDLE_PCT}%) + ${HANDLE_PCT / 2}%)` }}
          />
        )}
        {/* 手柄（成功后隐藏，绿条只留居中文案，避免手柄压住文字） */}
        {status !== 'success' && (
          <button
            type="button"
            aria-hidden="true"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); begin(e.clientX) }}
            className={`absolute top-0 flex h-9 items-center justify-center rounded-full shadow-md transition-[background-color,color,transform] duration-150 active:scale-95 ${status === 'fail' ? 'bg-mg-danger text-white' : 'bg-mg-bg-0 text-brand-base'}`}
            style={{
              width: `${HANDLE_PCT}%`,
              left: `calc(${ratio} * (100% - ${HANDLE_PCT}%))`,
              cursor: disabled ? 'not-allowed' : status === 'dragging' ? 'grabbing' : 'grab',
              touchAction: 'none',
            }}
          >
            {status === 'fail' ? '✕' : <LuChevronsRight size={16} />}
          </button>
        )}
      </div>

      <style>{`@keyframes sc-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}@keyframes sc-sheen{from{transform:translateX(-100%)}to{transform:translateX(120%)}}`}</style>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export default SliderCaptcha
