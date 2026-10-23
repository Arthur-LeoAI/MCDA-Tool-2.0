import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const LEGACY_WORKBOOK = fileURLToPath(new URL('../../data/legacy/MCDA ELT V7_Enviro_G_Top1.xlsx', import.meta.url))

const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name })

async function loadExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '使用示例数据' }).click()
  await expect(page.getByText('数据有效')).toBeVisible()
}

test('example data: from import to report', async ({ page }) => {
  await loadExample(page)
  await expect(page.getByText('3 个方案 × 3 个准则')).toBeVisible()

  // Weights: changing a weight updates the live ranking.
  await nav(page, '准则与权重').click()
  const ranking = page.locator('section', { hasText: '实时排名' }).locator('ol > li')
  await expect(ranking).toHaveCount(3)
  const before = await ranking.first().innerText()
  await page.getByRole('textbox', { name: '权重 Quality' }).fill('5')
  await expect(ranking.first()).not.toHaveText(before)

  // Results: all three methods and the Pareto analysis.
  await nav(page, '结果').click()
  const table = page.locator('section', { hasText: '排名对比' })
  await expect(table.getByText('Weighted sum (min_max)')).toBeVisible()
  await expect(table.getByText('TOPSIS (vector)')).toBeVisible()
  await expect(table.getByText('CP p=2 (min_max)')).toBeVisible()
  await expect(page.locator('section', { hasText: 'Pareto 分析' }).last()).toBeVisible()

  // Sensitivity: the chart renders.
  await nav(page, '敏感性分析').click()
  await expect(page.locator('section', { hasText: '权重稳定区间' }).locator('svg')).toBeVisible()

  // Export: the report downloads as an Excel file.
  await nav(page, '导出').click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载报告' }).click()
  expect((await download).suggestedFilename()).toBe('mcda-report.xlsx')
})

test('legacy workbook reproduces the Excel ranking', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(LEGACY_WORKBOOK)
  await expect(page.getByText('已识别为旧版 V7 工作簿')).toBeVisible()
  await expect(page.getByText('7 个方案 × 34 个准则')).toBeVisible()

  await nav(page, '准则与权重').click()
  const names = page.locator('section', { hasText: '实时排名' }).locator('ol > li span[title]')
  await expect(names).toHaveText([
    'Devulcanisation',
    'ELT in Cement kiln',
    'ELT in Power Plant',
    'rCB from Pyrolysis',
    'SAF from Pyrolysis',
    'Crumb rubber-1',
    'Crumb rubber-2',
  ])
})

test('validation errors are shown in the user language', async ({ page }) => {
  await loadExample(page)

  // Local check: an empty cell.
  await page.getByRole('textbox', { name: 'Option B / Quality' }).fill('')
  await expect(page.getByRole('alert')).toContainText('Option B / Quality: 缺少数值')
  await expect(page.getByRole('button', { name: '准则与权重' }).last()).toBeDisabled()
  await page.getByRole('textbox', { name: 'Option B / Quality' }).fill('6,5')

  // Server check: a duplicate name, translated from its error code.
  await page.getByRole('textbox', { name: '方案 3' }).fill('Option A')
  await expect(page.getByRole('alert')).toContainText('Option A: 名称重复')
})

test('language switch', async ({ page }) => {
  await loadExample(page)
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Import data' })).toBeVisible()
  await expect(page.getByText('Data is valid')).toBeVisible()
})
