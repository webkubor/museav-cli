import type { CSSProperties } from 'react'

/**
 * 页面装饰星场 —— 与官网首屏同一份星场数据（36 颗），让控制台公开页
 * （模型广场 / 模型详情）和官网首页在视觉上呼应。
 *
 * 数据原样搬自官网 modelgo-web/src/sites/domestic/pages/shared/hero-stars.tsx，
 * 位置全用百分比，按容器尺寸自动铺开；两端逐颗一致，不各调各的。
 * 素材 public/decor/hero-star.svg 同样来自官网（本身即白色，不用滤镜染色 ——
 * brightness(0) invert(1) 那条链在 Safari 下会渲染成黑色）。
 *
 * 只做装饰：aria-hidden + pointer-events:none，不进无障碍树、不挡点击。
 */
export interface DecorStar {
  left: string
  top: string
  scale: number
  opacity: number
  rotate?: string
  x: string
  y: string
  x2: string
  y2: string
  duration: string
  delay: string
}

const STAR_SRC = '/decor/hero-star.svg'

/** 不导出：本文件只对外暴露组件，导出常量会打断 Fast Refresh（react-refresh/only-export-components） */
const DECOR_STARS: DecorStar[] = [
  // ── 原首页 --one … --twenty / 子页数组的 20 颗 ──
  { left: '15%', top: '27%', scale: 0.78, opacity: 0.46, rotate: '-18deg', x: '20px', y: '-22px', x2: '-14px', y2: '18px', duration: '18s', delay: '0s' },
  { left: '83%', top: '22%', scale: 0.58, opacity: 0.36, rotate: '14deg', x: '-18px', y: '20px', x2: '14px', y2: '-16px', duration: '21s', delay: '-5s' },
  { left: '24%', top: '80%', scale: 0.48, opacity: 0.3, rotate: '24deg', x: '18px', y: '18px', x2: '-18px', y2: '-12px', duration: '24s', delay: '-8s' },
  { left: '75%', top: '82%', scale: 0.68, opacity: 0.32, rotate: '-32deg', x: '-24px', y: '-14px', x2: '18px', y2: '18px', duration: '22s', delay: '-3s' },
  { left: '91%', top: '48%', scale: 0.42, opacity: 0.26, rotate: '8deg', x: '16px', y: '-12px', x2: '-12px', y2: '14px', duration: '26s', delay: '-11s' },
  { left: '8%', top: '48%', scale: 0.46, opacity: 0.28, rotate: '38deg', x: '-12px', y: '-18px', x2: '18px', y2: '10px', duration: '23s', delay: '-14s' },
  { left: '90%', top: '31%', scale: 0.72, opacity: 0.38, rotate: '-10deg', x: '18px', y: '16px', x2: '-20px', y2: '-16px', duration: '19s', delay: '-9s' },
  { left: '37%', top: '18%', scale: 0.36, opacity: 0.22, rotate: '18deg', x: '12px', y: '18px', x2: '-16px', y2: '-10px', duration: '27s', delay: '-18s' },
  { left: '63%', top: '19%', scale: 0.52, opacity: 0.3, rotate: '-26deg', x: '-18px', y: '12px', x2: '14px', y2: '-18px', duration: '25s', delay: '-6s' },
  { left: '42%', top: '85%', scale: 0.34, opacity: 0.22, rotate: '8deg', x: '14px', y: '-16px', x2: '-12px', y2: '14px', duration: '30s', delay: '-20s' },
  { left: '56%', top: '76%', scale: 0.44, opacity: 0.26, rotate: '30deg', x: '-14px', y: '-12px', x2: '18px', y2: '16px', duration: '28s', delay: '-16s' },
  { left: '94%', top: '73%', scale: 0.38, opacity: 0.24, rotate: '-36deg', x: '18px', y: '-10px', x2: '-18px', y2: '18px', duration: '32s', delay: '-24s' },
  { left: '5%', top: '19%', scale: 0.3, opacity: 0.22, rotate: '18deg', x: '-10px', y: '14px', x2: '14px', y2: '-12px', duration: '29s', delay: '-7s' },
  { left: '30%', top: '35%', scale: 0.4, opacity: 0.26, rotate: '-12deg', x: '16px', y: '-14px', x2: '-10px', y2: '16px', duration: '24s', delay: '-13s' },
  { left: '69%', top: '39%', scale: 0.28, opacity: 0.2, rotate: '26deg', x: '-14px', y: '-10px', x2: '12px', y2: '14px', duration: '31s', delay: '-19s' },
  { left: '11%', top: '69%', scale: 0.24, opacity: 0.18, rotate: '-42deg', x: '12px', y: '12px', x2: '-14px', y2: '-10px', duration: '34s', delay: '-27s' },
  { left: '86%', top: '64%', scale: 0.34, opacity: 0.24, rotate: '34deg', x: '14px', y: '-16px', x2: '-16px', y2: '12px', duration: '26s', delay: '-4s' },
  { left: '50%', top: '25%', scale: 0.22, opacity: 0.17, rotate: '-18deg', x: '-12px', y: '10px', x2: '12px', y2: '-14px', duration: '36s', delay: '-30s' },
  { left: '56%', top: '87%', scale: 0.26, opacity: 0.2, rotate: '12deg', x: '10px', y: '16px', x2: '-14px', y2: '-12px', duration: '33s', delay: '-21s' },
  { left: '97%', top: '18%', scale: 0.25, opacity: 0.19, rotate: '-30deg', x: '-10px', y: '-14px', x2: '15px', y2: '12px', duration: '38s', delay: '-25s' },

  // ── 原首页 HERO_EXTRA_STARS 的 16 颗补充星（right%/bottom% 已换算为 left%/top%）──
  { left: '6%', top: '18%', scale: 0.5, opacity: 0.4, x: '22px', y: '-20px', x2: '-16px', y2: '16px', duration: '20s', delay: '-2s' },
  { left: '30%', top: '14%', scale: 0.4, opacity: 0.32, x: '-18px', y: '18px', x2: '16px', y2: '-14px', duration: '25s', delay: '-7s' },
  { left: '46%', top: '10%', scale: 0.36, opacity: 0.28, x: '16px', y: '20px', x2: '-14px', y2: '-16px', duration: '27s', delay: '-12s' },
  { left: '68%', top: '13%', scale: 0.46, opacity: 0.36, x: '-20px', y: '-18px', x2: '18px', y2: '14px', duration: '22s', delay: '-4s' },
  { left: '94%', top: '20%', scale: 0.54, opacity: 0.42, x: '18px', y: '22px', x2: '-16px', y2: '-18px', duration: '19s', delay: '-9s' },
  { left: '12%', top: '40%', scale: 0.42, opacity: 0.3, x: '-16px', y: '-20px', x2: '18px', y2: '16px', duration: '24s', delay: '-6s' },
  { left: '87%', top: '42%', scale: 0.44, opacity: 0.34, x: '20px', y: '18px', x2: '-18px', y2: '-14px', duration: '23s', delay: '-13s' },
  { left: '4%', top: '62%', scale: 0.5, opacity: 0.38, x: '18px', y: '-22px', x2: '-16px', y2: '18px', duration: '21s', delay: '-3s' },
  { left: '95%', top: '64%', scale: 0.48, opacity: 0.36, x: '-22px', y: '16px', x2: '18px', y2: '-16px', duration: '26s', delay: '-10s' },
  { left: '20%', top: '90%', scale: 0.4, opacity: 0.3, x: '16px', y: '20px', x2: '-14px', y2: '-18px', duration: '24s', delay: '-15s' },
  { left: '40%', top: '93%', scale: 0.36, opacity: 0.26, x: '-16px', y: '-18px', x2: '16px', y2: '14px', duration: '28s', delay: '-5s' },
  { left: '66%', top: '91%', scale: 0.44, opacity: 0.32, x: '18px', y: '-16px', x2: '-18px', y2: '18px', duration: '22s', delay: '-11s' },
  { left: '80%', top: '88%', scale: 0.5, opacity: 0.38, x: '-18px', y: '20px', x2: '16px', y2: '-16px', duration: '20s', delay: '-8s' },
  { left: '52%', top: '30%', scale: 0.34, opacity: 0.24, x: '14px', y: '-16px', x2: '-14px', y2: '14px', duration: '29s', delay: '-14s' },
  { left: '54%', top: '34%', scale: 0.34, opacity: 0.24, x: '-14px', y: '16px', x2: '14px', y2: '-14px', duration: '27s', delay: '-1s' },
  { left: '2%', top: '38%', scale: 0.4, opacity: 0.3, x: '18px', y: '18px', x2: '-16px', y2: '-16px', duration: '23s', delay: '-16s' },]

export function DecorStarField({ className = '' }: { className?: string }) {
  return (
    <div className={`mg-decor-stars ${className}`} aria-hidden>
      {DECOR_STARS.map((star, index) => (
        <img
          alt=""
          className="mg-decor-star"
          key={`decor-star-${index}`}
          src={STAR_SRC}
          style={
            {
              left: star.left,
              top: star.top,
              '--mg-star-opacity': star.opacity,
              '--mg-star-rotate': star.rotate ?? '0deg',
              '--mg-star-scale': star.scale,
              '--mg-star-x': star.x,
              '--mg-star-y': star.y,
              '--mg-star-x2': star.x2,
              '--mg-star-y2': star.y2,
              animationDuration: star.duration,
              animationDelay: star.delay,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
