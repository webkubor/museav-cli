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

for (const ref of staticTranslationRefs(namespaces)) {
  for (const language of languages) {
    if (!languageKeys[language].has(ref.key)) {
      errors.push(`${ref.file}:${ref.line} 引用了缺失 key：${ref.key} (${language})`)
    }
  }
}

if (errors.length) {
  console.error(`i18n check failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`i18n check passed: ${languageKeys.zh.size} zh keys, ${languageKeys.en.size} en keys`)
