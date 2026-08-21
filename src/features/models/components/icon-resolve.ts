/**
 * 图标解析的纯逻辑（需求方#791）。
 *
 * 为什么单独一个文件：`vendor-icons.tsx` 里 import 了 @lobehub/icons，而它的 es 产物
 * 含目录式 import，Node 的 ESM 解析器不支持 —— 任何测试只要导入 vendor-icons 就在
 * 导入期整文件挂掉。绕过它只有 vitest 的 server.deps.inline，实测会把全量测试从
 * 37s 拉到 81s（每次多付 44 秒，全组都要付），不值得。
 *
 * 所以把「判断能不能当组件渲染」「按名字挑组件」「厂商名归一」这些**不依赖 lobehub**
 * 的部分放这里，用 React.memo 替身即可完整覆盖 —— 替身与真图标的运行时形状一致
 * （都是带 $$typeof 的对象）。JSX 与真实图标表留在 vendor-icons.tsx。
 */

/**
 * 能不能当 React 组件渲染。
 *
 * **不能用 `typeof x === 'function'` 判。** lobehub 的图标是 `React.memo(...)`，
 * 运行时 `typeof` 是 `'object'`（实测 `Qwen.Color.$$typeof === Symbol(react.memo)`）。
 * 原先 resolveLobehubIcon 里那道 function 守卫把**每一个** lobehub 图标都拒掉，
 * 于是它恒返回 null —— ModelIcon 四层兜底里的第一层（后端 logo_url）自始至终是
 * 死代码。平时被第三层「模型名前缀推断」掩盖，只有当名字推断落到**另一个厂商**
 * 时才暴露：text-embedding-v4（vendor=alibaba、logo_url=Qwen.Color）命中前缀表的
 * ['text-embedding','openai']，于是通义千问的模型渲染出 OpenAI 的 logo（#791）。
 */
export function isRenderableComponent(x: unknown): boolean {
  if (typeof x === 'function') return true // 普通函数组件 / class 组件
  // memo / forwardRef / lazy 都是带 $$typeof 的对象
  return typeof x === 'object' && x !== null && '$$typeof' in x
}

/** 注册表条目：组件本身，外挂若干变体（Color / Mono / Text / Avatar）。 */
export type IconRegistry = Record<string, unknown>

/**
 * 按后端 logo_url 从注册表挑出可渲染的组件。
 * 格式：「图标名」或「图标名.变体」。名字大小写不敏感（后端同一厂商写过
 * Minimax / MiniMax 两种，catalog 实测两者都在数据里）；变体名保持原样。
 * 未知变体回落到基础图标 —— 给基础图标比不给图标好。
 * 挑不到返回 null，交由调用方走 vendor / 文字兜底。
 */
export function pickIconComponent(registry: IconRegistry, logoRef: string | null | undefined): unknown | null {
  if (!logoRef) return null
  const [name, variant] = logoRef.split('.')
  if (!name) return null

  let mod = registry[name]
  if (mod === undefined) {
    const lower = name.toLowerCase()
    const hit = Object.keys(registry).find((k) => k.toLowerCase() === lower)
    mod = hit ? registry[hit] : undefined
  }
  if (mod === undefined || mod === null) return null

  // 变体只在「确实可渲染」时采用：注册表上还挂着 colorPrimary / title 这类字符串属性，
  // 后端若写出 Qwen.colorPrimary，取到字符串就没法渲染 —— 此时回落基础图标，
  // 比整个返回 null（连图标都没有）更好。
  const bag = mod as Record<string, unknown>
  const variantComp = variant ? bag[variant] : undefined
  const comp = isRenderableComponent(variantComp) ? variantComp : mod
  return isRenderableComponent(comp) ? comp : null
}

/**
 * 别名 → 规范品牌：多个厂商 key 实际是同一品牌/同一 logo，
 * 去重时需收敛到同一品牌，避免头部排出多个相同/同家图标。
 */
export const BRAND_ALIASES: Record<string, string> = {
  claude: 'anthropic',
  chatgpt: 'openai',
  llama: 'meta',
  kimi: 'moonshot',
  ernie: 'baidu',
  seedream: 'doubao',
  skylark: 'doubao',
  bytedance: 'doubao',
  ark: 'doubao',
  // 阿里系三个 vendor 写法收敛到 qwen（后端 vendor 实际写 alibaba，见 #791）
  alibaba: 'qwen',
  aliyun: 'qwen',
  tongyi: 'qwen',
}

/**
 * 从候选 key 列表里解析厂商名命中的 key：先精确命中，再做包含匹配
 * （如 "OpenAI GPT-4" 命中 openai）。未命中返回 null。
 * key 列表由调用方传入（= ICON_FACTORY 的键），避免本文件依赖 JSX 那侧。
 */
export function resolveVendorKeyFrom(keys: string[], vendor: string | null | undefined): string | null {
  if (!vendor) return null
  const v = vendor.toLowerCase()
  if (keys.includes(v)) return v
  return keys.find((k) => v.includes(k)) ?? null
}
