/**
 * 流式请求的中断编排（keyed AbortController 注册表）
 *
 * 解决的问题：单模型页 / 对比页 / 平台助手三处各写了一份「abort 旧的 → new
 * AbortController → 存 ref → 卸载时 abort → catch 里判 AbortError」，形状一样但
 * 各自维护，加一列、改一处语义就要同步三个文件。
 *
 * 边界（为什么只管 controller，不管 isStreaming）：
 *   三处的「进行中」状态形态不同——单模型页是一个 boolean state、对比页在每列
 *   ColumnState.streaming 里（要按列渲染）、平台助手复用 isLoading（含非流式分支）。
 *   把 UI 状态一起收进来，对比页就用不了。所以本 hook 只负责 AbortController 的
 *   生命周期，业务层照旧自己决定怎么表达「进行中」。
 *
 * 用法：
 *   const stream = useStreamingController()          // 单实例
 *   const signal = stream.begin()                    // 自动中断上一次
 *   stream.abort()                                   // 停止按钮
 *
 *   const stream = useStreamingController<number>()  // 多实例（对比页按列索引）
 *   const signal = stream.begin(idx)
 *   stream.abort(idx) / stream.abortAll()
 *
 * 卸载时自动 abortAll，业务层不需要再写清理 effect。
 */
import { useCallback, useEffect, useRef } from 'react'

/** 单实例调用（begin() 不传 key）时的内部占位 key */
const SINGLE = '__single__'

export interface StreamingController<K> {
  /** 开一次新请求：先中断该 key 上一次未完成的请求，再返回新的 signal */
  begin: (key?: K) => AbortSignal
  /** 中断某个 key 的在途请求（无在途请求时静默返回） */
  abort: (key?: K) => void
  /** 中断全部在途请求（切会话/重建列/退出页面） */
  abortAll: () => void
  /** 该 key 是否有未中断的在途请求 */
  isActive: (key?: K) => boolean
}

export function useStreamingController<K extends string | number = string>(): StreamingController<K> {
  const controllersRef = useRef(new Map<K | typeof SINGLE, AbortController>())

  const abort = useCallback((key?: K) => {
    const k = key ?? SINGLE
    controllersRef.current.get(k)?.abort()
    controllersRef.current.delete(k)
  }, [])

  const abortAll = useCallback(() => {
    controllersRef.current.forEach((controller) => controller.abort())
    controllersRef.current.clear()
  }, [])

  const begin = useCallback((key?: K): AbortSignal => {
    const k = key ?? SINGLE
    // 同一 key 上一次还在跑就先掐掉：同一列/同一会话同时只允许一个在途请求
    controllersRef.current.get(k)?.abort()
    const controller = new AbortController()
    controllersRef.current.set(k, controller)
    return controller.signal
  }, [])

  const isActive = useCallback((key?: K) => {
    const controller = controllersRef.current.get(key ?? SINGLE)
    return !!controller && !controller.signal.aborted
  }, [])

  useEffect(() => {
    const controllers = controllersRef.current
    return () => {
      controllers.forEach((controller) => controller.abort())
      controllers.clear()
    }
  }, [])

  return { begin, abort, abortAll, isActive }
}

/**
 * 是否是「请求被主动中断」而非真实错误。
 * 中断是用户点停止/切走页面的正常路径，catch 到它要静默返回，不能渲染成报错气泡。
 */
export function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null | undefined)?.name === 'AbortError'
}
