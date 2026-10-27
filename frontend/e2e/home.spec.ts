import { expect, test } from '@playwright/test'

test('home page: start, try the example, back home', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '比较多个方案，做出有依据的选择', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '四步得到结论' })).toBeVisible()

  // "Get started" opens the guided mode at its first step.
  await page.getByRole('button', { name: '开始使用' }).first().click() // the hero's, not the closing one
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: '你要做什么样的决策？' })).toBeVisible()

  // The brand leads back home; the browser's back button returns to the tool.
  await page.getByRole('link', { name: /多准则决策分析/ }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: '你要做什么样的决策？' })).toBeVisible()
  await page.goBack()

  // The example opens the Amazon data at the check step.
  await page.getByRole('button', { name: '用示例数据试一试' }).click()
  await expect(page.getByText('6 个产品，10 个准则')).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('button', { name: '继续上次的项目' }).first()).toBeVisible()
})

test('home page in English', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(
    page.getByRole('heading', { name: 'Compare your options and choose with good reasons', level: 1 }),
  ).toBeVisible()
  await expect(page).toHaveTitle(/MCDA/)
})
