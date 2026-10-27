import { expect, test } from '@playwright/test'

test('home page: start, try the example, back home', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Compare your options and choose with good reasons', level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Four steps to a conclusion' })).toBeVisible()

  // "Get started" opens the guided mode at its first step.
  await page.getByRole('button', { name: 'Get started' }).first().click() // the hero's, not the closing one
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'What are you deciding?' })).toBeVisible()

  // The brand leads back home; the browser's back button returns to the tool.
  await page.getByRole('link', { name: /Multi-Criteria Decision Analysis/ }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'What are you deciding?' })).toBeVisible()
  await page.goBack()

  // The example opens the Amazon data at the check step.
  await page.getByRole('button', { name: 'Try it with example data' }).click()
  await expect(page.getByText('6 product(s), 10 criteria')).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Continue your last project' }).first()).toBeVisible()
})

test('home page: English by default, Chinese on request', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/MCDA/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { name: '比较多个方案，做出有依据的选择', level: 1 })).toBeVisible()
})
