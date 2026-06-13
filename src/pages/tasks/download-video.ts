/**
 * 视频产物下载。
 *
 * 视频在网关域、控制台在另一域，<a download> 对跨域 URL 被浏览器忽略（只会打开播放）。
 * 故 fetch 成 blob 再用对象 URL 触发真实保存；fetch 跨域需 CORS 头，拿不到时降级为新标签打开。
 */

/** 从产物地址推断文件名：取末段路径，无扩展名则补 .mp4 */
function inferFilename(url: string, fallbackBase: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop() || ''
    if (last && /\.\w{2,4}$/.test(last)) return last
  } catch { /* ignore，用兜底名 */ }
  return `${fallbackBase}.mp4`
}

/**
 * 下载视频。返回 'saved'（真实保存成功）| 'opened'（降级为新标签打开）。
 * @param url 产物地址
 * @param fallbackBase 推断不出文件名时的基名（如 task id）
 */
export async function downloadVideo(url: string, fallbackBase: string): Promise<'saved' | 'opened'> {
  const filename = inferFilename(url, fallbackBase)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objUrl)
    return 'saved'
  } catch {
    // CORS 不通 / 网络失败 → 退回新标签打开（浏览器自行播放或下载）
    window.open(url, '_blank', 'noopener')
    return 'opened'
  }
}
