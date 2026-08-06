/**
 * 聊天消息列表的不可变 patch 工具（与具体消息类型无关）
 *
 * 解决的问题：流式/异步回填时反复出现「复制数组 → 定位那条消息 → 展开合并字段」
 * 这段模板，单模型页、对比页、平台助手加起来十几处内联，消息结构一变就要逐处改。
 *
 * 两种定位方式对应两种场景：
 *   - patchLastAssistant：流式回填。回复永远是列表最后一条，边收 delta 边改它。
 *   - patchMessageById：请求发出后 UI 上还能继续追加消息的场景（平台助手），
 *     位置不固定，只能按 id 找。
 *
 * 约定：定位不到目标时原样返回入参数组（同一引用），不制造无意义的重渲染。
 */

/** patch 可以直接给字段，也可以给一个函数按当前值算（如 content 累加 delta） */
type Patch<T> = Partial<T> | ((current: T) => Partial<T>)

function resolvePatch<T>(patch: Patch<T>, current: T): Partial<T> {
  return typeof patch === 'function' ? (patch as (c: T) => Partial<T>)(current) : patch
}

/**
 * 改列表里最后一条 assistant 消息（流式回填的标准姿势）。
 * 最后一条不是 assistant（用户刚发完还没插回复位、或列表为空）时不动。
 */
export function patchLastAssistant<T extends { role: string }>(
  list: T[],
  patch: Patch<T>,
  role: string = 'assistant',
): T[] {
  const last = list[list.length - 1]
  if (last?.role !== role) return list
  return [...list.slice(0, -1), { ...last, ...resolvePatch(patch, last) }]
}

/** 按 id 改某条消息；找不到该 id 时不动 */
export function patchMessageById<T extends { id: string }>(
  list: T[],
  id: string,
  patch: Patch<T>,
): T[] {
  let hit = false
  const next = list.map((item) => {
    if (item.id !== id) return item
    hit = true
    return { ...item, ...resolvePatch(patch, item) }
  })
  return hit ? next : list
}
