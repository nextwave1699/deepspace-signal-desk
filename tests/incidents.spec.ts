import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 1,
  'Needs a test account: `npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" --password-stdin`.',
)

test('declare an incident and open its workspace', async ({ users }) => {
  const [alex] = await users(1)
  const { page } = alex
  const title = `Checkout 5xx spike ${Date.now()}`

  await page.goto('/home')
  await page.getByTestId('new-incident-button').click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Primary service').fill('checkout-api')
  await page.getByRole('button', { name: 'Declare incident' }).last().click()

  await expect(page).toHaveURL(/\/incidents\//, { timeout: 15_000 })
  await expect(page.getByTestId('incident-title')).toHaveText(title)

  await page.getByRole('link', { name: 'All incidents' }).click()
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()

  await page.getByLabel('Search incidents').fill(title)
  await expect(page.getByTestId('incident-list').getByRole('listitem')).toHaveCount(1)
  await page.getByRole('button', { name: 'SEV1' }).click()
  await expect(page.getByText('No incidents match these filters')).toBeVisible()
  await expect(page).toHaveURL(/sev=SEV1/)
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(page.getByTestId('incident-stats')).toContainText('Active incidents')
})

test('paste evidence and filter it down to errors', async ({ users }) => {
  const [alex] = await users(1)
  const { page } = alex

  await page.goto('/home')
  await page.getByTestId('new-incident-button').click()
  await page.getByLabel('Title').fill(`Evidence test ${Date.now()}`)
  await page.getByRole('button', { name: 'Declare incident' }).last().click()
  await expect(page).toHaveURL(/\/incidents\//, { timeout: 15_000 })

  await page.getByRole('tab', { name: /Evidence/ }).click()
  await page.getByTestId('add-evidence-button').click()
  await page.getByLabel('Content').fill(
    [
      '2026-09-28T14:30:02Z INFO [checkout-api] GET /cart 200 latency=84ms',
      '2026-09-28T14:32:07Z ERROR [checkout-api] DB connection timeout after 5000ms',
      '2026-09-28T14:32:09Z WARN [checkout-api] retrying request',
    ].join('\n'),
  )
  await expect(page.getByTestId('evidence-preview')).toContainText('Parsed 3 entries · 1 errors')
  await page.getByRole('button', { name: 'Add evidence' }).last().click()

  await expect(page.getByTestId('evidence-count')).toHaveText('3 of 3 entries', { timeout: 15_000 })
  await page.getByRole('combobox', { name: 'Level' }).click()
  await page.getByRole('option', { name: 'Errors only' }).click()
  await expect(page.getByTestId('evidence-count')).toHaveText('1 of 3 entries')

  await page.getByRole('tab', { name: 'Timeline' }).click()
  await expect(page.getByTestId('timeline-list')).toContainText('First error in evidence')
  await page.getByLabel('What happened').fill('Rolled back deploy v2.14.0')
  await page.getByRole('button', { name: 'Add to timeline' }).click()
  await expect(page.getByTestId('timeline-list')).toContainText('Rolled back deploy v2.14.0', { timeout: 15_000 })
  await page.screenshot({ path: 'test-results/timeline.png', fullPage: true })
})

test('analyze an incident into signals and hypotheses', async ({ users }) => {
  test.setTimeout(180_000)
  const [alex] = await users(1)
  const { page } = alex

  await page.goto('/home')
  await page.getByTestId('new-incident-button').click()
  await page.getByLabel('Title').fill(`Analysis test ${Date.now()}`)
  await page.getByLabel('Primary service').fill('checkout-api')
  await page.getByRole('button', { name: 'Declare incident' }).last().click()
  await expect(page).toHaveURL(/\/incidents\//, { timeout: 15_000 })

  await page.getByRole('tab', { name: /Evidence/ }).click()
  await page.getByTestId('add-evidence-button').click()
  await page.getByLabel('Content').fill(
    [
      '2026-09-28T14:30:02Z INFO [checkout-api] GET /cart 200 latency=84ms',
      '2026-09-28T14:31:02Z INFO [checkout-api] GET /cart 200 latency=90ms',
      ...Array.from({ length: 6 }, (_, i) =>
        `2026-09-28T14:32:0${i}Z ERROR [checkout-api] DB connection timeout: could not acquire connection from pool after 5000ms`,
      ),
      '2026-09-28T14:32:30Z WARN [checkout-api] GET /cart 503 latency=5200ms',
    ].join('\n'),
  )
  await page.getByRole('button', { name: 'Add evidence' }).last().click()
  await expect(page.getByTestId('evidence-count')).toHaveText('9 of 9 entries', { timeout: 15_000 })

  await page.getByRole('tab', { name: 'Overview' }).click()
  await page.getByTestId('run-analysis').click()
  await expect(page.getByTestId('analysis-summary')).toBeVisible({ timeout: 150_000 })
  await expect(page.getByTestId('hypothesis-card').first()).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: 'test-results/analysis.png', fullPage: true })
})

test('ask the assistant a question about the incident', async ({ users }) => {
  test.setTimeout(180_000)
  const [alex] = await users(1)
  const { page } = alex

  await page.goto('/home')
  await page.getByTestId('new-incident-button').click()
  await page.getByLabel('Title').fill(`Q&A test ${Date.now()}`)
  await page.getByRole('button', { name: 'Declare incident' }).last().click()
  await expect(page).toHaveURL(/\/incidents\//, { timeout: 15_000 })

  await page.getByRole('tab', { name: /Evidence/ }).click()
  await page.getByTestId('add-evidence-button').click()
  await page.getByLabel('Content').fill(
    '2026-09-28T14:32:07Z ERROR [payments] redis connection refused 10.0.4.12:6379\n2026-09-28T14:32:09Z ERROR [payments] redis connection refused 10.0.4.12:6379',
  )
  await page.getByRole('button', { name: 'Add evidence' }).last().click()
  await expect(page.getByTestId('evidence-count')).toHaveText('2 of 2 entries', { timeout: 15_000 })

  await page.getByRole('tab', { name: 'Investigate' }).click()
  await page.getByLabel('Ask a question').fill('Which dependency is failing?')
  await page.getByRole('button', { name: 'Send question' }).click()
  await expect(page.getByTestId('chat-user')).toContainText('Which dependency is failing?', { timeout: 15_000 })
  await expect(page.getByTestId('chat-assistant')).toContainText(/redis/i, { timeout: 150_000 })
})

test('track hypotheses and investigation notes', async ({ users }) => {
  const [alex] = await users(1)
  const { page } = alex

  await page.goto('/home')
  await page.getByTestId('new-incident-button').click()
  await page.getByLabel('Title').fill(`Hypothesis test ${Date.now()}`)
  await page.getByRole('button', { name: 'Declare incident' }).last().click()
  await expect(page).toHaveURL(/\/incidents\//, { timeout: 15_000 })

  await page.getByRole('button', { name: 'Add hypothesis' }).first().click()
  await page.getByLabel('Hypothesis', { exact: true }).fill('Cache stampede after redis failover')
  await page.getByRole('button', { name: 'Add hypothesis' }).last().click()
  const card = page.getByTestId('hypothesis-card').filter({ hasText: 'Cache stampede' })
  await expect(card).toContainText('investigating', { timeout: 15_000 })

  await card.getByRole('button', { name: 'Confirm' }).click()
  await expect(card).toContainText('confirmed')
  await expect(page.getByText('Identified').first()).toBeVisible()

  await page.getByRole('tab', { name: 'Investigate' }).click()
  await page.getByLabel('New note').fill('Redis failover finished at 14:31, hit rate dropped to 3%')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByTestId('notes-list')).toContainText('Redis failover finished', { timeout: 15_000 })

  await page.getByRole('tab', { name: 'Timeline' }).click()
  await expect(page.getByTestId('timeline-list')).toContainText('Root cause confirmed: Cache stampede')
})

test('draft, edit and export the incident report', async ({ users }) => {
  test.setTimeout(180_000)
  const [alex] = await users(1)
  const { page } = alex

  await page.goto('/home')
  await page.getByTestId('new-incident-button').click()
  await page.getByLabel('Title').fill(`Report test ${Date.now()}`)
  await page.locator('#incident-description').fill('Checkout requests failed with 503 for 20 minutes.')
  await page.getByRole('button', { name: 'Declare incident' }).last().click()
  await expect(page).toHaveURL(/\/incidents\//, { timeout: 15_000 })

  await page.getByRole('tab', { name: 'Report' }).click()
  await page.getByTestId('generate-report').click()
  await expect(page.getByTestId('report-panel')).toBeVisible({ timeout: 150_000 })

  await page.getByLabel('Follow-up actions').fill('Alert on DB pool saturation above 80%')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  const download = await downloadPromise
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  const markdown = readFileSync(path, 'utf8')
  expect(markdown).toContain('## Root cause')
  expect(markdown).toContain('- [ ] Alert on DB pool saturation above 80%')
})

test('load the demo incident, analyze it, then delete it', async ({ users }) => {
  test.setTimeout(240_000)
  const [alex] = await users(1)
  const { page } = alex
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.goto('/home')
  await page.getByTestId('load-demo-button').click()
  await expect(page.getByTestId('incident-title')).toHaveText(/v2\.14\.0 deploy/, { timeout: 20_000 })

  await page.getByRole('tab', { name: /Evidence/ }).click()
  await expect(page.getByTestId('evidence-count')).toContainText(/of \d+ entries/, { timeout: 15_000 })

  await page.getByRole('tab', { name: 'Overview' }).click()
  await page.getByTestId('run-analysis').click()
  await expect(page.getByTestId('analysis-summary')).toBeVisible({ timeout: 180_000 })
  await expect(page.getByTestId('hypothesis-card').first()).toBeVisible({ timeout: 15_000 })
  await page.locator('main').evaluate((el) => (el.scrollTop = 0))
  await page.screenshot({ path: 'test-results/demo-overview.png' })
  await page.getByTestId('hypothesis-card').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/demo-hypotheses.png' })

  await page.getByRole('tab', { name: 'Timeline' }).click()
  await page.screenshot({ path: 'test-results/demo-timeline.png' })

  await page.getByRole('button', { name: 'Incident actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete incident' }).click()
  await page.getByRole('button', { name: 'Delete incident' }).click()
  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 })
})
