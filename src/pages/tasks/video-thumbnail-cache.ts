/**
 * 视频首帧缩略图：抓帧 + 按 ID 缓存
 *
 * 列表里每个视频任务要显示首帧封面。后端无封面字段，故前端用离屏 <video> + canvas
 * 抓首帧导出为 dataURL，按 gateway_request_id 缓存，避免翻页/筛选/滚动时重复抓。
 *
 * CORS 命门：canvas.toDataURL 要求视频带跨域头（Access-Control-Allow-Origin）+
 * <video crossorigin>，否则画布被污染抛 SecurityError。抓不到时返回 null（缓存哨兵），
 * 调用方降级为 <video> 直接显示首帧（不导出、不缓存）。
 */

import { useEffect, useState } from 'react'

// id → dataURL（成功）| null（抓过但失败，哨兵，避免本会话反复重试）
const cache = new Map<string, string | null>()
// id → 进行中的抓取 Promise，去重并发请求
const inflight = new Map<string, Promise<string | null>>()

/** 同步读缓存：undefined=未抓过，null=抓过失败，string=成功 */
export function getCachedThumbnail(id: string): string | null | undefined {
  return cache.get(id)
}

const CAPTURE_TIMEOUT_MS = 8000
const SEEK_TIME = 0.1 // 取 0.1s 处的帧，规避 0s 可能是黑帧/未解码

function capture(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'
    video.playsInline = true

    let settled = false
    const finish = (val: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load() // 中断下载，释放资源
      resolve(val)
    }

    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 180
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(null)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.7)) // CORS 污染在此抛 SecurityError
      } catch {
        finish(null)
      }
    }

    video.addEventListener('loadeddata', () => {
      try { video.currentTime = SEEK_TIME } catch { finish(null) }
    }, { once: true })
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', () => finish(null), { once: true })
    // 部分视频不触发 seeked，超时兜底（finish 在事件回调里调用，届时 timer 已初始化）
    const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS)

    video.src = `${url}#t=${SEEK_TIME}`
  })
}

/** 抓取并缓存首帧；命中缓存直接返回，并发同 ID 复用同一 Promise */
export function captureThumbnail(id: string, url: string): Promise<string | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null)
  const existing = inflight.get(id)
  if (existing) return existing
  const p = capture(url).then((val) => {
    cache.set(id, val)
    inflight.delete(id)
    return val
  })
  inflight.set(id, p)
  return p
}

/**
 * 取视频首帧缩略图。返回值：undefined=抓取中，null=抓取失败（调用方降级），string=dataURL。
 * id 随组件实例稳定（列表 key=gateway_request_id），故惰性初值即可命中缓存，无需在 effect 同步 setState。
 */
export function useVideoThumbnail(id: string, url: string | null): string | null | undefined {
  const [thumb, setThumb] = useState<string | null | undefined>(() =>
    url ? getCachedThumbnail(id) : undefined
  )

  useEffect(() => {
    if (!url) return
    if (getCachedThumbnail(id) !== undefined) return // 已有缓存，惰性初值已取到
    let alive = true
    captureThumbnail(id, url).then((val) => { if (alive) setThumb(val) })
    return () => { alive = false }
  }, [id, url])

  return thumb
}
