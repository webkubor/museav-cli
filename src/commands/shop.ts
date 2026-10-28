/** 个人店铺 CLI 注册：JSON 结果写 stdout，人话与失败交给统一错误出口。 */
import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import type { StudioClient } from '../client.js'
import type { ShopIssueInput, ShopProductInput, ShopCollectionInput } from '../shop.js'

type Run = (fn: (client: StudioClient, ...args: any[]) => Promise<void>) => (...args: any[]) => Promise<void>
type PublicRun = (fn: (client: StudioClient, ...args: any[]) => Promise<void>) => (...args: any[]) => Promise<void>
const output = (value: unknown) => { process.stdout.write(JSON.stringify(value, null, 2) + '\n') }

function spec(file: string): unknown {
  try { return JSON.parse(readFileSync(file, 'utf8')) }
  catch (e) { throw new Error(`读取配置 JSON 失败：${(e as Error).message}`) }
}

/** 重复选项收集器：--preview 可以给多次（commander 默认只保留最后一个）。 */
function collect(value: string, previous: string[] = []): string[] {
  return previous.concat([value])
}

/** 注册单根 shop；复用 index 的配置、认证和错误处理。 */
export function registerShop(program: Command, run: Run, publicRun: PublicRun = run): void {
  const shop = program.command('shop').description('经营自己的个人店铺：商品、渠道物料、发货码（JSON 输出）')
    .addHelpText('after', '\n使用现有 museav login 个人会话。闲鱼/小红书需手工上架；CLI 只输出物料和发货码。\n运行 museav shop products <命令> --help 或 museav shop codes <命令> --help 查看参数。')
  shop.command('show').description('查看自己对外公开的店铺资料与商品').action(run(async client => output(await client.shop.show())))
  const products = shop.command('products').description('管理本人销售商品（旧 museav products 仍为租户参考商品）')
  products.command('list').description('列出本人最近 200 个商品与可选自有模板').action(run(async client => output(await client.shop.products())))
  products.command('create').description('创建自有积分/壁纸/组合包商品')
    .requiredOption('--file <json>', '商品 JSON 文件；必填 title/kind/credits，kind=credits|wallpaper|bundle')
    .addHelpText('after', '\n只售自有模板/合集/内容。wallpaper 激活前必填 collection_ids，首次用 status:draft 建草稿；bundle 必填 bundle_content:{filename,content}，UTF-8 ≤200KB。\nCLI 组合包是安装指导+自有模板/资产/积分，不含共享私钥或开源 CLI 独占许可。创建不会自动上架外部平台。')
    .action(run(async (client, opts) => output(await client.shop.create(spec(opts.file) as ShopProductInput))))
  products.command('update <id>').description('修改自己的商品，JSON 只写要改的字段')
    .requiredOption('--file <json>', '部分更新 JSON 文件，不含 id；交付归属由服务端校验')
    .action(run(async (client, id, opts) => output(await client.shop.update(id, spec(opts.file) as Partial<ShopProductInput>))))
  products.command('archive <id>').description('归档商品（保留历史发货码及交付快照）')
    .action(run(async (client, id) => output(await client.shop.archive(id))))
  products.command('from-collection <collectionId>').description('从壁纸合集一键上架为商品，直接返回店铺配套图片与自动回复物料')
    .option('--channel <channel>', '销售渠道：xiaohongshu|xianyu', 'xiaohongshu')
    .option('--price <price>', '在售价格（可选；以小红书官方号实际售价为准）')
    .addHelpText('after', '\n自动完成：1.读取合集与全部高清预览切图；2.创建在售壁纸商品；3.生成包含专属单号提货通道的私信话术与带货文案。\n输出的 product_images 包含封面与全部壁纸切图，可直接作为小红书九宫格与店铺主图使用。')
    .action(run(async (client, collectionId, opts) => output(await client.shop.fromCollection(collectionId, { channel: opts.channel, price: opts.price }))))
  const collections = shop.command('collections').description('查询公开合集，或管理自有壁纸合集')
    .addHelpText('after', '\n匿名示例：museav shop collections list --owner <作者UUID>\n          museav shop collections show <合集UUID> --public')
  collections.command('list').description('列出本人合集，或按作者查询公开合集').option('--owner <uuid>', '匿名列出指定作者的已发布合集').action((...args: any[]) => {
    const opts = args.at(-2)
    const execute = opts.owner ? publicRun : run
    return execute(async (client, options) => output(opts.owner ? await client.shop.collections.listPublic(opts.owner) : await client.shop.collections.list()))(...args)
  })
  collections.command('show <id>').description('查看自有合集，或用 --public 匿名查看公开合集').option('--public', '匿名读取已发布的公开合集').action((...args: any[]) => {
    const opts = args.at(-2)
    const execute = opts.public ? publicRun : run
    return execute(async (client, id) => output(opts.public ? await client.shop.collections.showPublic(id) : await client.shop.collections.show(id)))(...args)
  })
  collections.command('save').description('完整保存合集，status=published 时发布（非部分更新）')
    .requiredOption('--file <json>', '完整合集 JSON，更新带 id；保留全部元数据及 asset_ids，省略会重置')
    .addHelpText('after', '\n付费合集先保存 draft，按返回的 items[].id 上传私有原图，再保存 published。原图必须与公开预览不同。\n完整字段和壁纸经营流程见 README「个人店铺」。')
    .action(run(async (client, opts) => output(await client.shop.collections.save(spec(opts.file) as ShopCollectionInput))))
  collections.command('upload <collection> <item> <file>').description('给草稿现有条目上传私有原图（≤32 MiB，不走公开图床）')
    .action(run(async (client, collection, item, file) => output(await client.shop.collections.upload(collection, item, file))))
  collections.command('append <collection> <file...>')
    .description('往已发布专题末尾追加壁纸（原图 + 预览素材，已有条目不动）')
    .requiredOption('--preview <id>', '对应图片在素材库里的预览素材 id；与原图文件按顺序一一对应（可重复多次）', collect, [])
    .addHelpText('after', '\n追加语义：只在末尾加，不改已有条目；已购买本专题的买家也能下载新追加的图。\n同一素材不能重复追加；付费原图不能与公开预览是同一张。\n每张图两个来源：--preview 是该图在个人素材库里的预览素材 id（原图文件按顺序与 --preview 一一对应）。\n例：museav shop collections append <合集UUID> ./01.jpg ./02.jpg --preview <素材id1> --preview <素材id2>')
    .action(run(async (client, collection, files: string[], opts) => {
      const previews = (opts.preview || []) as string[]
      if (!files.length) throw new Error('至少要给一张原图文件')
      if (files.length !== previews.length) throw new Error(`原图文件 ${files.length} 个与 --preview ${previews.length} 个必须一一对应`)
      const appended = await client.shop.collections.append(collection, files.map((file, index) => ({ sourceAssetId: previews[index], file })))
      output({ collection: appended.collection, appended: appended.items.length, items: appended.items })
    }))
  const codes = shop.command('codes').description('管理本人发货码；发码时服务端预留积分')
  codes.command('list').description('列出本人最近 200 个发货码（服务端不支持翻页）')
    .action(run(async client => output(await client.shop.codes())))
  codes.command('issue').description('为已成交订单签发发货码，并输出渠道物料')
    .requiredOption('--product <id>', '自己的商品 UUID')
    .requiredOption('--channel <channel>', '销售渠道：xiaohongshu|xianyu')
    .option('--external-order <order>', '外部平台订单号；同渠道同订单幂等')
    .requiredOption('--request-id <id>', '持久保存的幂等请求号；同一次发码重试必须复用')
    .addHelpText('after', '\n签发会预扣卖家真实积分，撤销未领码后退回；服务端冻结该次交付快照。\n结果含 code/claim_url/reply_text/product_copy/product_images，需手工上架和发送买家，不调用闲鱼/小红书发布 API。')
    .action(run(async (client, opts) => {
      const input: ShopIssueInput = { product_id: opts.product, channel: opts.channel, request_id: opts.requestId, ...(opts.externalOrder !== undefined ? { order_ref: opts.externalOrder } : {}) }
      output(await client.shop.issue(input))
    }))
  codes.command('revoke <code>').description('撤销自己的未领取码并退回预留积分；已领取码不可撤销')
    .action(run(async (client, code) => output(await client.shop.revoke(code))))
  codes.command('revoke-access <code>').description('撤销已领取订单的后续访问权益（壁纸下载/模板使用），不退积分')
    .addHelpText('after', '\n适用于买家已在外部平台退款场景：仅停止其后续合集下载与模板权限，不退回积分、不改写领取事实。')
    .action(run(async (client, code) => output(await client.shop.revokeAccess(code))))
}
