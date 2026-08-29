#!/usr/bin/env node
/**
 * museav —— MUSE AV 出图中台 CLI
 *
 * 用法见 README。注册中台：museav config --baseUrl ... --apiKey ...
 */
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { Command } from 'commander'
import updateNotifier from 'update-notifier'
import { StudioClient } from './client.js'
import { TenantClient } from './tenant-client.js'
import { loadConfig, saveConfig, clearToken } from './config.js'
import { login } from './commands/login.js'
import { bindFeishu } from './commands/bind-feishu.js'
import { printWelcome } from './commands/welcome.js'
import { gen } from './commands/gen.js'
import { reverse } from './commands/reverse.js'
import { compressCmd, removeBgCmd, upscaleCmd, removeWatermarkCmd } from './commands/img-tools.js'
import { projects, createProject, listAssets, addAsset, removeAsset, resolveWorkspace } from './commands/projects.js'
import { imageToTemplate } from './commands/image-to-template.js'
import { upload } from './commands/upload.js'
import { models } from './commands/models.js'
import { skills } from './commands/skills.js'
import { templates, createTemplate } from './commands/templates.js'
import { videoTemplates, createVideoTemplate } from './commands/video-templates.js'
import { balance } from './commands/balance.js'
import { jobs } from './commands/jobs.js'
import { whoami } from './commands/whoami.js'
import { feedback } from './commands/feedback.js'
import { products } from './commands/products.js'
import { assets } from './commands/assets.js'
import { stickers, createSticker } from './commands/stickers.js'
import { posterTemplates, createPosterTemplate } from './commands/poster-templates.js'
import { speak, transcribeCmd } from './commands/speak.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { name: string; version: string }
// 每 12 小时最多查一次 npm registry，过期才提示，不拖慢日常调用
updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 12 }).notify({ defer: false })

/**
 * 首次运行欢迎语：只在第一次执行时提示一次（用环境变量 XHS_ONCE 防止在同一会话里重复输出），
 * 之后靠 ~/.museav.json 里的 welcome_seen 标记跳过。不打断正常输出（写 stderr）。
 */
function maybeWelcome(): void {
  try {
    if (process.env.MUSEAV_NO_WELCOME === '1' || process.env.STUDIO_NO_WELCOME === '1') return
    const file = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
    const CONFIG_PATH = process.env.HOME + '/.museav.json'
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) } catch { /* 首次运行还没有配置 */ }
    if (cfg.welcome_seen) return
    process.stderr.write(
      `\n🎨 感谢使用 museav v${file.version}（MUSE AV 出图中台）\n` +
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
  .name('museav')
  .description('MUSE AV 出图中台 CLI —— login 登录后即可命令行出图、出视频、读图逆向、图生模板')
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

// reverse 的本地路（Ollama）不需要中台凭证，client 懒构造：只有真回落 API 才建，
// 未登录的报错也只在那时候出现
function withLazyClient(fn: (getClient: () => StudioClient, ...args: any[]) => Promise<any>) {
  return async (...args: any[]) => {
    try {
      const opts = args[args.length - 2]
      const positional = args.slice(0, -2)
      const getClient = () => new StudioClient(loadConfig())
      await fn(getClient, ...positional, opts)
    } catch (e) {
      process.stderr.write(`❌ ${(e as Error).message}\n`)
      process.exit(1)
    }
  }
}

// 本地命令（compress / remove-bg 等）：不碰中台、不需要任何凭证，只包一层统一的错误出口
function asyncRun(fn: (...args: any[]) => Promise<any>) {
  return async (...args: any[]) => {
    try {
      await fn(...args)
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
          'products / assets 只支持租户 API Key 身份：museav config --apiKey sk-studio-xxx\n' +
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
  .option('-s, --skill <slug>', '用中台技能出图，提示词在服务端展开（与 --prompt / --template 三选一）；清单见 museav skills')
  .option('-i, --input <text>', '配合 --skill 的一句业务描述，如「米白色针织衫」；不给则按技能规范自由发挥')
  .option('-t, --template <id>', '用图片模板出图，提示词在服务端展开（与 --prompt / --skill 三选一）；清单见 museav templates')
  .option('--fields <json>', '配合 --template 的占位符取值，JSON 对象，如 \'{"artist":"王嘉尔"}\'；模板没有占位符则不用传')
  // 不设默认值：--skill / --template 场景下要让技能/模板自己的比例生效，
  // CLI 强填默认值会把它们覆盖掉（服务端在纯 --prompt 场景已有 3:4 兜底，这里不用重复兜底）
  .option('-r, --ratio <ratio>', '宽高比: 3:4 / 9:16 / 1:1 / 4:3 / 16:9（不指定则用技能/模板自己的比例，纯 prompt 模式兜底 3:4）')
  .option('-m, --model <name>', '指定模型，如 gpt-image-2 / artsdance-2-0-pro-260801（视频不传则走 auto 路由）')
  .option('-q, --quality <level>', '质量: low / medium / high（仅 gpt-image）')
  // 可重复：--ref 正面.jpg --ref 背景.jpg。顺序即语义——提示词里写「参考图片1的排版、
  // 用图片2作为背景」时，图片N 对应第 N 个 --ref。commander 的 collect 保证顺序。
  .option('--ref <file>', '垫图文件路径，可重复传多张（最多 5 张，顺序对应提示词里的「图片1、图片2…」）',
    (v: string, acc: string[]) => [...acc, v], [] as string[])
  // 透明背景是上游的 background 参数，不是提示词能表达的东西——提示词里写
  // "transparent background" 只是在描述构图，模型照样铺一层白底。这个开关才是抠图开关。
  .option('--transparent', '透明背景 PNG（抠掉背景，带 alpha 通道）。仅部分上游支持，不支持时中台明确报错、不会悄悄给白底图；服务端自动强制 PNG 输出（JPEG 没有 alpha 通道）')
  .option('--video', '生成视频（走 /api/videos 链路；模型档次如 artsdance-2-0-pro-260801，不传 --model 走 auto 路由）')
  .option('--duration <sec>', '视频时长（秒，仅 --video；由模型与上游支持范围决定）', (v) => Number(v))
  .option('--image <file>', '图生视频首帧图（仅 --video，自动上传）')
  .option('--project <id|名>', '归档进该工作区（museav projects 查；账户身份才生效）')
  .option('--batch <file>', '批量出图：文件每行一条（\'#\' 注释与空行跳过，\'-\' 读 stdin），走 /api/generate-batch 中台排队消化；配合 --skill/--template 时每行是业务描述，否则是完整提示词；其余选项作为公共参数')
  .action(withClient((client: StudioClient, opts: any) => gen(client, opts)))

program
  .command('compress <file>')
  .description('本地压缩图片（sharp，免登录）：默认同目录 <名>-min.<格式>，不覆写原文件')
  .option('--out <path>', '输出路径（默认 <名>-min.<格式>）')
  .option('--max-edge <px>', '最长边缩到该像素（等比，inside）')
  .option('--quality <1-100>', 'jpg/webp 质量，默认 82')
  .option('--format <fmt>', '输出格式 jpg / png / webp（默认跟随原格式）')
  .option('--overwrite', '允许覆盖已存在的输出文件')
  .action(asyncRun((input: string, opts: any) => compressCmd(input, opts)))

program
  .command('remove-bg <file>')
  .description('本地抠图去背景（BiRefNet/ISNet/U2Net + onnxruntime，免登录）：输出带 alpha 的 PNG。首次使用自动下载模型（缓存 ~/.museav-models）')
  .option('--out <path>', '输出路径（默认 <名>-nobg.png）')
  .option('--model <name>', 'birefnet（默认，细节最好，~214MB）/ isnet / u2net')
  .option('--overwrite', '允许覆盖已存在的输出文件')
  .action(asyncRun((input: string, opts: any) => removeBgCmd(input, opts)))

program
  .command('upscale <file>')
  .description('本地超分放大（Real-ESRGAN + Vulkan GPU，免登录）：默认 4x 输出 PNG。首次使用自动下载引擎与模型（~65MB，缓存 ~/.museav-bin 与 ~/.museav-models）')
  .option('--out <path>', '输出路径（默认 <名>-<N>x.png）')
  .option('--scale <n>', '放大倍数 2 / 3 / 4，默认 4')
  .option('--model <name>', 'realesrgan-x4plus（通用照片，默认）/ realesrgan-x4plus-anime（插画动漫）')
  .option('--overwrite', '允许覆盖已存在的输出文件')
  .action(asyncRun((input: string, opts: any) => upscaleCmd(input, opts)))

program
  .command('remove-watermark <file>')
  .description('本地去水印（免登录）：纯像素启发式自动定位水印 → LaMa 掩码修复，零模型依赖。首次使用自动下载修复模型（~200MB）；复杂画面用 --mask 手工指定（白=去除区）')
  .option('--out <path>', '输出路径（默认 <名>-clean.png）')
  .option('--mask <file>', '手工掩码图（白色=要去除的区域），跳过自动定位')
  .option('--overwrite', '允许覆盖已存在的输出文件')
  .action(asyncRun((input: string, opts: any) => removeWatermarkCmd(input, opts)))

/**
 * slideshow / slideshow-layouts —— 已下线（3.0.0），转向 reel-kit。
 *
 * 2.9.0 在这里做了「图集转竖版短视频」，当天就发现 reel-kit
 * （github.com/webkubor/reel-kit）早已做了同一件事，而且更好：
 * 版式走 HTML/CSS（文字能换行、能做阴影渐变，这里的 SVG 方案做不到）、
 * 支持配音且镜头时长由念白长度决定、默认本地 TTS 零成本、
 * 加版式只需往 templates/ 丢一个 HTML。
 *
 * 所以能力收敛到 reel-kit 一处，这边下线。**留存根而不是直接删命令**：
 * 已发布过 2.9~2.10，脚本里可能写着 museav slideshow，
 * 直接删会得到一句 "unknown command" 而不知道该去哪 —— 存根负责把人送到对岸。
 * 下个大版本再移除。
 *
 * museav 的边界因此回到：素材处理（compress/remove-bg/upscale/remove-watermark）
 * + AI 生成（gen）+ 中台资产。成品合成不在这里。
 */
const RETIRED_HINT = (cmd: string) => (
  `museav ${cmd} 已下线（3.0.0），出片能力收敛到 reel-kit：\n\n` +
  `  reel make --template sticker-promo \\\n` +
  `    --assets ./图片目录 --caps 文案.txt \\\n` +
  `    --title "标题" --bgm 儿童轻快 --out 成片.mp4\n\n` +
  `装： cd <reel-kit 检出目录> && pnpm install && npm link   （需 ffmpeg + Chrome）\n` +
  `找： cs repo reel-kit\n` +
  `看版式： reel templates    看配乐： reel bgm\n\n` +
  `为什么换：reel-kit 的版式走 HTML/CSS（文字能换行、能做阴影渐变），\n` +
  `还支持配音且镜头时长由念白决定，本地 TTS 零成本。同一件事没必要两套实现。`
)

for (const [name, args] of [['slideshow', ' [图片或目录...]'], ['slideshow-layouts', '']] as const) {
  program
    .command(`${name}${args}`)
    .description(`（已下线，改用 reel-kit 的 reel make —— 跑一下看迁移说明）`)
    .allowUnknownOption() // 老命令行里带着 --title/--layout 等参数，也要能跑到提示这一步
    .action(() => {
      process.stderr.write(`\n${RETIRED_HINT(name)}\n`)
      process.exit(1)
    })
}

// 工作区（项目）与项目素材库：平台 → 账户 → 工作区三层归属，素材挂工作区
const projectsCmd = program
  .command('projects')
  .description('工作区（项目）管理：一个账户多个工作区，每个工作区有自己的素材库（人像库/产品库各管各的业务）')
  .action(withClient((client: StudioClient) => projects(client)))

projectsCmd
  .command('create')
  .description('新建工作区（每账户最多 5 个）')
  .requiredOption('--name <name>', '工作区名称（最多 20 字）')
  .action(withClient((client: StudioClient, opts: any) => createProject(client, opts)))

const assetsCmd = projectsCmd
  .command('assets')
  .description('项目素材库：列出 / 上传 / 删除该工作区的素材（垫图母版，不压缩）')

assetsCmd
  .description('列工作区素材库')
  .option('--project <id|名>', '工作区 id 或名称（必填，不传会明确报错）')
  .action(withClient((client: StudioClient, opts: any) => listAssets(client, opts)))

assetsCmd
  .command('add <file>')
  .description('上传素材进工作区素材库（图片/音频/视频，按字节判型；母版不压缩）')
  .requiredOption('--project <id|名>', '工作区 id 或名称')
  .option('--name <name>', '素材名，如「白T正面」')
  .option('--tag <tag>', '标签，可重复（产品 / 人像 / 场景…）', (v: string, acc: string[]) => [...acc, v], [] as string[])
  .action(withClient((client: StudioClient, file: string, opts: any) => addAsset(client, file, opts)))

assetsCmd
  .command('rm <id>')
  .description('删除素材（硬删：R2 对象 + 记录）')
  .action(withClient((client: StudioClient, id: string) => removeAsset(client, { id })))

program
  .command('reverse <input>')
  .description('读图：反推 SCULPT prompt，stdout 输出英文 prompt。默认走中台 API（需登录）；--local 显式切本地 Ollama（需自备 qwen3-vl）。只读图；要做成模板用 image-to-template')
  .option('--api', '强制走中台 API（默认路径）')
  .option('--local', '改用本地 Ollama 读图（需先 ollama pull qwen3-vl:8b；本地不可用时回落 API）')
  .action(withLazyClient((getClient: () => StudioClient, input: string, opts: any) => reverse(getClient, input, opts)))

program
  .command('image-to-template <input>')
  .description('图生模板：上传图或图片 URL → 读图 + 文字层逆向 + 变量化 → 建成可复用的图片模板（原图自动焊成参考图）')
  .option('--no-create', '只看模板草稿，不真的建模板（同步返回，不消耗模板库）')
  .option('--name <zh_name>', '模板中文名，不给则由中台生成')
  .option('--slug <slug>', '模板 slug（全局唯一，撞了直接报错不覆盖），不给则由中台生成')
  .option('--category <name>', '模板分类，不给则按图片内容自动归类')
  .option('--variables <keys>', '收窄变量白名单，逗号分隔，如 title,subject,location（不传则中台按全集自行判断）')
  .option('--labels <json>', '变量 → 你的业务叫法，JSON 对象，如 \'{"subject":"艺人","location":"城市"}\'；只影响表单显示名')
  .option('--async', '强制异步（建模板本来就是异步，这个只对 --no-create 有意义）')
  .action(withClient((client: StudioClient, input: string, opts: any) => imageToTemplate(client, input, opts)))

program
  .command('upload <file>')
  .description('上传素材（图片/音频/视频，按字节内容判类型；图片 8MB / 音频 20MB / 视频 50MB），stdout 输出公网直链')
  .option('--to-works', '同时收进「我的作品」（在外面做好的成品视频/图片用这个；参考图不用）')
  .option('--workspace <id>', '归档到指定项目')
  .action(withClient((client: StudioClient, file: string, opts: { toWorks?: boolean; workspace?: string }) =>
    upload(client, file, { toWorks: opts.toWorks, workspace: opts.workspace })))

program
  .command('speak <text>')
  .description('文本转语音（小米 MiMo，直连上游需 MIMO_API_KEY，不走中台身份）：stdout 输出 wav 路径')
  .option('--out <path>', '输出路径（默认 speech-<时间戳>.wav）')
  .option('--voice <name>', '预置音色，默认 Chloe')
  .option('--design <desc>', '一句话描述音色，当场造一个（如「低沉沙哑的中年男声」）')
  .option('--clone <file>', '拿这段音频当样本，克隆它的音色')
  .option('--instruction <text>', '语气/风格指令（三种模式都可用）')
  .action(asyncRun((text: string, opts: any) => speak(text, opts)))

program
  .command('transcribe <audio>')
  .description('语音转文本（小米 MiMo，需 MIMO_API_KEY）：stdout 输出识别结果。同音字可能有误，重要场景请核对')
  .action(asyncRun((audio: string) => transcribeCmd(audio)))

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
  .option('--mine', '只看我这个人建的模板（created_by 是我，排除系统种子和租户专属）')
  .option('--tenant', '只看本租户建的模板')
  .option('--platform', '只看平台共享的模板')
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
  .option('--slug <slug>', '对外调用标识（全局唯一，视频模板硬必填）；不传自动生成 vt- 前缀短标识')
  .option('--category <name>', '分类，默认「其他」')
  .option('--description <text>', '模板说明')
  .option('--model <name>', '视频模型档次，默认 auto（交给中台路由）；锁死可选 artsdance-2-0-pro-260801（Seedance 2.0）/ artsdance-2-0-fast-260801 / artsdance-2-0-mini-260801 / artsdance-2-5-pro-260801（Seedance 2.5）')
  .option('--duration <sec>', '视频时长（秒，4-30：Seedance 2.0 系上限 15、2.5 到 30，可选）')
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

const stickersCmd = program
  .command('stickers')
  .description('查贴图素材库（租户级资产：PNG 装饰图，叠加在海报/封面上）')
  .action(withClient((client: StudioClient) => stickers(client)))

stickersCmd
  .command('add <file>')
  .description('上传贴图素材（PNG 透明装饰图，不压缩保留透明通道）')
  .requiredOption('--name <名称>', '贴图名称')
  .action(withClient((client: StudioClient, file: string, opts: any) => createSticker(client, file, opts)))

const posterTemplatesCmd = program
  .command('poster-templates')
  .description('查版式模板库（租户级资产：封面底图 + 固定描述，选版式把城市/明星名填进底图）')
  .action(withClient((client: StudioClient) => posterTemplates(client)))

posterTemplatesCmd
  .command('add <file>')
  .description('保存版式模板（封面底图 + 描述，描述里用 {城市} {明星} 占位）')
  .requiredOption('--name <名称>', '版式名称')
  .requiredOption('--prompt <描述>', '版式固定描述，{城市} {明星} 会自动替换')
  .action(withClient((client: StudioClient, file: string, opts: any) => createPosterTemplate(client, file, opts)))

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
  .description('查自己名下的出图工作流（个人 login 看自己的；租户 apiKey 看业务下全部）——服务端固定返回最近 50 条，limit/status/project 是本地过滤')
  .option('--limit <n>', '最多显示几条（在最近 50 条以内截取），默认 20', '20')
  .option('--status <status>', '按状态过滤: pending / processing / done / failed（本地过滤，不是服务端查询）')
  .option('--project <id|名>', '只看归档进该工作区的任务（本地过滤）')
  .action(withClient((client: StudioClient, opts: any) => jobs(client, opts)))

program
  .command('whoami')
  .description('查当前登录账户 + 租户归属（仅个人 login 可用，apiKey 调用会报错）')
  .action(withClient((client: StudioClient) => whoami(client)))

program
  .command('feedback [content]')
  .description('提 bug / 需求（不带内容则交互式输入）；--list 看我的反馈记录。个人账户可提，租户 apiKey 会被服务端拒')
  .option('--type <type>', '反馈类型：bug / 需求（默认 bug）')
  .option('--list', '列出我的反馈记录')
  .action(withLazyClient((getClient: () => StudioClient, content: string | undefined, opts: any) => feedback(getClient, content || '', opts)))

program
  .command('config')
  .description('配置中台地址和 apiKey（存到 ~/.museav.json）')
  .option('--baseUrl <url>', '中台地址，默认 https://manager.museav.top')
  .option('--apiKey <key>', 'apiKey（sk-studio-xxx）')
  .option('--tenantBaseUrl <url>', '租户自己后台的域名，供 products/assets 命令用；已知租户（hym/mzmeso）不配也能跑')
  .action(async (opts) => {
    if (!opts.baseUrl && !opts.apiKey && !opts.tenantBaseUrl) {
      try {
        const cfg = loadConfig()
        process.stderr.write(
          `当前配置 (~/.museav.json):\n` +
          `  baseUrl: ${cfg.baseUrl}\n` +
          `  apiKey: ${cfg.apiKey ? cfg.apiKey.slice(0, 16) + '...' : '(未设置)'}\n` +
          `  tenantBaseUrl: ${cfg.tenantBaseUrl || '(未设置，products/assets 对已知租户用内置默认值)'}\n`,

        )
      } catch (e) {
        process.stderr.write(`${(e as Error).message}\n`)
      }
      process.stderr.write(`\n修改: museav config --apiKey sk-studio-xxx\n`)
      return
    }
    const cfg = saveConfig(opts)
    process.stderr.write(
      `✅ 已保存到 ~/.museav.json\n` +
      `  baseUrl: ${cfg.baseUrl}\n` +
      `  apiKey: ${cfg.apiKey ? cfg.apiKey.slice(0, 16) + '...' : '(未设置)'}\n` +
      `  tenantBaseUrl: ${cfg.tenantBaseUrl || '(未设置)'}\n`,
    )
    // 配置了 apiKey 就识别身份打招呼（租户欢迎；个人 token 场景欢迎在 login 后打）
    if (opts.apiKey) {
      try {
        await printWelcome(cfg.baseUrl, { apiKey: opts.apiKey })
      } catch (e) {
        process.stderr.write(`⚠ 无法识别该 apiKey 对应的账户：${(e as Error).message}\n`)
      }
    }
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
