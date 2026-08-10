#!/usr/bin/env node
/**
 * studio-cli —— studio 中台出图 CLI
 *
 * 用法见 README。注册中台：studio-cli config --baseUrl ... --apiKey ...
 */
import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import updateNotifier from 'update-notifier'
import { StudioClient } from './client.js'
import { loadConfig, saveConfig, clearToken } from './config.js'
import { login } from './commands/login.js'
import { gen } from './commands/gen.js'
import { reverse } from './commands/reverse.js'
import { upload } from './commands/upload.js'
import { models } from './commands/models.js'
import { skills } from './commands/skills.js'
import { templates } from './commands/templates.js'
import { balance } from './commands/balance.js'
import { jobs } from './commands/jobs.js'
import { whoami } from './commands/whoami.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { name: string; version: string }
// 每 12 小时最多查一次 npm registry，过期才提示，不拖慢日常调用
updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 12 }).notify({ defer: false })

const program = new Command()

program
  .name('studio-cli')
  .description('studio 中台出图 CLI —— login 登录后即可命令行出图、逆向、图生图')
  .version(pkg.version)

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

program
  .command('gen')
  .description('出图（提交 + 自动轮询，成功输出图片 URL）')
  .option('-p, --prompt <text>', '完整出图提示词（与 --skill / --template 三选一）')
  .option('-s, --skill <slug>', '用中台技能出图，提示词在服务端展开（与 --prompt / --template 三选一）；清单见 studio-cli skills')
  .option('-i, --input <text>', '配合 --skill 的一句业务描述，如「米白色针织衫」；不给则按技能规范自由发挥')
  .option('-t, --template <id>', '用图片模板出图，提示词在服务端展开（与 --prompt / --skill 三选一）；清单见 studio-cli templates')
  .option('--fields <json>', '配合 --template 的占位符取值，JSON 对象，如 \'{"artist":"王嘉尔"}\'；模板没有占位符则不用传')
  // 不设默认值：--skill / --template 场景下要让技能/模板自己的比例生效，
  // CLI 强填默认值会把它们覆盖掉（服务端在纯 --prompt 场景已有 3:4 兜底，这里不用重复兜底）
  .option('-r, --ratio <ratio>', '宽高比: 3:4 / 9:16 / 1:1 / 4:3 / 16:9（不指定则用技能/模板自己的比例，纯 prompt 模式兜底 3:4）')
  .option('-m, --model <name>', '指定模型，如 gpt-image-2')
  .option('-q, --quality <level>', '质量: low / medium / high（仅 gpt-image）')
  .option('--ref <file>', '垫图文件路径（图生图，自动上传）')
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

program
  .command('templates')
  .description('查可用图片模板：自己租户建的 + 平台共享的（跟技能是两套不同的机制，见 gen --template）')
  .option('--category <name>', '按分类过滤，如 电商白底图 / 演唱会')
  .action(withClient((client: StudioClient, opts: any) => templates(client, opts)))

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
  .option('--baseUrl <url>', '中台地址，默认 https://studio.webkubor.online')
  .option('--apiKey <key>', 'apiKey（sk-studio-xxx）')
  .action((opts) => {
    if (!opts.baseUrl && !opts.apiKey) {
      try {
        const cfg = loadConfig()
        process.stderr.write(`当前配置 (~/.studio-cli.json):\n  baseUrl: ${cfg.baseUrl}\n  apiKey: ${cfg.apiKey ? cfg.apiKey.slice(0, 16) + '...' : '(未设置)'}\n`)
      } catch (e) {
        process.stderr.write(`${(e as Error).message}\n`)
      }
      process.stderr.write(`\n修改: studio-cli config --apiKey sk-studio-xxx\n`)
      return
    }
    const cfg = saveConfig(opts)
    process.stderr.write(`✅ 已保存到 ~/.studio-cli.json\n  baseUrl: ${cfg.baseUrl}\n  apiKey: ${cfg.apiKey ? cfg.apiKey.slice(0, 16) + '...' : '(未设置)'}\n`)
  })

program
  .command('login')
  .description('登录（设备授权：终端显示验证码，浏览器打开授权后 CLI 自动完成登录）')
  .option('--baseUrl <url>', '中台地址，默认 https://studio.webkubor.online')
  .action(async (opts) => {
    try {
      await login(opts)
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
