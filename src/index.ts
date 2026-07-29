#!/usr/bin/env node
/**
 * studio-image —— studio 中台出图 CLI
 *
 * 用法见 README。注册中台：studio-image config --baseUrl ... --apiKey ...
 */
import { Command } from 'commander'
import { StudioClient } from './client.js'
import { loadConfig, saveConfig } from './config.js'
import { gen } from './commands/gen.js'
import { reverse } from './commands/reverse.js'
import { upload } from './commands/upload.js'
import { models } from './commands/models.js'
import { balance } from './commands/balance.js'

const program = new Command()

program
  .name('studio-image')
  .description('studio 中台出图 CLI —— 命令行出图、逆向、图生图')
  .version('0.1.0')

// 工厂：加载配置 + 构造 client，把 commander 透传的参数转给命令
function withClient<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return async (...args: any[]) => {
    try {
      const cfg = loadConfig()
      const client = new StudioClient(cfg)
      // commander action 的最后两个参数是 options 和 command 对象，命令函数只需 (client, ...业务参数)
      await fn(client, ...args.slice(0, -2))
    } catch (e) {
      process.stderr.write(`❌ ${(e as Error).message}\n`)
      process.exit(1)
    }
  }
}

program
  .command('gen')
  .description('出图（提交 + 自动轮询，成功输出图片 URL）')
  .requiredOption('-p, --prompt <text>', '出图提示词')
  .option('-r, --ratio <ratio>', '宽高比: 3:4 / 9:16 / 1:1 / 4:3 / 16:9', '3:4')
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
  .command('balance')
  .description('查上游余额')
  .action(withClient((client: StudioClient) => balance(client)))

program
  .command('config')
  .description('配置中台地址和 apiKey（存到 ~/.studio-image.json）')
  .option('--baseUrl <url>', '中台地址，默认 https://studio.webkubor.online')
  .option('--apiKey <key>', 'apiKey（sk-studio-xxx）')
  .action((opts) => {
    if (!opts.baseUrl && !opts.apiKey) {
      try {
        const cfg = loadConfig()
        process.stderr.write(`当前配置 (~/.studio-image.json):\n  baseUrl: ${cfg.baseUrl}\n  apiKey: ${cfg.apiKey ? cfg.apiKey.slice(0, 16) + '...' : '(未设置)'}\n`)
      } catch (e) {
        process.stderr.write(`${(e as Error).message}\n`)
      }
      process.stderr.write(`\n修改: studio-image config --apiKey sk-studio-xxx\n`)
      return
    }
    const cfg = saveConfig(opts)
    process.stderr.write(`✅ 已保存到 ~/.studio-image.json\n  baseUrl: ${cfg.baseUrl}\n  apiKey: ${cfg.apiKey ? cfg.apiKey.slice(0, 16) + '...' : '(未设置)'}\n`)
  })

program.parse()
