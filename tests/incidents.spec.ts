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
