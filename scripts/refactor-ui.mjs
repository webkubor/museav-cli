import fs from 'fs'
import path from 'path'

// 定义待重构的文件列表
const filesToRefactor = [
  'src/components/auth/VerificationCodeButton.tsx',
  'src/components/layout/DashboardHeader.tsx',
  'src/components/customer-service/index.tsx',
  'src/features/dashboard/components/TerminalSection.tsx',
  'src/features/dashboard/components/WelcomeBanner.tsx',
  'src/features/settings/account/components/BasicInfoTab.tsx',
  'src/features/settings/account/components/ChangePasswordTab.tsx',
  'src/features/settings/account/components/OAuthBindingTab.tsx',
  'src/pages/api-keys/index.tsx',
  'src/pages/api-playground/index.tsx',
  'src/pages/chat-test/index.tsx',
  'src/pages/device/index.tsx',
  'src/pages/forgot-password/index.tsx',
  'src/pages/guardrails/index.tsx',
  'src/pages/invitations-mgmt/index.tsx',
  'src/pages/invitations/index.tsx',
  'src/pages/logs/index.tsx',
  'src/pages/models-chat/index.tsx',
  'src/pages/models-compare/index.tsx',
  'src/pages/models/index.tsx',
  'src/pages/observability/index.tsx',
  'src/pages/platform-config/index.tsx',
  'src/pages/reset-password/index.tsx',
  'src/pages/settings/organization/index.tsx',
  'src/pages/signup/index.tsx',
  'src/pages/workspaces/index.tsx'
]

const baseDir = '/Users/webkubor/Desktop/company/modelgo/modelgo-console-web'

function refactorFile(relativeFilePath) {
  const filePath = path.join(baseDir, relativeFilePath)
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ 文件不存在，跳过: ${relativeFilePath}`)
    return
  }

  let content = fs.readFileSync(filePath, 'utf-8')
  let modified = false

  // ─── 1. 检测是否需要导入 Button 或 Input ───
  const hasButton = content.includes('<Button')
  const hasInput = content.includes('<Input')

  if (!hasButton && !hasInput) {
    console.log(`ℹ️ 无需替换 Button/Input，跳过: ${relativeFilePath}`)
    return
  }

  // ─── 2. 移除 @douyinfe/semi-ui 导入中的 Button 和 Input ───
  const semiImportRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@douyinfe\/semi-ui['"]/g
  content = content.replace(semiImportRegex, (match, importsStr) => {
    let imports = importsStr.split(',').map(s => s.trim())
    const removedButton = imports.includes('Button')
    const removedInput = imports.includes('Input')

    if (removedButton || removedInput) {
      modified = true
      imports = imports.filter(item => item !== 'Button' && item !== 'Input')
      if (imports.length === 0) {
        return '' // 如果没有别的组件，直接删除这一行
      }
      return `import { ${imports.join(', ')} } from '@douyinfe/semi-ui'`
    }
    return match
  })

  // 清除由于删除整行导入而可能多出的空行
  content = content.replace(/^\s*import\s+\{\s*\}\s+from\s+['"]@douyinfe\/semi-ui['"]\s*\r?\n/gm, '')

  // ─── 3. 注入自定义组件的导入 ───
  let importsToInject = []
  if (hasButton && !content.includes("from '@/components/ui/Button'")) {
    importsToInject.push("import { Button } from '@/components/ui/Button'")
  }
  if (hasInput && !content.includes("from '@/components/ui/Input'")) {
    importsToInject.push("import { Input } from '@/components/ui/Input'")
  }

  if (importsToInject.length > 0) {
    modified = true
    // 在第一个 import 语句前或头部插入新导入
    content = importsToInject.join('\n') + '\n' + content
  }

  // ─── 4. 重构 <Button> 的属性 (对齐自定义组件 variant) ───
  if (hasButton) {
    // a) 转换 theme="solid" type="primary" -> variant="brand"
    const patternSolidPrimary = /<Button\b([^>]*)\btheme=["']solid["']([^>]*)\btype=["']primary["']/g
    const patternSolidPrimaryReverse = /<Button\b([^>]*)\btype=["']primary["']([^>]*)\btheme=["']solid["']/g
    
    if (patternSolidPrimary.test(content) || patternSolidPrimaryReverse.test(content)) {
      modified = true
      content = content.replace(patternSolidPrimary, '<Button$1$2 variant="brand"')
      content = content.replace(patternSolidPrimaryReverse, '<Button$1$2 variant="brand"')
    }

    // b) 转换 theme="solid" type="danger" -> variant="destructive"
    const patternSolidDanger = /<Button\b([^>]*)\btheme=["']solid["']([^>]*)\btype=["']danger["']/g
    const patternSolidDangerReverse = /<Button\b([^>]*)\btype=["']danger["']([^>]*)\btheme=["']solid["']/g
    if (patternSolidDanger.test(content) || patternSolidDangerReverse.test(content)) {
      modified = true
      content = content.replace(patternSolidDanger, '<Button$1$2 variant="destructive"')
      content = content.replace(patternSolidDangerReverse, '<Button$1$2 variant="destructive"')
    }

    // c) 转换 theme="borderless" -> variant="ghost"
    const patternBorderless = /<Button\b([^>]*)\btheme=["']borderless["']/g
    if (patternBorderless.test(content)) {
      modified = true
      content = content.replace(patternBorderless, '<Button$1 variant="ghost"')
    }

    // d) 转换 theme="light" -> variant="secondary"
    const patternLight = /<Button\b([^>]*)\btheme=["']light["']/g
    if (patternLight.test(content)) {
      modified = true
      content = content.replace(patternLight, '<Button$1 variant="secondary"')
    }

    // e) 处理残余的 type="primary"、type="danger"、type="secondary"、type="tertiary" (没有显式写 theme="solid" 的情况，由于 Semi 默认是 theme="light" 或 "solid"，我们在全局覆写中统一转换为相应的 variant)
    content = content.replace(/<Button\b([^>]*)\btype=["']primary["']/g, '<Button$1 variant="brand"')
    content = content.replace(/<Button\b([^>]*)\btype=["']danger["']/g, '<Button$1 variant="destructive"')
    content = content.replace(/<Button\b([^>]*)\btype=["']secondary["']/g, '<Button$1 variant="secondary"')
    content = content.replace(/<Button\b([^>]*)\btype=["']tertiary["']/g, '<Button$1 variant="secondary"')

    // f) 智能将 icon={<Icon />} 拼装为 children 前缀
    // 正则：匹配 <Button ... icon={<IconName ... />} ... >Children</Button>
    const buttonIconRegex = /<Button\b([^>]*)\bicon=\{\s*(<[A-Z]\w+[^>]*\/>)\s*\}([^>]*)>(.*?)<\/Button>/gs
    if (buttonIconRegex.test(content)) {
      modified = true
      content = content.replace(buttonIconRegex, '<Button$1$3>$2 $4</Button>')
    }
  }

  // ─── 5. 重构 <Input> 的受控 onChange ───
  if (hasInput) {
    // 匹配 onChange={(val) => setState(val)} 或 onChange={val => setState(val)}
    // 转换为 standard React onChange={(e) => setState(e.target.value)}
    const onChangeArrowRegex = /onChange=\{\s*\(?\s*(\w+)\s*\)?\s*=>\s*(\w+)\(\s*\1\s*\)\s*\}/g
    if (onChangeArrowRegex.test(content)) {
      modified = true
      content = content.replace(onChangeArrowRegex, 'onChange={e => $2(e.target.value)}')
    }
    
    // 匹配复杂些的 onChange={(v) => { setState(v); ... }} 或者是直接把值传给父组件 callback 的 onChange={val => props.onChange(val)} 等
    // 我们可以将其自动转为 onChange={e => props.onChange(e.target.value)}
    const onChangeCallbackRegex = /onChange=\{\s*\(?\s*(\w+)\s*\)?\s*=>\s*([\w\.]+)\(\s*\1\s*\)\s*\}/g
    if (onChangeCallbackRegex.test(content)) {
      modified = true
      content = content.replace(onChangeCallbackRegex, 'onChange={e => $2(e.target.value)}')
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`✅ 重构成功: ${relativeFilePath}`)
  } else {
    console.log(`ℹ️ 无需修改 (无匹配规则): ${relativeFilePath}`)
  }
}

console.log('🚀 开始全站 UI 统一重构进程 (Vite 8 + React 19 + custom shadcn/ui)...')
filesToRefactor.forEach(refactorFile)
console.log('🎉 批量基础替换重构完成！请运行 pnpm build 验证静态编译和接口兼容性。')
