import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
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
  // Projects start with the weighted sum; switch on the other two methods.
  await page.getByRole('checkbox', { name: /^TOPSIS/ }).check()
  await page.getByRole('checkbox', { name: /^折衷规划/ }).check()
  const table = page.locator('section', { hasText: '排名对比' })
  await expect(table.getByText('加权和', { exact: true })).toBeVisible()
  await expect(table.getByText('TOPSIS · 取自数据')).toBeVisible()
  await expect(table.getByText('CP p=2 · 取自数据')).toBeVisible()
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
  await page.locator('input[type=file]').first().setInputFiles(LEGACY_WORKBOOK)
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

test('missing values and validation errors', async ({ page }) => {
  await loadExample(page)

  // An empty cell is allowed: it counts as the worst value, and the page says so.
  await page.getByRole('textbox', { name: 'Option B / Quality' }).fill('')
  await expect(page.getByText('有 1 个空单元格')).toBeVisible()
  await expect(page.getByRole('button', { name: '准则与权重' }).last()).toBeEnabled()
  await page.getByRole('textbox', { name: 'Option B / Quality' }).fill('6,5')
  await expect(page.getByText('有 1 个空单元格')).toBeHidden()

  // Local check: an empty name blocks the next step.
  await page.getByRole('textbox', { name: '方案 3' }).fill('')
  await expect(page.getByRole('alert')).toContainText('第 3 个方案: 名称不能为空')
  await expect(page.getByRole('button', { name: '准则与权重' }).last()).toBeDisabled()

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

test('save a project file, clear, open it again: same result', async ({ page }) => {
  await loadExample(page)
  await page.getByRole('textbox', { name: 'Option B / Quality' }).fill('9')
  await nav(page, '结果').click()
  const ranking = page.locator('section', { hasText: '排名对比' }).locator('tbody tr')
  await expect(ranking).toHaveCount(3)
  const before = await ranking.allInnerTexts()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存项目' }).first().click()
  const file = await (await download).path()
  expect((await download).suggestedFilename()).toMatch(/.mcda.json$/)

  await nav(page, '数据').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '清空' }).click()
  await expect(page.getByRole('button', { name: '使用示例数据' })).toBeVisible()

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'saved.mcda.json', mimeType: 'application/json', buffer: await readFile(file) })
  await expect(page.getByRole('textbox', { name: 'Option B / Quality' })).toHaveValue('9')
  await nav(page, '结果').click()
  await expect(ranking).toHaveCount(3)
  expect(await ranking.allInnerTexts()).toEqual(before)
})

const MESSY_EXPORT = fileURLToPath(new URL('./fixtures/messy-export.xlsx', import.meta.url))

test('arbitrary table: match columns, import, data quality', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles(MESSY_EXPORT)
  await expect(page.getByText('对应列')).toBeVisible()

  // The first sheet only holds a note; switch to the data sheet.
  await page.getByRole('combobox', { name: '工作表' }).selectOption('Products')
  await expect(page.getByRole('textbox', { name: '表头所在行' })).toHaveValue('2')
  await expect(page.getByRole('combobox', { name: '方案名所在的列' })).toHaveValue('0')
  await expect(page.getByRole('checkbox', { name: '用作准则: Notes' })).not.toBeChecked()

  // Price is a cost; low competition is best, so reverse the detected order.
  const priceRow = page.locator('tr', { has: page.getByRole('checkbox', { name: '用作准则: Price' }) })
  await priceRow.getByRole('radio', { name: '成本型' }).click()
  const competitionRow = page.locator('tr', { has: page.getByRole('checkbox', { name: '用作准则: Competition' }) })
  await competitionRow.getByRole('button', { name: '反转' }).click()
  await page.getByRole('button', { name: '导入 6 个准则' }).click()

  await expect(page.getByText('5 个方案 × 6 个准则')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Silicone mat / Price' })).toHaveValue('12.99')
  await expect(page.getByRole('textbox', { name: 'Desk lamp / Weight (kg)' })).toHaveValue('1234.5')
  const quality = page.locator('div', { hasText: /^数据质量/ })
  await expect(quality.getByText('Price: 1 个缺失值，处理方式：按最差处理')).toBeVisible()
  await expect(quality.getByText(/Weight \(kg\): 1 个极端值：Desk lamp/)).toBeVisible()

  await nav(page, '结果').click()
  await expect(page.locator('section', { hasText: '排名对比' }).locator('tbody tr')).toHaveCount(5)
})
