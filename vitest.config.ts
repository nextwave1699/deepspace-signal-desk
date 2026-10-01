import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { appIdDefine } from 'deepspace/build'

const appDir = fileURLToPath(new URL('.', import.meta.url))

// Standalone so unit tests never load the Cloudflare/Vite build plugins.
export default defineConfig({
  define: appIdDefine({ appDir }),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // tests/*.spec.ts are Playwright suites, run separately.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
})
