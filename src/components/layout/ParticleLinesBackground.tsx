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

// 十六进制转 RGBA 辅助函数
function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.trim().replace('#', '')
  let r = 103
  let g = 67
  let b = 253
  
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16)
    g = parseInt(cleanHex[1] + cleanHex[1], 16)
    b = parseInt(cleanHex[2] + cleanHex[2], 16)
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16)
    g = parseInt(cleanHex.substring(2, 4), 16)
    b = parseInt(cleanHex.substring(4, 6), 16)
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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

    // 动态获取当前的品牌色
    const getThemeColor = (): string => {
      const computed = window.getComputedStyle(document.body)
      const color = computed.getPropertyValue('--brand-base').trim()
      return color || '#6743fd'
    }

    // 3条极细起伏曲线的配置 (专注于中下部区域流淌，类似原本的 bottom-shimmer)
    const waves: WaveConfig[] = [
      {
        yPercent: 0.88,
        amplitude: 28,
        length: 0.003,
        speed: 0.004,
        angle: 0,
        opacity: 0.16,
        lineWidth: 1.2,
      },
      {
        yPercent: 0.86,
        amplitude: 18,
        length: 0.004,
        speed: -0.005,
        angle: Math.PI / 3,
        opacity: 0.10,
        lineWidth: 0.9,
      },
      {
        yPercent: 0.90,
        amplitude: 22,
        length: 0.002,
        speed: 0.003,
        angle: Math.PI / 1.5,
        opacity: 0.06,
        lineWidth: 0.8,
      },
    ]

    // 初始化 35 个微弱粒子
    const particleCount = 35
    const particles: Particle[] = []

    const createParticle = (initYAtBottom = false): Particle => {
      return {
        x: Math.random() * width,
        y: initYAtBottom ? height + Math.random() * 20 : Math.random() * height,
        size: 0.6 + Math.random() * 1.4, // 0.6px ~ 2px
        speedX: (Math.random() - 0.5) * 0.15, // 极慢横向
        speedY: -(0.1 + Math.random() * 0.25), // 极慢向上浮动
        alpha: 0,
        maxAlpha: 0.15 + Math.random() * 0.35, // 保持透明度克制
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.005 + Math.random() * 0.015,
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(createParticle(false))
    }

    // 窗口尺寸自适应
    const handleResize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // 主渲染循环
    const render = () => {
      // 检查页面可见性，如果页面在后台运行，暂停绘制以节省 CPU 消耗
      if (document.visibilityState === 'hidden') {
        animationFrameId = requestAnimationFrame(render)
        return
      }

      ctx.clearRect(0, 0, width, height)

      const brandColor = getThemeColor()

      // 1. 绘制极细的流体波浪曲线
      waves.forEach((wave) => {
        ctx.beginPath()
        ctx.lineWidth = wave.lineWidth
        
        // 创建水平渐变，让曲线两端淡入淡出，极其优雅
        const gradient = ctx.createLinearGradient(0, 0, width, 0)
        gradient.addColorStop(0, hexToRgba(brandColor, 0))
        gradient.addColorStop(0.25, hexToRgba(brandColor, wave.opacity))
        gradient.addColorStop(0.75, hexToRgba(brandColor, wave.opacity))
        gradient.addColorStop(1, hexToRgba(brandColor, 0))
        
        ctx.strokeStyle = gradient

        const baseY = height * wave.yPercent
        
        for (let x = 0; x < width; x += 4) {
          const y = baseY + Math.sin(x * wave.length + wave.angle) * wave.amplitude
          if (x === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
        
        // 更新相位角度使线条流动
        wave.angle += wave.speed
      })

      // 2. 绘制飘散的发光粒子
      particles.forEach((p, idx) => {
        // 浮动与布朗运动
        p.x += p.x < 0 || p.x > width ? -p.x : p.speedX + (Math.random() - 0.5) * 0.08
        p.y += p.speedY

        // 忽明忽暗的闪烁特效
        p.phase += p.phaseSpeed
        const sinVal = Math.sin(p.phase)
        p.alpha = Math.max(0.02, p.maxAlpha * (0.6 + sinVal * 0.4))

        // 重新循环边界处理
        if (p.y < -10) {
          particles[idx] = createParticle(true)
          return
        }
        if (p.x < -10 || p.x > width + 10) {
          p.x = Math.random() * width
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)

        // 针对粒子添加微微的玻璃发光阴影效果
        ctx.shadowBlur = 3
        ctx.shadowColor = brandColor
        ctx.fillStyle = hexToRgba(brandColor, p.alpha)
        ctx.fill()
        
        // 重置 shadow 以免影响后续绘制
        ctx.shadowBlur = 0
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
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
        zIndex: 0,
      }}
    />
  )
}
