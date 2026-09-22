/**
 * 返佣档位名的界面语言映射。
 *
 * 档位名是后端 DB 配置（#932 起档位阶梯全部来自接口，前端不许写死档位），接口只下发
 * 一个中文 `name`、没有 `name_en`。结果是英文站的 Referral Program 里「Commission
 * Tiers」整列打中文（国际站翻译适配 prd#1098 截图标注处）。
 *
 * 口径：
 * - 只做**展示层**翻译，不改 `name` 本身 —— 配色、`current` 判定、列表 key 一律仍用后端原值，
 *   免得翻译一改就把「哪档是当前档」判错；
 * - 只认已知的几个运营档位名；运营新配一个没收录的档位时**原样透出**，
 *   不允许出现空白或 raw key（宁可英文站看到中文档位名，也不能让档位整格消失）。
 * - 中文界面走语言包里的同名中文，值与后端一致，等于不变。
 */
import i18n from '@/i18n'

/** 后端已知档位名 → 语言包键。新增档位由运营在后台配置，这里收录不到就原样透出。 */
const TIER_NAME_KEY: Record<string, string> = {
  '普通伙伴': 'billing.referral.tierName.standard',
  '成长伙伴': 'billing.referral.tierName.growth',
  '核心伙伴': 'billing.referral.tierName.core',
  '战略伙伴': 'billing.referral.tierName.strategic',
}

/** 展示用档位名：已知档位按界面语言翻译，未知档位原样返回。 */
export function tierDisplayName(name?: string | null): string {
  const raw = (name ?? '').trim()
  if (!raw) return ''
  const key = TIER_NAME_KEY[raw]
  if (!key) return raw
  // defaultValue 兜底：billing 语言包是路由级懒加载，未加载时给后端原值而不是 raw key。
  return i18n.t(key, { defaultValue: raw })
}
