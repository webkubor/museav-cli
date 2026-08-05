/**
 * 国际化资源一致性检查
 * 路由：全局
 * API：无
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const localeRoot = path.join(root, 'src/locales')
const languages = ['zh', 'en']

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function flatten(value, prefix = '', out = new Set()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
  } else {
    out.add(prefix)
  }
  return out
}

function localeFiles(language) {
  return fs.readdirSync(path.join(localeRoot, language))
    .filter((file) => file.endsWith('.json'))
    .sort()
}

function localeKeys(language) {
  const keys = new Set()
  for (const file of localeFiles(language)) {
    for (const key of flatten(readJson(path.join(localeRoot, language, file)))) {
      keys.add(key)
    }
  }
  return keys
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'locales'].includes(entry.name)) continue
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(file, files)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') && !file.includes('generated-api-types')) {
      files.push(file)
    }
  }
  return files
}

function isTranslationCallee(callee) {
  if (ts.isIdentifier(callee)) return callee.text === 't'
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 't'
}

function staticTranslationRefs(namespaces) {
  const refs = []
  for (const file of walk(path.join(root, 'src'))) {
    const text = fs.readFileSync(file, 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    function visit(node) {
      if (ts.isCallExpression(node) && isTranslationCallee(node.expression)) {
        const first = node.arguments[0]
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
          const key = first.text
          const namespace = key.split('.')[0]
          if (namespaces.has(namespace)) {
            const pos = source.getLineAndCharacterOfPosition(first.getStart(source))
            refs.push({ key, file: path.relative(root, file), line: pos.line + 1 })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return refs
}

const languageKeys = Object.fromEntries(languages.map((language) => [language, localeKeys(language)]))
const namespaces = new Set(localeFiles('zh').map((file) => file.replace(/\.json$/, '')))
const errors = []

for (const language of languages) {
  const files = localeFiles(language).map((file) => file.replace(/\.json$/, ''))
  for (const namespace of namespaces) {
    if (!files.includes(namespace)) errors.push(`${language} 缺少 namespace 文件：${namespace}.json`)
  }
}

for (const key of languageKeys.zh) {
  if (!languageKeys.en.has(key)) errors.push(`en 缺少 key：${key}`)
}
for (const key of languageKeys.en) {
  if (!languageKeys.zh.has(key)) errors.push(`zh 缺少 key：${key}`)
}

const translationRefs = staticTranslationRefs(namespaces)

for (const ref of translationRefs) {
  for (const language of languages) {
    if (!languageKeys[language].has(ref.key)) {
      errors.push(`${ref.file}:${ref.line} 引用了缺失 key：${ref.key} (${language})`)
    }
  }
}

/**
 * 全局壳层（每个路由都渲染）只允许用核心 namespace。
 *
 * 非核心 namespace 是路由级懒加载的（App.tsx CONSOLE_NAMESPACES 按页声明），壳层组件在**所有**
 * 路由渲染，引用懒加载文案 → 在没声明该 namespace 的页面上退化成 raw i18n key。
 * 真实事故：DashboardHeader 的「创建企业」弹窗按钮借用 `apiKeys.createModal.*`，在总览页
 * 显示成 `apiKeys.createModal.confirm`（需求方 shared/modelgo_prd#375）。
 *
 * 核心 namespace 列表从 src/i18n.ts 抽取，不在此处重复维护。
 * 例外：壳层里渲染的**弹窗**若自带 <LocaleNamespaces> 兜底（如 ConnectModal），文案写在它自己的
 * 文件里，不落在本目录，故不受本规则约束。
 */
const SHELL_DIRS = ['src/components/layout']
const coreNamespaces = (() => {
  const source = fs.readFileSync(path.join(root, 'src/i18n.ts'), 'utf8')
  const match = source.match(/const coreLocaleNamespaces = \[([^\]]*)\]/)
  if (!match) {
    errors.push('scripts/check-i18n.mjs 无法从 src/i18n.ts 解析 coreLocaleNamespaces，请同步脚本')
    return null
  }
  return new Set(match[1].match(/'([^']+)'/g).map((quoted) => quoted.slice(1, -1)))
})()

if (coreNamespaces) {
  for (const ref of translationRefs) {
    if (!SHELL_DIRS.some((dir) => ref.file.startsWith(dir))) continue
    const namespace = ref.key.split('.')[0]
    if (coreNamespaces.has(namespace)) continue
    errors.push(
      `${ref.file}:${ref.line} 全局壳层引用了懒加载 namespace「${namespace}」的文案：${ref.key}` +
      `（壳层每页都渲染，未加载该 namespace 的页面会显示 raw key）。` +
      `改用核心 namespace（${[...coreNamespaces].join('/')}），或把该 UI 拆成自带 <LocaleNamespaces> 的组件。`
    )
  }
}

if (errors.length) {
  console.error(`i18n check failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`i18n check passed: ${languageKeys.zh.size} zh keys, ${languageKeys.en.size} en keys`)
