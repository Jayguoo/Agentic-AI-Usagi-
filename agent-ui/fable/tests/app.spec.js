import { expect, test } from '@playwright/test'

test('runs entirely as the USAGI desktop agent', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/')
  await expect(page).toHaveTitle('USAGI / Desktop Agent')
  await expect(page.getByRole('application', { name: 'USAGI desktop agent' })).toBeVisible()
  await expect(page.getByRole('banner').getByText('USAGI', { exact: true })).toBeVisible()
  await expect(page.getByText('Desktop agent', { exact: true })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('.quiet-task-canvas')).toBeVisible()
  await expect(page.locator('.flat-usagi')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Task inspector' })).toBeVisible()
  await expect(page.locator('.task-brief')).toHaveCount(0)
  await expect(page.locator('.desktop-tool')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pause task' }).click()
  await expect(page.getByRole('button', { name: 'Resume task' })).toBeVisible()

  await page.getByRole('button', { name: /Deliver/ }).click()
  await expect(page.getByRole('heading', { name: 'Task bundle landed' })).toBeVisible()
  await expect(page.getByText('Task delivered')).toBeVisible()

  const task = page.getByLabel('Desktop task')
  await task.fill('')
  await page.getByRole('button', { name: 'Hop to it' }).click()
  await expect(page.getByText('Give Usagi a desktop task.')).toBeVisible()

  await task.fill('Find duplicate screenshots and keep the newest ones.')
  await page.getByRole('button', { name: 'Hop to it' }).click()
  await expect(page.getByRole('button', { name: 'Hopping' })).toBeVisible()
  await expect(page.locator('.status-copy')).toHaveText('Listening with both ears', { timeout: 3_000 })

  await page.getByRole('button', { name: 'Enable sound' }).click()
  await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible()
  expect(consoleErrors).toEqual([])
})
