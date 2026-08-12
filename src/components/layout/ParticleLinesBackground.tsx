import React, { useEffect, useRef } from 'react'

interface WaveConfig {
  yPercent: number      // 屏幕高度百分比
  amplitude: number     // 振幅
  length: number        // 波长系数
  speed: number         // 缓动速度
  angle: number         // 初始相位
  opacity: number       // 基础透明度
  lineWidth: number     // 线条粗细
}

interface Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  alpha: number
  maxAlpha: number
  phase: number
  phaseSpeed: number
}

interface RGB { r: number; g: number; b: number }

// 十六进制 → RGB（只在换色时解析一次，热路径不再 parseInt）
function parseHex(hex: string): RGB {
  const clean = hex.trim().replace('#', '')
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    }
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    }
  }
  return { r: 103, g: 67, b: 253 }
}

// 预渲染一张发光粒子精灵，替代每帧的 ctx.shadowBlur（canvas 最昂贵的操作）
function makeGlowSprite({ r, g, b }: RGB): HTMLCanvasElement {
  const S = 32
  const c = document.createElement('canvas')
  c.width = c.height = S
  const cx = c.getContext('2d')!
  const grad = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`)
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`)
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
  cx.fillStyle = grad
  cx.fillRect(0, 0, S, S)
  return c
}

export const ParticleLinesBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    // ── 主题色缓存：挂载读一次，仅在 <html> 属性变化时重建 rgb/精灵/渐变 ──
    const readThemeColor = (): string => {
      const color = window.getComputedStyle(document.body).getPropertyValue('--brand-base').trim()
      return color || '#6743fd'
    }
    let cachedBrandColor = readThemeColor()
    let rgb = parseHex(cachedBrandColor)
    let glowSprite = makeGlowSprite(rgb)
    let needsRebuild = false // 颜色或尺寸变化时置位，下一帧重建渐变/精灵

    const themeObserver = new MutationObserver(() => {
      const next = readThemeColor()
      if (next !== cachedBrandColor) {
        cachedBrandColor = next
        rgb = parseHex(next)
        glowSprite = makeGlowSprite(rgb)
        needsRebuild = true
      }
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-market', 'theme-mode', 'data-theme', 'class'],
    })

    const waves: WaveConfig[] = [
      { yPercent: 0.88, amplitude: 28, length: 0.003, speed: 0.004, angle: 0, opacity: 0.16, lineWidth: 1.2 },
      { yPercent: 0.86, amplitude: 18, length: 0.004, speed: -0.005, angle: Math.PI / 3, opacity: 0.10, lineWidth: 0.9 },
      { yPercent: 0.90, amplitude: 22, length: 0.002, speed: 0.003, angle: Math.PI / 1.5, opacity: 0.06, lineWidth: 0.8 },
    ]

    // 波浪水平渐变只依赖 width + 颜色，预建缓存，不每帧 createLinearGradient
    let waveGradients: CanvasGradient[] = []
    const buildWaveGradients = () => {
      const { r, g, b } = rgb
      waveGradients = waves.map((wave) => {
        const grad = ctx.createLinearGradient(0, 0, width, 0)
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`)
        grad.addColorStop(0.25, `rgba(${r},${g},${b},${wave.opacity})`)
        grad.addColorStop(0.75, `rgba(${r},${g},${b},${wave.opacity})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        return grad
      })
    }
    buildWaveGradients()

    const particleCount = 35
    const particles: Particle[] = []
    const createParticle = (initYAtBottom = false): Particle => ({
      x: Math.random() * width,
      y: initYAtBottom ? height + Math.random() * 20 : Math.random() * height,
      size: 0.6 + Math.random() * 1.4,
      speedX: (Math.random() - 0.5) * 0.15,
      speedY: -(0.1 + Math.random() * 0.25),
      alpha: 0,
      maxAlpha: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.005 + Math.random() * 0.015,
    })
    for (let i = 0; i < particleCount; i++) particles.push(createParticle(false))

    const handleResize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      needsRebuild = true
    }
    window.addEventListener('resize', handleResize)

    const drawFrame = () => {
      if (needsRebuild) {
        buildWaveGradients()
        needsRebuild = false
      }
      ctx.clearRect(0, 0, width, height)

      // 1. 流体波浪曲线（复用缓存渐变）
      waves.forEach((wave, i) => {
        ctx.beginPath()
        ctx.lineWidth = wave.lineWidth
        ctx.strokeStyle = waveGradients[i]
        const baseY = height * wave.yPercent
        for (let x = 0; x < width; x += 6) {
          const y = baseY + Math.sin(x * wave.length + wave.angle) * wave.amplitude
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        wave.angle += wave.speed
      })

      // 2. 发光粒子：drawImage 预渲染精灵 + globalAlpha，替代 shadowBlur
      for (let idx = 0; idx < particles.length; idx++) {
        const p = particles[idx]
        p.x += p.speedX + (Math.random() - 0.5) * 0.08
        p.y += p.speedY
        p.phase += p.phaseSpeed
        p.alpha = Math.max(0.02, p.maxAlpha * (0.6 + Math.sin(p.phase) * 0.4))

        if (p.y < -10) { particles[idx] = createParticle(true); continue }
        if (p.x < -10 || p.x > width + 10) p.x = Math.random() * width

        const d = p.size * 6 // 精灵覆盖发光半径
        ctx.globalAlpha = p.alpha
        ctx.drawImage(glowSprite, p.x - d / 2, p.y - d / 2, d, d)
      }
      ctx.globalAlpha = 1
    }

    // prefers-reduced-motion：只画一帧静态，不进动画循环
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawFrame()
      return () => {
        window.removeEventListener('resize', handleResize)
        themeObserver.disconnect()
      }
    }

    // 节流到 ~30fps（装饰动画，半帧率肉眼无差，CPU 减半）
    const frameInterval = 1000 / 30
    let lastFrame = 0
    const render = (now: number) => {
      animationFrameId = requestAnimationFrame(render)
      if (document.visibilityState === 'hidden') return
      if (now - lastFrame < frameInterval) return
      lastFrame = now
      drawFrame()
    }
    animationFrameId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      themeObserver.disconnect()
    }
  }, [])

  return (
    <canvas
      className="particle-lines-background"
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 'var(--mg-z-base)',
      }}
    />
  )
}
