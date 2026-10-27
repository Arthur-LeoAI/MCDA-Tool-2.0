import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const LEGACY_WORKBOOK = fileURLToPath(new URL('../../data/legacy/MCDA ELT V7_Enviro_G_Top1.xlsx', import.meta.url))

// These tests drive the expert pages; new users would start in the guided mode (S8).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('mcda-workspace')) {
      localStorage.setItem('mcda-workspace', JSON.stringify({ state: { mode: 'expert' }, version: 4 }))
    }
  })
})

// The template cards (S7) have example buttons too; the general one comes first.
const exampleButton = (page: Page) => page.getByRole('button', { name: 'Use example data' }).first()

const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name })

async function loadExample(page: Page) {
  await page.goto('/app')
  await exampleButton(page).click()
  await expect(page.getByText('Data is valid')).toBeVisible()
}

test('example data: from import to report', async ({ page }) => {
  await loadExample(page)
  await expect(page.getByText('3 alternatives × 3 criteria')).toBeVisible()

  // Weights: changing a weight updates the live ranking.
  await nav(page, 'Criteria & weights').click()
  const ranking = page.locator('section', { hasText: 'Live ranking' }).locator('ol > li')
  await expect(ranking).toHaveCount(3)
  const before = await ranking.first().innerText()
  await page.getByRole('textbox', { name: 'Weight Quality' }).fill('5')
  await expect(ranking.first()).not.toHaveText(before)

  // Results: all three methods and the Pareto analysis.
  await nav(page, 'Results').click()
  // Projects start with the weighted sum; switch on the other two methods.
  await page.getByRole('checkbox', { name: /^TOPSIS/ }).check()
  await page.getByRole('checkbox', { name: /^Compromise programming/ }).check()
  const table = page.locator('section', { hasText: 'Ranking comparison' })
  await expect(table.getByText('Weighted sum', { exact: true })).toBeVisible()
  await expect(table.getByText('TOPSIS · From the data')).toBeVisible()
  await expect(table.getByText('CP p=2 · From the data')).toBeVisible()
  await expect(page.locator('section', { hasText: 'Pareto analysis' }).last()).toBeVisible()

  // Sensitivity: the chart renders.
  await nav(page, 'Sensitivity').click()
  await expect(page.locator('section', { hasText: 'Weight stability intervals' }).locator('svg')).toBeVisible()

  // Export: the report downloads as an Excel file.
  await nav(page, 'Export').click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download report' }).click()
  expect((await download).suggestedFilename()).toBe('mcda-report.xlsx')
})

test('legacy workbook reproduces the Excel ranking', async ({ page }) => {
  await page.goto('/app')
  await page.locator('input[type=file]').first().setInputFiles(LEGACY_WORKBOOK)
  await expect(page.getByText('Legacy V7 workbook detected')).toBeVisible()
  await expect(page.getByText('7 alternatives × 34 criteria')).toBeVisible()

  await nav(page, 'Criteria & weights').click()
  const names = page.locator('section', { hasText: 'Live ranking' }).locator('ol > li span[title]')
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
  await expect(page.getByText('1 empty cell(s)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Criteria & weights' }).last()).toBeEnabled()
  await page.getByRole('textbox', { name: 'Option B / Quality' }).fill('6,5')
  await expect(page.getByText('1 empty cell(s)')).toBeHidden()

  // Local check: an empty name blocks the next step.
  await page.getByRole('textbox', { name: 'Alternative 3' }).fill('')
  await expect(page.getByRole('alert')).toContainText('alternative #3: Name must not be empty')
  await expect(page.getByRole('button', { name: 'Criteria & weights' }).last()).toBeDisabled()

  // Server check: a duplicate name, translated from its error code.
  await page.getByRole('textbox', { name: 'Alternative 3' }).fill('Option A')
  await expect(page.getByRole('alert')).toContainText('Option A: Duplicate name')
})

test('language switch: the optional Chinese interface', async ({ page }) => {
  await loadExample(page)
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { name: '导入数据' })).toBeVisible()
  await expect(page.getByText('数据有效')).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Import data' })).toBeVisible()
})

test('save a project file, clear, open it again: same result', async ({ page }) => {
  await loadExample(page)
  await page.getByRole('textbox', { name: 'Option B / Quality' }).fill('9')
  await nav(page, 'Results').click()
  const ranking = page.locator('section', { hasText: 'Ranking comparison' }).locator('tbody tr')
  await expect(ranking).toHaveCount(3)
  const before = await ranking.allInnerTexts()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project' }).first().click()
  const file = await (await download).path()
  expect((await download).suggestedFilename()).toMatch(/.mcda.json$/)

  await nav(page, 'Data').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(exampleButton(page)).toBeVisible()

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'saved.mcda.json', mimeType: 'application/json', buffer: await readFile(file) })
  await expect(page.getByRole('textbox', { name: 'Option B / Quality' })).toHaveValue('9')
  await nav(page, 'Results').click()
  await expect(ranking).toHaveCount(3)
  expect(await ranking.allInnerTexts()).toEqual(before)
})

const MESSY_EXPORT = fileURLToPath(new URL('./fixtures/messy-export.xlsx', import.meta.url))

test('arbitrary table: match columns, import, data quality', async ({ page }) => {
  await page.goto('/app')
  await page.locator('input[type=file]').first().setInputFiles(MESSY_EXPORT)
  await expect(page.getByText(/^Match columns ·/)).toBeVisible() // not "Match columns to a template"

  // The first sheet only holds a note; switch to the data sheet.
  await page.getByRole('combobox', { name: 'Worksheet' }).selectOption('Products')
  await expect(page.getByRole('textbox', { name: 'Header row' })).toHaveValue('2')
  await expect(page.getByRole('combobox', { name: 'Column with the alternative names' })).toHaveValue('0')
  await expect(page.getByRole('checkbox', { name: 'Use as criterion: Notes' })).not.toBeChecked()

  // Price is a cost; low competition is best, so reverse the detected order.
  const priceRow = page.locator('tr', { has: page.getByRole('checkbox', { name: 'Use as criterion: Price' }) })
  await priceRow.getByRole('radio', { name: 'Cost' }).click()
  const competitionRow = page.locator('tr', {
    has: page.getByRole('checkbox', { name: 'Use as criterion: Competition' }),
  })
  await competitionRow.getByRole('button', { name: 'Reverse' }).click()
  await page.getByRole('button', { name: 'Import 6 criteria' }).click()

  await expect(page.getByText('5 alternatives × 6 criteria')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Silicone mat / Price' })).toHaveValue('12.99')
  await expect(page.getByRole('textbox', { name: 'Desk lamp / Weight (kg)' })).toHaveValue('1234.5')
  const quality = page.locator('div', { hasText: /^Data quality/ })
  await expect(quality.getByText('Price: 1 missing value(s), handled as: counted as worst')).toBeVisible()
  await expect(quality.getByText(/Weight \(kg\): 1 extreme value\(s\): Desk lamp/)).toBeVisible()

  await nav(page, 'Results').click()
  await expect(page.locator('section', { hasText: 'Ranking comparison' }).locator('tbody tr')).toHaveCount(5)
})

test('criterion settings: condition excludes, value curve changes', async ({ page }) => {
  await loadExample(page)
  await nav(page, 'Criteria & weights').click()

  // A hard condition on Quality: Option B (quality 6) must be excluded.
  await page.getByRole('button', { name: 'Settings: Quality' }).click()
  await page.getByRole('textbox', { name: 'Quality: value' }).fill('7')
  await page.getByRole('button', { name: 'Add condition' }).click()
  await expect(page.getByText('Quality >= 7')).toBeVisible()
  // The chart is the ECharts SVG in the section headed "Value curve" (not the icons).
  const curveChart = () =>
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Value curve' }) })
      .locator('svg:not(.lucide)')
  await expect(curveChart().first()).toBeVisible()

  await nav(page, 'Results').click()
  await expect(page.getByText('Excluded alternatives')).toBeVisible()
  await expect(page.getByText('Option B: Quality must be >= 7, is 6')).toBeVisible()
  await expect(page.locator('section', { hasText: 'Ranking comparison' }).locator('tbody tr')).toHaveCount(2)

  // Logarithmic scoring for Cost changes the curve and keeps the analysis valid.
  await nav(page, 'Criteria & weights').click()
  await page.getByRole('button', { name: 'Settings: Cost' }).click()
  await page.getByRole('combobox', { name: 'Scoring' }).first().selectOption('log')
  await expect(curveChart()).toHaveCount(1) // one settings panel is open at a time
  await expect(page.getByRole('combobox', { name: 'Scoring' })).toHaveValue('log')
  await expect(page.locator('section', { hasText: 'Live ranking' }).locator('ol > li')).toHaveCount(2)
})

test('groups: ranking between groups, pairwise comparison within a group', async ({ page }) => {
  await loadExample(page)
  await nav(page, 'Criteria & weights').click()
  const card = (title: string) =>
    page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

  // Two groups; Cost and Quality go into the first, Risk into the second.
  await page.getByRole('button', { name: 'New group' }).click()
  await page.getByRole('button', { name: 'New group' }).click()
  await expect(card('Group 2')).toContainText('This group has no criteria yet')
  for (const [criterion, group] of [
    ['Cost', 'Group 1'],
    ['Quality', 'Group 1'],
    ['Risk', 'Group 2'],
  ]) {
    await page.getByRole('button', { name: `Settings: ${criterion}` }).click()
    await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption({ label: group })
    await page.getByRole('button', { name: `Close: ${criterion}` }).click()
  }

  // Between groups: a ranking with group 1 first gives ROC weights 75 % and 25 %.
  const upper = card('Weights between groups')
  await upper.getByRole('radio', { name: 'Ranking' }).click()
  await upper.getByRole('checkbox', { name: 'Tied with previous: Group 2' }).uncheck()
  await expect(upper.getByText('75.0%')).toBeVisible()
  await expect(upper.getByText('25.0%')).toBeVisible()

  // Within group 1: Quality is five times as important as Cost.
  const group1 = card('Group 1')
  await group1.getByRole('radio', { name: 'Pairwise' }).click()
  await group1.getByRole('slider', { name: 'Compare Cost with Quality' }).fill('4')
  await expect(group1.getByText('Quality more important (5)')).toBeVisible()
  await expect(group1.getByText('Consistency ratio CR = 0.000')).toBeVisible()
  await expect(group1.getByText('overall 62.5%')).toBeVisible() // 75 % x 5/6
  await expect(page.locator('section', { hasText: 'Live ranking' }).locator('ol > li')).toHaveCount(3)
})

test('robustness: rank distribution and confidence, sampling mode changes the result', async ({ page }) => {
  await loadExample(page)
  await nav(page, 'Sensitivity').click()
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Robustness (Monte Carlo)' }) })
  await expect(card.getByText('Confidence', { exact: true })).toBeVisible()
  await expect(card.getByRole('heading', { name: 'Rank distribution' })).toBeVisible()
  await expect(card.locator('tbody tr')).toHaveCount(3)
  const before = await card.locator('tbody').innerText()

  await card.getByRole('radio', { name: 'Weights unknown' }).click()
  await expect(card.getByRole('slider', { name: 'Spread' })).toBeHidden()
  await expect(card.locator('tbody')).not.toHaveText(before)
})

test('conclusion: recommendation, reasons and confidence on the results page', async ({ page }) => {
  await loadExample(page)
  await nav(page, 'Results').click()
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Conclusion' }) })
  await expect(card.getByText(/^Recommended: Option [ABC]/)).toBeVisible()
  await expect(card.getByText(/'s score comes mainly from/)).toBeVisible()
  await expect(card.getByText(/^Confidence: \w+\. In /)).toBeVisible() // the sentence, not the badge
})

test('templates: Amazon example and ELT preset', async ({ page }) => {
  await page.goto('/app')
  const amazon = page.getByRole('region', { name: 'Amazon US product selection' })
  await amazon.getByRole('button', { name: 'Use example data' }).click()
  await expect(page.getByText('6 alternatives × 10 criteria')).toBeVisible()

  await nav(page, 'Criteria & weights').click()
  await expect(page.getByRole('heading', { name: 'Weights between groups' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Profit', exact: true })).toBeVisible()

  // The suggested condition (margin >= 20 %) excludes the yoga mat.
  await nav(page, 'Results').click()
  await expect(page.getByText(/^Yoga mat: Est. profit margin/)).toBeVisible()

  // ELT with the "environmental only" preset ranks like the legacy Enviro workbook.
  await nav(page, 'Data').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Clear' }).click()
  const elt = page.getByRole('region', { name: 'ELT technology assessment' })
  await elt.getByRole('combobox', { name: 'Weights' }).selectOption({ label: 'Environmental only (Enviro)' })
  await elt.getByRole('button', { name: 'Use example data' }).click()
  await expect(page.getByText('7 alternatives × 34 criteria')).toBeVisible()
  await nav(page, 'Criteria & weights').click()
  await expect(page.locator('section', { hasText: 'Live ranking' }).locator('ol > li span[title]').first()).toHaveText(
    'Devulcanisation',
  )
})

test('templates: columns are matched by alias when importing a table', async ({ page }) => {
  await page.goto('/app')
  const csv =
    'Product,Monthly sales,Margin (%),Size,Colour\nMat,1800,28,standard,red\nLamp,2600,22,oversize,blue\nBox,900,31,standard,green\n'
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page
    .getByRole('combobox', { name: 'Match columns to a template' })
    .selectOption({ label: 'Amazon US product selection' })
  await expect(page.getByRole('combobox', { name: 'Template criterion: Monthly sales' })).toHaveValue('monthly_sales')
  await expect(page.getByRole('combobox', { name: 'Template criterion: Size' })).toHaveValue('size_tier')
  await expect(page.getByRole('combobox', { name: 'Template criterion: Colour' })).toHaveValue('')
  await page.getByRole('button', { name: /^Import \d+ criteria/ }).click()
  await expect(page.getByText('3 alternatives × 3 criteria')).toBeVisible()
  // Matched columns take the template's names (shown as text on the weights page) and groups.
  await nav(page, 'Criteria & weights').click()
  await expect(page.getByText('Est. monthly sales', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Demand', exact: true })).toBeVisible()
})
