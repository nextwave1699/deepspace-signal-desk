import { defineConfig } from '@playwright/test'

// A busy port fails fast (--strictPort) so tests never attach to another app.
const PORT = Number(process.env.DEEPSPACE_PORT ?? 5173)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host`,
    cwd: '..',
    // /api/auth/ok answers only once workerd is up, not just vite.
    url: `${BASE_URL}/api/auth/ok`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
