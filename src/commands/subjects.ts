/**
 * museav subjects（别名 ip）—— 「IP 主体」：被生成/被拍摄的那个东西，以及它名下的图。
 *
 * 为什么要有这一层：素材库里 5 张同一个角色的图彼此无关，系统不知道它们是同一个角色。
 * 主体就是那个「能被引用的实体」——出图时引用主体，而不是引用某一张图。
 *
 * 和 `projects assets` 的分工（两张表并存，不是重复实现）：
 *   projects assets → workspace_assets，项目素材列表（只有 cdn_url + tags）
 *   subjects        → subjects + assets，领域模型（主体归属、role、三视图）
 * 见 museav-manager/docs/asset-domain-model.md §5。
 *
 * 典型用法（武侠 IP 人物设定入库）：
 *   museav subjects create --project 江湖 --name '顾栖月' --kind person --persona virtual \
 *     --traits '{"发型":"长直发","脸型":"鹅蛋脸"}'
 *   museav subjects add-asset <id> ./顾栖月-正面.png --role view_front
 *   museav subjects add-asset <id> ./顾栖月-侧面.png --role view_side
 *   museav subjects show <id>          # 三视图一眼看全
 *
 * 服务端契约（别改服务端，照抄）：
 *   POST /api/subjects  { workspace_id, kind, name, traits?, persona_source? }
 *   POST /api/assets    { workspace_id, r2_key|url, subject_id?, role?, media_type?, name? }
 *   真源：museav-manager/functions/api/subjects.js 与 assets.js
 */
import type { StudioClient, Subject, SubjectKind, PersonaSource, AssetRole, DomainAsset } from '../client.js'
import { SUBJECT_KINDS, PERSONA_SOURCES, ASSET_ROLES, SUBJECT_MAX_NAME } from '../client.js'
import { resolveWorkspace } from './projects.js'

/**
 * 中台图库直链的域名（= 服务端 assets.js 的 REF_CDN_BASE，真源 museav-manager/shared/cdn-url.js）。
 * 服务端 toKey() 只认这个前缀：外站 http(s) 地址一律归一成 null 然后 400（登记了也取不回来）。
 * 本地先判一次，是为了把「外链收不了」这句话在**上传之前**说清楚。
 */
const REF_CDN_BASE = 'https://img.webkubor.online'

const KIND_ZH: Record<SubjectKind, string> = { product: '产品', person: '人物', scene: '场景', brand: '品牌' }
const PERSONA_ZH: Record<PersonaSource, string> = { real: '真人', virtual: '虚拟人' }
const ROLE_ZH: Record<AssetRole, string> = {
  raw: '原图',
  standard: '标准图',
  view_front: '正面',
  view_side: '侧面',
  view_back: '背面',
  output: '成品',
}
/** 三视图的展示顺序（人像设定最关心这三张，show 里单独分组置顶） */
const VIEW_ROLES: AssetRole[] = ['view_front', 'view_side', 'view_back']

const isKind = (v: string): v is SubjectKind => (SUBJECT_KINDS as readonly string[]).includes(v)
const isPersona = (v: string): v is PersonaSource => (PERSONA_SOURCES as readonly string[]).includes(v)
const isRole = (v: string): v is AssetRole => (ASSET_ROLES as readonly string[]).includes(v)

/** 非法枚举值一律中文报错，并把可选值列全——「unknown role」那种话对用户没有信息量 */
function assertKind(v: string): SubjectKind {
  if (!isKind(v)) throw new Error(`主体类型只能是 ${SUBJECT_KINDS.join(' / ')}（${SUBJECT_KINDS.map((k) => KIND_ZH[k]).join('/')}），收到「${v}」`)
  return v
}

function assertPersona(v: string): PersonaSource {
  if (!isPersona(v)) throw new Error(`形象来源只能是 ${PERSONA_SOURCES.join(' / ')}（真人/虚拟人），收到「${v}」`)
  return v
}

function assertRole(v: string): AssetRole {
  if (!isRole(v)) {
    throw new Error(
      `素材角色只能是 ${ASSET_ROLES.join(' / ')}\n` +
      `  人像三视图用 ${VIEW_ROLES.join(' / ')}（正面/侧面/背面），没分类的用 raw`,
    )
  }
  return v
}

/** 与服务端 badName 同口径：trim 后非空且 ≤60 字（超了服务端也 400，本地拦是为了不白跑一趟） */
function assertName(name: string): string {
  const t = String(name ?? '').trim()
  if (!t) throw new Error('--name 必填（主体名字，1–60 字）')
  if (t.length > SUBJECT_MAX_NAME) throw new Error(`名字最多 ${SUBJECT_MAX_NAME} 个字，当前 ${t.length} 个`)
  return t
}

/** --traits 收 JSON 对象：数组/字符串/null 都不是「特征」，服务端也会拒 */
function parseTraits(raw?: string): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`--traits 不是合法 JSON，应形如 '{"发型":"长直发"}'，收到「${raw}」`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--traits 必须是 JSON 对象（键值对），应形如 '{"发型":"长直发"}'，收到「${raw}」`)
  }
  return parsed as Record<string, unknown>
}

/**
 * 服务端 toKey() 的本地抄本：中台直链 → 收；裸 key（refs/…）→ 收；外站 http(s) → 不收。
 * 只对「用户手输的 --url」和「我们自己上传回来的直链」各判一次，判据与服务端同一套。
 */
function assertPlatformRefUrl(value: string, from: string): string {
  const v = String(value ?? '').trim()
  if (!v) throw new Error('缺少图片地址')
  if (/^https?:\/\//i.test(v) && !v.startsWith(`${REF_CDN_BASE}/`)) {
    throw new Error(
      `${from} 只收中台图库直链（${REF_CDN_BASE}/…）：外站地址服务端不登记（登记了也取不回来）\n` +
      `  本地文件请直接传路径（CLI 自动上传），外站图先 museav upload <file> 传上来`,
    )
  }
  return v
}

/**
 * 同一张图重复登记：服务端契约是 409「这张图在本项目里已经登记过了」。
 *
 * 2026-10-04 实测：**这条路径线上漏成了 500 + 一坨 Supabase 原始 JSON**。根因不在 CLI：
 * museav-manager/functions/api/_utils.js 把上游响应体截到 200 字符，r2_key 一长，
 * `"message":"duplicate key …` 正好被截在 duplica 处，assets.js 的
 * `/duplicate key|unique/i` 就匹配不上，于是走了 500 分支（subjects 的报错短，没这问题）。
 *
 * 所以这里只**补一句中文**，原始报错原样保留：服务端修好后这段就该删掉
 * （修好后返回的是中文 409，不含 23505 / already exists，不会误触发）。
 */
function withDuplicateHint(msg: string): string {
  if (!/23505|already exists/i.test(msg)) return msg
  return `${msg}\n  → 这张图在本项目里已经登记过了：同一张图只登记一次，要改角色请先删旧登记，或换一张新图`
}

/** 主体 → 一行展示文本 */
function subjectLine(s: Subject): string {  const persona = s.persona_source ? ` · ${PERSONA_ZH[s.persona_source]}` : ''
  const traits = Object.entries(s.traits || {})
  const traitText = traits.length ? `  ${traits.map(([k, v]) => `${k}=${v}`).join(' ')}` : ''
  const counts = `  图${s.asset_count ?? 0}张`
  return `${s.id}  ${s.name}（${KIND_ZH[s.kind]}${persona}）${counts}${traitText}`
}

/**
 * 找主体。**服务端没有「按 id 查单个主体」的接口**（GET /api/subjects 只按项目/个人过滤），
 * 所以这里要么在指定项目里找，要么把个人 + 全部项目扫一遍。
 * 扫的代价是 N+2 次请求，换来的是 `subjects show <id>` 不必再传一次 --project ——
 * 少传一个参数就少一次「主体不在这个项目里」的困惑，值这个往返。
 */
async function findSubject(
  client: StudioClient,
  idOrName: string,
  project?: string,
): Promise<Subject> {
  const key = String(idOrName || '').trim()
  if (!key) throw new Error('缺少主体 id 或名称')

  let pool: Subject[]
  if (project) {
    const ws = await resolveWorkspace(client, project)
    pool = await client.subjects(ws.id)
  } else {
    const [personal, workspaces] = await Promise.all([client.subjects(), client.workspaces()])
    const perWs = await Promise.all(workspaces.map((w) => client.subjects(w.id)))
    pool = [...personal, ...perWs.flat()]
  }

  const byId = pool.find((s) => s.id === key)
  if (byId) return byId

  const byName = pool.filter((s) => s.name === key)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) {
    throw new Error(`重名主体「${key}」，请用 id 指定：\n${byName.map((s) => `  ${subjectLine(s)}`).join('\n')}`)
  }
  throw new Error(
    pool.length
      ? `没有主体「${key}」。${project ? '这个项目里' : '个人 + 全部项目里'}现有：\n${pool.map((s) => `  ${subjectLine(s)}`).join('\n')}`
      : `没有主体「${key}」${project ? '（这个项目里一个主体都没有）' : '（个人与全部项目里都没有主体）'}。先 museav subjects create 新建`,
  )
}

/** `subjects create` —— 建主体（= 一个 IP 人物/产品/场景/品牌） */
export async function createSubject(
  client: StudioClient,
  opts: { project?: string; name: string; kind?: string; persona?: string; traits?: string },
): Promise<void> {
  // 先本地校验、再解析项目：参数写错时不该先跑一趟网络（跟 add-asset 同一条规矩）
  const kind = assertKind(opts.kind || 'person')
  const name = assertName(opts.name)
  const traits = parseTraits(opts.traits)

  let personaSource: PersonaSource | null = null
  if (opts.persona !== undefined) {
    personaSource = assertPersona(opts.persona)
    // 服务端也会拒，但本地先说是为了把「为什么不行」讲清楚：产品没有真人和虚拟人之分
    if (kind !== 'person') {
      throw new Error(`只有「人物」（--kind person）才区分真人和虚拟人，当前 --kind ${kind}`)
    }
  }

  // 不传 --project = 建个人主体（服务端允许，项目是可选的），不是错误
  const workspaceId = opts.project ? (await resolveWorkspace(client, opts.project)).id : null

  const subject = await client.createSubject({ workspaceId, kind, name, traits, personaSource })
  process.stderr.write(`✅ 主体已建：${subjectLine(subject)}\n`)
  process.stderr.write(`传图: museav subjects add-asset ${subject.id} ./正面.png --role view_front\n`)
  process.stderr.write(`看图: museav subjects show ${subject.id}\n`)
  // stdout 只出 id，便于脚本/agent 接着传图
  console.log(subject.id)
}

/** `subjects list` —— 列主体（不传 --project 只看个人主体，跟服务端语义一致） */
export async function listSubjects(
  client: StudioClient,
  opts: { project?: string; kind?: string },
): Promise<void> {
  const kind = opts.kind ? assertKind(opts.kind) : undefined
  const ws = opts.project ? await resolveWorkspace(client, opts.project) : null
  const list = await client.subjects(ws?.id, kind)

  const scope = ws ? `「${ws.name}」` : '个人（未挂项目）'
  if (!list.length) {
    process.stderr.write(`${scope}没有主体${kind ? `（类型 ${kind}）` : ''}\n`)
    if (!ws) process.stderr.write('要看某个项目的传 --project <id|名>\n')
    console.log('[]')
    return
  }
  process.stderr.write(`${scope}主体（${list.length} 个）:\n`)
  for (const s of list) {
    process.stderr.write(`  ${subjectLine(s)}\n`)
    if (s.current_likeness) process.stderr.write(`    当前形象：${s.current_likeness.name}（共 ${s.likeness_count} 版）\n`)
  }
  process.stderr.write(`\n看某个主体名下的图: museav subjects show <主体id>\n`)
  // stdout 出完整 JSON（含 traits），agent 拿去直接引用
  console.log(JSON.stringify(list))
}

/** `subjects show` —— 看一个主体 + 它名下的图（按 role 分组，三视图单独置顶） */
export async function showSubject(
  client: StudioClient,
  idOrName: string,
  opts: { project?: string },
): Promise<void> {
  const subject = await findSubject(client, idOrName, opts.project)
  const assets = await client.subjectAssets(subject.id, subject.workspace_id)

  const grouped: Record<string, DomainAsset[]> = {}
  for (const role of ASSET_ROLES) grouped[role] = []
  for (const a of assets) (grouped[a.role] ||= []).push(a)

  process.stderr.write(`主体：${subject.name}（${KIND_ZH[subject.kind]}${subject.persona_source ? ` · ${PERSONA_ZH[subject.persona_source]}` : ''}）\n`)
  process.stderr.write(`  id: ${subject.id}\n`)
  process.stderr.write(`  项目: ${subject.workspace_id || '(个人，未挂项目)'}\n`)
  const traits = Object.entries(subject.traits || {})
  if (traits.length) process.stderr.write(`  特征: ${traits.map(([k, v]) => `${k}=${v}`).join('  ')}\n`)
  if (subject.current_likeness) process.stderr.write(`  当前形象: ${subject.current_likeness.name}（共 ${subject.likeness_count ?? 0} 版）\n`)

  // 三视图用 ✓/— 一眼看全，缺哪张比「列表里少一行」更容易发现
  const viewMark = VIEW_ROLES.map((r) => `${ROLE_ZH[r]}${grouped[r]?.length ? '✓' : '—'}`).join('  ')
  process.stderr.write(`  三视图: ${viewMark}\n`)

  if (!assets.length) {
    process.stderr.write(`\n名下还没有图。传一张：museav subjects add-asset ${subject.id} ./图.png --role view_front\n`)
    console.log(JSON.stringify({ subject, assets: [], by_role: grouped }))
    return
  }

  process.stderr.write(`\n名下素材（${assets.length} 张）:\n`)
  for (const role of ASSET_ROLES) {
    const rows = grouped[role] || []
    if (!rows.length) continue
    process.stderr.write(`  [${role} ${ROLE_ZH[role]}] ${rows.length} 张\n`)
    for (const a of rows) {
      process.stderr.write(`    ${a.id}  ${(a.name || '(未命名)').padEnd(16)} ${a.url}\n`)
    }
  }
  process.stderr.write(`\n出图引用: museav gen --project <项目> --ref <上面的 URL>\n`)
  console.log(JSON.stringify({ subject, assets, by_role: grouped }))
}

/** `subjects add-asset` —— 本地文件（或中台直链）→ 登记到该主体名下 */
export async function addSubjectAsset(
  client: StudioClient,
  idOrName: string,
  file: string | undefined,
  opts: { project?: string; url?: string; role?: string; name?: string },
): Promise<void> {
  if (file && opts.url) throw new Error('文件路径与 --url 二选一（已经是中台直链就不用再上传一遍）')
  if (!file && !opts.url) throw new Error('缺图：传本地文件路径，或用 --url <中台图库直链>')

  // 角色和 --url 先判、主体后找：这两个是纯本地判据，写错了不该先跑一趟网络
  const role = assertRole(opts.role || 'raw')
  const givenUrl = opts.url ? assertPlatformRefUrl(opts.url, '--url') : undefined

  const subject = await findSubject(client, idOrName, opts.project)

  let ref: string
  if (file) {
    const uploaded = await client.uploadRef(file)
    // 自己上传回来的直链也判一次：万一哪天 upload-ref 换了域名，这里当场说清楚，
    // 而不是让服务端回一句「缺少 r2_key（或中台图片直链）」——那句话看不出是谁的问题
    ref = assertPlatformRefUrl(uploaded.url, '上传返回的直链')
    process.stderr.write(`⬆️  已上传：${ref}\n`)
  } else {
    ref = givenUrl as string
  }

  const asset = await client.registerAsset({
    // 必须带主体自己的 workspace_id（可能是 null）：服务端按
    // `subject.workspace_id !== body.workspace_id` 判「主体不属于这个项目」
    workspaceId: subject.workspace_id,
    subjectId: subject.id,
    r2KeyOrUrl: ref,
    role,
    name: opts.name,
  }).catch((e: Error) => {
    throw new Error(withDuplicateHint(e.message))
  })

  process.stderr.write(`✅ 已登记到「${subject.name}」：${ROLE_ZH[role]}（${role}）\n`)
  process.stderr.write(`${asset.url}\n`)
  // stdout 只出直链，可直接喂 --ref
  console.log(asset.url)
}
