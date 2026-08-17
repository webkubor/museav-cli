/** museav projects —— 工作区（项目）与项目素材库。
 *  层级：平台 → 账户 → 工作区；素材挂工作区，业务隔离互不污染。
 *  「人像库的工作区出模特图、产品库的工作区出电商图」的载体就是这里。 */
import type { StudioClient, Workspace } from '../client.js'

/** --project <id|名> 的解析：id 精确命中，否则按名称匹配；找不到/歧义时把可选项列出来 */
export async function resolveWorkspace(client: StudioClient, idOrName: string): Promise<Workspace> {
  const list = await client.workspaces()
  const key = String(idOrName || '').trim()
  if (!key) throw new Error('缺少 --project（工作区 id 或名称）')
  const byId = list.find((w) => w.id === key)
  if (byId) return byId
  const byName = list.filter((w) => w.name === key)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) throw new Error(`重名工作区「${key}」，请用 id 指定：\n${list.map((w) => `  ${w.id}  ${w.name}`).join('\n')}`)
  throw new Error(`没有工作区「${key}」。现有：\n${list.map((w) => `  ${w.id}  ${w.name}`).join('\n')}\n（museav projects create --name 可新建）`)
}

export async function projects(client: StudioClient): Promise<void> {
  const list = await client.workspaces()
  if (!list.length) {
    process.stderr.write('还没有工作区（museav projects create --name 新建）\n')
    return
  }
  process.stderr.write(`工作区（${list.length} 个）:\n`)
  for (const w of list) {
    process.stderr.write(
      `  ${w.id}  ${w.name.padEnd(16)} 出图 ${w.gen_done ?? 0}/${w.gen_total ?? 0}${w.brand ? `  brand:${w.brand}` : ''}\n`,
    )
  }
  process.stderr.write(`\n素材库: museav projects assets --project <id|名>\n出图归档: museav gen --project <id|名> ...\n`)
  // stdout 只出 id，便于脚本解析
  console.log(list.map((w) => w.id).join('\n'))
}

export async function createProject(client: StudioClient, opts: { name: string }): Promise<void> {
  const name = (opts.name || '').trim()
  if (!name) throw new Error('--name 必填')
  const row = await client.createWorkspace(name)
  process.stderr.write(`✅ 工作区已建：${row.id}  ${row.name}\n`)
  process.stderr.write(`传素材: museav projects assets add <file> --project ${row.id}\n`)
  console.log(row.id)
}

export async function listAssets(client: StudioClient, opts: { project?: string }): Promise<void> {
  const ws = await resolveWorkspace(client, opts.project || '')
  const assets = await client.workspaceAssets(ws.id)
  process.stderr.write(`「${ws.name}」素材库（${assets.length} 条）:\n`)
  for (const a of assets) {
    const tag = a.tags?.length ? `[${a.tags.join(',')}]` : ''
    process.stderr.write(`  ${a.id}  ${(a.name || '(未命名)').padEnd(16)} ${a.media_type.padEnd(5)} ${tag}\n`)
    process.stderr.write(`    ${a.cdn_url}\n`)
  }
  process.stderr.write(`\n垫图出图: museav gen --project ${ws.id} --ref <素材URL> --prompt '...'\n`)
  // stdout：id<TAB>url 每行一条，agent 拿去直接当 --ref 用
  console.log(assets.map((a) => `${a.id}\t${a.cdn_url}`).join('\n'))
}

export async function addAsset(
  client: StudioClient,
  file: string,
  opts: { project?: string; name?: string; tag?: string[] },
): Promise<void> {
  const ws = await resolveWorkspace(client, opts.project || '')
  const row = await client.addWorkspaceAsset({
    file,
    workspaceId: ws.id,
    name: opts.name,
    tags: opts.tag || [],
  })
  process.stderr.write(`✅ 已入「${ws.name}」素材库：${row.name || '(未命名)'}  ${row.media_type}\n`)
  process.stderr.write(`${row.cdn_url}\n`)
  console.log(row.cdn_url)
}

export async function removeAsset(client: StudioClient, opts: { id: string }): Promise<void> {
  await client.deleteWorkspaceAsset(opts.id)
  process.stderr.write(`✅ 素材已删：${opts.id}\n`)
  console.log(opts.id)
}
