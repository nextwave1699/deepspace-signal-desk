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
})
