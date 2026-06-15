import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

// 独立配置：只查 JSX inline style 里的裸 hex（共享 eslint.config.js 的盲区）。
// 故意不并入共享配置 —— 否则 cs test 的 --max-warnings 0 会被 26 个存量文件直接卡死。
// 仅由 scripts/eslint-style-diff.mjs 在 CI/本地对「改动行」调用，存量永不挡路。
export default defineConfig([
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // style={{ ... '#fff' ... }} —— style 属性下任意含 hex 的字符串字面量
          selector: 'JSXAttribute[name.name="style"] Literal[value=/#[0-9a-fA-F]{3,8}/]',
          message:
            'inline style 禁止裸 hex —— 请用设计 token（var(--mg-*/--brand-*)，box-shadow 的 rgba 例外），见 DESIGN.md',
        },
      ],
    },
  },
])
