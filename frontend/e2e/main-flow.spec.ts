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
const exampleButton = (page: Page) => page.getByRole('button', { name: '使用示例数据' }).first()

const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name })

async function loadExample(page: Page) {
  await page.goto('/')
  await exampleButton(page).click()
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
  await expect(exampleButton(page)).toBeVisible()

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
  await expect(page.getByText(/^对应列 ·/)).toBeVisible() // not "按模板对应列"

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

test('criterion settings: condition excludes, value curve changes', async ({ page }) => {
  await loadExample(page)
  await nav(page, '准则与权重').click()

  // A hard condition on Quality: Option B (quality 6) must be excluded.
  await page.getByRole('button', { name: '设置: Quality' }).click()
  await page.getByRole('textbox', { name: 'Quality: value' }).fill('7')
  await page.getByRole('button', { name: '添加条件' }).click()
  await expect(page.getByText('Quality >= 7')).toBeVisible()
  // The chart is the ECharts SVG in the section headed "价值曲线" (not the icons).
  const curveChart = () =>
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: '价值曲线' }) })
      .locator('svg:not(.lucide)')
  await expect(curveChart().first()).toBeVisible()

  await nav(page, '结果').click()
  await expect(page.getByText('已排除的方案')).toBeVisible()
  await expect(page.getByText('Option B: Quality 应 >= 7，实际为 6')).toBeVisible()
  await expect(page.locator('section', { hasText: '排名对比' }).locator('tbody tr')).toHaveCount(2)

  // Logarithmic scoring for Cost changes the curve and keeps the analysis valid.
  await nav(page, '准则与权重').click()
  await page.getByRole('button', { name: '设置: Cost' }).click()
  await page.getByRole('combobox', { name: '换算方式' }).first().selectOption('log')
  await expect(curveChart()).toHaveCount(1) // one settings panel is open at a time
  await expect(page.getByRole('combobox', { name: '换算方式' })).toHaveValue('log')
  await expect(page.locator('section', { hasText: '实时排名' }).locator('ol > li')).toHaveCount(2)
})

test('groups: ranking between groups, pairwise comparison within a group', async ({ page }) => {
  await loadExample(page)
  await nav(page, '准则与权重').click()
  const card = (title: string) =>
    page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

  // Two groups; Cost and Quality go into the first, Risk into the second.
  await page.getByRole('button', { name: '新建分组' }).click()
  await page.getByRole('button', { name: '新建分组' }).click()
  await expect(card('分组 2')).toContainText('这个分组还没有准则')
  for (const [criterion, group] of [
    ['Cost', '分组 1'],
    ['Quality', '分组 1'],
    ['Risk', '分组 2'],
  ]) {
    await page.getByRole('button', { name: `设置: ${criterion}` }).click()
    await page.getByRole('combobox', { name: '所属分组' }).selectOption({ label: group })
    await page.getByRole('button', { name: `收起: ${criterion}` }).click()
  }

  // Between groups: a ranking with group 1 first gives ROC weights 75 % and 25 %.
  const upper = card('分组之间的权重')
  await upper.getByRole('radio', { name: '排序' }).click()
  await upper.getByRole('checkbox', { name: '与上一项并列: 分组 2' }).uncheck()
  await expect(upper.getByText('75.0%')).toBeVisible()
  await expect(upper.getByText('25.0%')).toBeVisible()

  // Within group 1: Quality is five times as important as Cost.
  const group1 = card('分组 1')
  await group1.getByRole('radio', { name: '两两比较' }).click()
  await group1.getByRole('slider', { name: '比较 Cost 和 Quality' }).fill('4')
  await expect(group1.getByText('Quality 更重要（5）')).toBeVisible()
  await expect(group1.getByText('一致性比率 CR = 0.000')).toBeVisible()
  await expect(group1.getByText('最终 62.5%')).toBeVisible() // 75 % x 5/6
  await expect(page.locator('section', { hasText: '实时排名' }).locator('ol > li')).toHaveCount(3)
})

test('robustness: rank distribution and confidence, sampling mode changes the result', async ({ page }) => {
  await loadExample(page)
  await nav(page, '敏感性分析').click()
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: '稳健性（蒙特卡洛）' }) })
  await expect(card.getByText('可靠程度')).toBeVisible()
  await expect(card.getByRole('heading', { name: '名次分布' })).toBeVisible()
  await expect(card.locator('tbody tr')).toHaveCount(3)
  const before = await card.locator('tbody').innerText()

  await card.getByRole('radio', { name: '权重完全未知' }).click()
  await expect(card.getByRole('slider', { name: '波动幅度' })).toBeHidden()
  await expect(card.locator('tbody')).not.toHaveText(before)
})

test('conclusion: recommendation, reasons and confidence on the results page', async ({ page }) => {
  await loadExample(page)
  await nav(page, '结果').click()
  // The heading is translated too, so find the card by either title.
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: /^(结论|Conclusion)$/ }) })
  await expect(card.getByText(/^推荐 Option [ABC]/)).toBeVisible()
  await expect(card.getByText(/的得分主要来自/)).toBeVisible()
  await expect(card.getByText(/^可靠程度：.。在/)).toBeVisible()

  // The same conclusion in English.
  await page.getByRole('button', { name: 'English' }).click()
  await expect(card.getByText(/^Recommended: Option [ABC]/)).toBeVisible()
  await expect(card.getByText(/^Confidence: \w+\. In /)).toBeVisible() // the sentence, not the badge
})

test('templates: Amazon example and ELT preset', async ({ page }) => {
  await page.goto('/')
  const amazon = page.getByRole('region', { name: 'Amazon 美国站选品' })
  await amazon.getByRole('button', { name: '使用示例数据' }).click()
  await expect(page.getByText('6 个方案 × 10 个准则')).toBeVisible()

  await nav(page, '准则与权重').click()
  await expect(page.getByRole('heading', { name: '分组之间的权重' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '盈利', exact: true })).toBeVisible()

  // The suggested condition (margin >= 20 %) excludes the yoga mat.
  await nav(page, '结果').click()
  await expect(page.getByText(/^Yoga mat: 预估利润率/)).toBeVisible()

  // ELT with the "environmental only" preset ranks like the legacy Enviro workbook.
  await nav(page, '数据').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '清空' }).click()
  const elt = page.getByRole('region', { name: 'ELT 技术评估' })
  await elt.getByRole('combobox', { name: '权重' }).selectOption({ label: '只看环境' })
  await elt.getByRole('button', { name: '使用示例数据' }).click()
  await expect(page.getByText('7 个方案 × 34 个准则')).toBeVisible()
  await nav(page, '准则与权重').click()
  await expect(page.locator('section', { hasText: '实时排名' }).locator('ol > li span[title]').first()).toHaveText(
    'Devulcanisation',
  )
})

test('templates: columns are matched by alias when importing a table', async ({ page }) => {
  await page.goto('/')
  const csv =
    '产品,月销量,利润率（%）,尺寸,颜色\nMat,1800,28,standard,red\nLamp,2600,22,oversize,blue\nBox,900,31,standard,green\n'
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'products.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })
  await page.getByRole('combobox', { name: '按模板对应列' }).selectOption({ label: 'Amazon 美国站选品' })
  await expect(page.getByRole('combobox', { name: '模板准则: 月销量' })).toHaveValue('monthly_sales')
  await expect(page.getByRole('combobox', { name: '模板准则: 尺寸' })).toHaveValue('size_tier')
  await expect(page.getByRole('combobox', { name: '模板准则: 颜色' })).toHaveValue('')
  await page.getByRole('button', { name: /^导入/ }).click()
  await expect(page.getByText('3 个方案 × 3 个准则')).toBeVisible()
  // Matched columns take the template's names (shown as text on the weights page) and groups.
  await nav(page, '准则与权重').click()
  await expect(page.getByText('预估月销量', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '需求', exact: true })).toBeVisible()
})
