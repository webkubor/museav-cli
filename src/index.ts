#!/usr/bin/env node
/**
 * studio-cli —— studio 中台出图 CLI
 *
 * 用法见 README。注册中台：studio-cli config --baseUrl ... --apiKey ...
 */
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { Command } from 'commander'
import updateNotifier from 'update-notifier'
import { StudioClient } from './client.js'
import { TenantClient } from './tenant-client.js'
import { loadConfig, saveConfig, clearToken } from './config.js'
import { login } from './commands/login.js'
import { bindFeishu } from './commands/bind-feishu.js'
import { gen } from './commands/gen.js'
import { reverse } from './commands/reverse.js'
import { upload } from './commands/upload.js'
import { models } from './commands/models.js'
import { skills } from './commands/skills.js'
import { templates, createTemplate } from './commands/templates.js'
import { videoTemplates, createVideoTemplate } from './commands/video-templates.js'
import { balance } from './commands/balance.js'
import { jobs } from './commands/jobs.js'
import { whoami } from './commands/whoami.js'
import { products } from './commands/products.js'
import { assets } from './commands/assets.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { name: string; version: string }
// 每 12 小时最多查一次 npm registry，过期才提示，不拖慢日常调用
updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 12 }).notify({ defer: false })

/**
 * 首次运行欢迎语：只在第一次执行时提示一次（用环境变量 XHS_ONCE 防止在同一会话里重复输出），
 * 之后靠 ~/.studio-cli.json 里的 welcome_seen 标记跳过。不打断正常输出（写 stderr）。
 */
function maybeWelcome(): void {
  try {
    if (process.env.STUDIO_NO_WELCOME === '1') return
    const file = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
    const CONFIG_PATH = process.env.HOME + '/.studio-cli.json'
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) } catch { /* 首次运行还没有配置 */ }
    if (cfg.welcome_seen) return
    process.stderr.write(
      `\n🎨 感谢使用 studio-cli v${file.version}（MUSE AV 出图中台）\n` +
      `   有需求 / 反馈 / 合作？小红书关注「山鬼映画」找我：东方电影美学 · 把不存在的武侠电影做成江湖\n` +
      `   → https://www.xiaohongshu.com/user/profile/5c3c1581000000000501835d\n\n`,
    )
    // 标记已看过（写入失败也无所谓，最多下次再提示一次）
    try {
      cfg.welcome_seen = true
      writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
      chmodSync(CONFIG_PATH, 0o600)
    } catch { /* ignore */ }
  } catch { /* 欢迎语失败绝不阻塞任何命令 */ }
}
maybeWelcome()

const program = new Command()

program
  .name('studio-cli')
  .description('studio 中台出图 CLI —— login 登录后即可命令行出图、逆向、图生图')
  .version(pkg.version)
  // templates 有子命令 create，且父子都用了 --category（一个是列表过滤，一个是新建模板的分类）。
  // commander 默认不区分参数出现在父命令还是子命令段，会把 --category 的值吞给父命令、
  // 子命令读到 undefined（已用 templates create 实测复现）。开这个选项后，参数按位置归属
  // 所在的命令段解析，同名 flag 在父子命令里就不会互相打架。
  .enablePositionalOptions()

// 工厂：加载配置 + 构造 client，把 commander 透传的参数转给命令
function withClient<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return async (...args: any[]) => {
    try {
      const cfg = loadConfig()
      const client = new StudioClient(cfg)
      // commander action 参数固定形如 (...positionalArgs, options, command)。
      // 之前直接 args.slice(0, -2) 想留下 positionalArgs、丢掉 options+command，
      // 但纯 --flag、没有 <positional> 的命令（如 gen）总共只有 2 个参数
      // (options, command)，slice(0, -2) 会把 options 也一起丢掉——gen(client, opts)
      // 里的 opts 变成 undefined，读 opts.prompt 直接崩。这里显式取出 options，
      // 拼在 positional 之后转发，对没声明 options 的命令（reverse/upload/models
      // 等）只是多传一个不会被用到的参数，无影响。
      const opts = args[args.length - 2]
      const positional = args.slice(0, -2)
      await fn(client, ...positional, opts)
    } catch (e) {
      process.stderr.write(`❌ ${(e as Error).message}\n`)
      process.exit(1)
    }
  }
}

// products / assets 查的是租户自己后台的数据，不是 Studio 中台的，走独立的 TenantClient
// （见 tenant-client.ts 顶部注释），只支持租户 apiKey 身份，不支持个人 login token。
function withTenantClient<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return async (...args: any[]) => {
    try {
      const cfg = loadConfig()
      if (!cfg.apiKey) {
        throw new Error(
          'products / assets 只支持租户 API Key 身份：studio-cli config --apiKey sk-studio-xxx\n' +
          '（业务中台服务 key，统一形态 sk-studio-<24位>；个人 login 拿到的是个人 token，查不了组织级的产品/素材数据）',
        )
      }
      const client = new TenantClient({ apiKey: cfg.apiKey, tenantBaseUrl: cfg.tenantBaseUrl })
      const opts = args[args.length - 2]
      const positional = args.slice(0, -2)
      await fn(client, ...positional, opts)
    } catch (e) {
      process.stderr.write(`❌ ${(e as Error).message}\n`)
      process.exit(1)
    }
  }
}

program
  .command('gen')
  .description('出图 / 出视频（提交 + 自动轮询，成功输出 URL）')
  .option('-p, --prompt <text>', '完整出图提示词（与 --skill / --template 三选一）')
  .option('-s, --skill <slug>', '用中台技能出图，提示词在服务端展开（与 --prompt / --template 三选一）；清单见 studio-cli skills')
  .option('-i, --input <text>', '配合 --skill 的一句业务描述，如「米白色针织衫」；不给则按技能规范自由发挥')
  .option('-t, --template <id>', '用图片模板出图，提示词在服务端展开（与 --prompt / --skill 三选一）；清单见 studio-cli templates')
  .option('--fields <json>', '配合 --template 的占位符取值，JSON 对象，如 \'{"artist":"王嘉尔"}\'；模板没有占位符则不用传')
  // 不设默认值：--skill / --template 场景下要让技能/模板自己的比例生效，
  // CLI 强填默认值会把它们覆盖掉（服务端在纯 --prompt 场景已有 3:4 兜底，这里不用重复兜底）
  .option('-r, --ratio <ratio>', '宽高比: 3:4 / 9:16 / 1:1 / 4:3 / 16:9（不指定则用技能/模板自己的比例，纯 prompt 模式兜底 3:4）')
  .option('-m, --model <name>', '指定模型，如 gpt-image-2 / seedance-2-fast / artsdance-2-0-pro-260801')
  .option('-q, --quality <level>', '质量: low / medium / high（仅 gpt-image）')
  .option('--ref <file>', '垫图文件路径（图片图生图，自动上传）')
  .option('--video', '生成视频（走 /api/videos 链路，模型如 seedance-2-fast / artsdance-2-0-pro）')
  .option('--duration <sec>', '视频时长（秒，仅 --video；由模型与上游支持范围决定）', (v) => Number(v))
  .option('--image <file>', '图生视频首帧图（仅 --video，自动上传）')
  .action(withClient((client: StudioClient, opts: any) => gen(client, opts)))

program
  .command('reverse <input>')
  .description('图片逆向（上传图或图片 URL，反推 SCULPT prompt，stdout 输出英文 prompt）')
  .action(withClient((client: StudioClient, input: string) => reverse(client, input)))

program
  .command('upload <file>')
  .description('上传垫图，stdout 输出图片 URL')
  .action(withClient((client: StudioClient, file: string) => upload(client, file)))

program
  .command('models')
  .description('查可用模型列表')
  .action(withClient((client: StudioClient) => models(client)))

program
  .command('skills')
  .description('查可用技能：自己的私有技能 + 所属租户专属模板 + 公共技能库')
  .option('--genre <name>', '按分类过滤，如 电商 / 人像写真')
  .action(withClient((client: StudioClient, opts: any) => skills(client, opts)))

const templatesCmd = program
  .command('templates')
  .description('查可用图片/文字模板：自己租户建的 + 平台共享的（跟技能是两套不同的机制，见 gen --template）')
  .option('--category <name>', '按分类过滤，如 电商白底图 / 演唱会')
  .option('--type <type>', '按类型过滤：image（图片） / article（文字），不传则两类都列并标注')
  .action(withClient((client: StudioClient, opts: any) => templates(client, opts)))

const videoTemplatesCmd = program
  .command('video-templates')
  .description('查可用视频模板：配合 gen --video --template 使用（视频模板与图片模板是两套表）')
  .option('--category <name>', '按分类过滤，如 电商 / 换装视频')
  .action(withClient((client: StudioClient, opts: any) => videoTemplates(client, opts)))

videoTemplatesCmd
  .command('create')
  .description(
    '新建视频模板——归属由账号身份自动决定：租户 apiKey 建的自动归该租户，平台管理员建的是平台共享模板，个人账号不能建',
  )
  .requiredOption('--name <zh_name>', '模板中文名')
  .requiredOption('--prompt <template>', '提示词模板，占位符用 {key} 形式，如 "{product} 在 {scene} 中展示"')
  .option('--category <name>', '分类，默认「其他」')
  .option('--description <text>', '模板说明')
  .option('--model <name>', '视频模型，默认 seedance-2（可选 seedance-2-fast / seedance-2-mini / artsdance-2-0-pro-260801）')
  .option('--duration <sec>', '视频时长（秒，4-15，可选）')
  .option('--ratio <ratio>', '画面比例: 9:16 / 16:9 / 1:1 / 3:4（可选）')
  .option('--sample-video <url>', '参考视频 URL（可选，展示给用户的示例片）')
  .option('--sample-cover <url>', '封面图 URL（可选）')
  .action(withClient((client: StudioClient, opts: any) => createVideoTemplate(client, opts)))

templatesCmd
  .command('create')
  .description(
    '新建图片/文字模板——归属由账号身份自动决定：租户 apiKey 建的自动归该租户（其他租户看不到），' +
      '平台管理员账号建的是平台共享模板（所有租户可见），个人账号不能建',
  )
  .requiredOption('--name <zh_name>', '模板中文名')
  .requiredOption('--prompt <template>', '提示词模板，占位符用 {key} 形式，如 "{artist} 在 {city} 的演唱会海报"')
  .option('--category <name>', '分类，默认「其他」')
  .option('--ratio <ratio>', '宽高比，默认 3:4')
  .option('--description <text>', '模板说明')
  .option('--model <name>', '生成模型，默认 gpt-image-2')
  .option('--quality <level>', '质量: low / medium / high')
  .option('--fields <json>', '占位符字段说明，JSON 数组，如 \'[{"key":"artist","label":"艺人名"}]\'；不传则自动从 --prompt 里的 {key} 提取')
  .option('--type <type>', '模板类型：image（图片，默认） / article（文字）')
  .action(withClient((client: StudioClient, opts: any) => createTemplate(client, opts)))

program
  .command('products')
  .description('查所属租户自己的产品目录（数据在租户自己的后台，不在 Studio 中台；只支持已开通该接口的租户，仅租户 apiKey 身份可用）')
  .action(withTenantClient((client: TenantClient) => products(client)))

program
  .command('assets')
  .description('查所属租户自己的素材/资产库（数据在租户自己的后台，不在 Studio 中台；只支持已开通该接口的租户，仅租户 apiKey 身份可用）')
  .action(withTenantClient((client: TenantClient) => assets(client)))

program
  .command('balance')
  .description('查上游余额')
  .action(withClient((client: StudioClient) => balance(client)))

program
  .command('jobs')
  .description('查自己名下的出图工作流（个人 login 看自己的；租户 apiKey 看业务下全部）——服务端固定返回最近 50 条，limit/status 是本地过滤')
  .option('--limit <n>', '最多显示几条（在最近 50 条以内截取），默认 20', '20')
  .option('--status <status>', '按状态过滤: pending / processing / done / failed（本地过滤，不是服务端查询）')
  .action(withClient((client: StudioClient, opts: any) => jobs(client, opts)))

program
  .command('whoami')
  .description('查当前登录账户 + 租户归属（仅个人 login 可用，apiKey 调用会报错）')
  .action(withClient((client: StudioClient) => whoami(client)))

program
  .command('config')
  .description('配置中台地址和 apiKey（存到 ~/.studio-cli.json）')
  .option('--baseUrl <url>', '中台地址，默认 https://manager.museav.top')
  .option('--apiKey <key>', 'apiKey（sk-studio-xxx）')
  .option('--tenantBaseUrl <url>', '租户自己后台的域名，供 products/assets 命令用；已知租户（hym/mzmeso）不配也能跑')
  .action((opts) => {
    if (!opts.baseUrl && !opts.apiKey && !opts.tenantBaseUrl) {
      try {
        const cfg = loadConfig()
        process.stderr.write(
          `当前配置 (~/.studio-cli.json):\n` +
          `  baseUrl: ${cfg.baseUrl}\n` +
          `  apiKey: ${cfg.apiKey ? cfg.apiKey.slice(0, 16) + '...' : '(未设置)'}\n` +
          `  tenantBaseUrl: ${cfg.tenantBaseUrl || '(未设置，products/assets 对已知租户用内置默认值)'}\n`,
        )
      } catch (e) {
        process.stderr.write(`${(e as Error).message}\n`)
      }
      process.stderr.write(`\n修改: studio-cli config --apiKey sk-studio-xxx\n`)
      return
    }
    const cfg = saveConfig(opts)
    process.stderr.write(
      `✅ 已保存到 ~/.studio-cli.json\n` +
      `  baseUrl: ${cfg.baseUrl}\n` +
      `  apiKey: ${cfg.apiKey ? cfg.apiKey.slice(0, 16) + '...' : '(未设置)'}\n` +
      `  tenantBaseUrl: ${cfg.tenantBaseUrl || '(未设置)'}\n`,
    )
  })

program
  .command('login')
  .description('登录（设备授权：终端显示验证码，浏览器打开授权后 CLI 自动完成登录）')
  .option('--baseUrl <url>', '中台地址，默认 https://manager.museav.top')
  .action(async (opts) => {
    try {
      await login(opts)
    } catch (e) {
      process.stderr.write(`❌ ${(e as Error).message}\n`)
      process.exit(1)
    }
  })

program
  .command('bind-feishu')
  .description('绑定飞书（设备授权：终端显示验证码，浏览器授权后完成绑定；一个飞书可绑多个平台账户）')
  .option('--baseUrl <url>', '中台地址，默认 https://manager.museav.top')
  .action(async (opts) => {
    try {
      await bindFeishu(opts)
    } catch (e) {
      process.stderr.write(`❌ ${(e as Error).message}\n`)
      process.exit(1)
    }
  })

program
  .command('logout')
  .description('退出登录（清除本地 token）')
  .action(() => {
    clearToken()
    process.stderr.write('✅ 已退出登录\n')
  })

program.parse()
