import type { Page } from '@playwright/test'

export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (text.includes('__chromium_devtools_metrics_reporter')) return
      if (text.includes('favicon.ico')) return
      errors.push(text)
    }
  })
  page.on('pageerror', (err) => {
    errors.push(err.message)
  })
  return errors
}
