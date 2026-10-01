// Only react-hooks/rules-of-hooks is enabled; typescript-eslint is just the parser.
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default [
  // Generated router, macOS AppleDouble files and Playwright artifacts.
  { ignores: ['dist/**', 'node_modules/**', '.wrangler/**', '.vite/**', '.deepspace/**', 'src/router.ts', '**/._*'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
]
