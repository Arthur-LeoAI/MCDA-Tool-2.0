import { expect, test, type Page } from '@playwright/test'

// New users start in the guided mode (S8).
const next = (page: Page) => page.getByRole('button', { name: '下一步' })
const step = (page: Page, name: string) => page.getByRole('navigation', { name: '引导' }).getByRole('button', { name })

test('guided: Amazon scenario, import with aliases, ranking, conclusion, then expert mode', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: '你要做什么样的决策？' })).toBeVisible()
  await page.getByRole('region', { name: 'Amazon 美国站选品' }).getByRole('button', { name: '选这个场景' }).click()

  // Import: the template's word for alternatives is "产品".
  await expect(page.getByRole('heading', { name: '导入产品数据' })).toBeVisible()
  const csv =
    '产品,月销量,利润率（%）,费用占比,评论数,尺寸\n' +
    'Mat,1800,28,34,4200,standard\nLamp,2600,22,30,9800,standard\nBox,900,31,41,650,oversize\nBrush,1500,35,33,2300,standard\n'
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })

  // Columns: matched by alias without choosing the template again.
  await expect(page.getByRole('combobox', { name: '模板准则: 月销量' })).toHaveValue('monthly_sales')
  await expect(page.getByRole('combobox', { name: '模板准则: 尺寸' })).toHaveValue('size_tier')
  await page.getByRole('button', { name: /^导入 \d+ 个准则/ }).click() // not the 导入 step

  // Check.
  await expect(page.getByText('4 个产品，5 个准则')).toBeVisible()
  await expect(page.getByText('数据可以用来分析。')).toBeVisible()
  await next(page).click()

  // Criteria: the template's scoring, with its notes in the settings.
  await expect(page.getByRole('heading', { name: '每个准则怎么打分？' })).toBeVisible()
  await expect(page.getByText('对数（增长放缓）').first()).toBeVisible()
  await next(page).click()

  // Weights: rank the groups (the template already ranks them) and rank within profit.
  await expect(page.getByRole('heading', { name: '哪些准则更重要？' })).toBeVisible()
  const profit = page.locator('section').filter({ has: page.getByRole('heading', { name: '盈利', exact: true }) })
  await profit.getByRole('radio', { name: '排序' }).click()
  await expect(profit.getByRole('button', { name: '上移: 平台和物流费用占比' })).toBeVisible()
  await next(page).click()

  // Conclusion.
  await expect(page.getByText(/^推荐 (Mat|Lamp|Box|Brush)/)).toBeVisible()
  await expect(page.getByText(/^可靠程度：.。在/)).toBeVisible()

  // Expert mode works on the same project.
  await page.getByRole('button', { name: '在专家模式中深入查看' }).click()
  await expect(page.getByRole('heading', { name: '结果', level: 1 })).toBeVisible()
  await expect(page.locator('section', { hasText: '排名对比' }).locator('tbody tr')).toHaveCount(4)
  await page.getByRole('radio', { name: '引导' }).click()
  await expect(page.getByRole('heading', { name: '结论', level: 1 })).toBeVisible()
})

test('guided: example data goes straight to the check step', async ({ page }) => {
  await page.goto('/app')
  const elt = page.getByRole('region', { name: 'ELT 技术评估' })
  await elt.getByRole('button', { name: '使用示例数据' }).click()
  await expect(page.getByText('7 个技术，34 个准则')).toBeVisible()
  await expect(step(page, '检查')).toHaveAttribute('aria-current', 'step')
  await step(page, '结论').click()
  await expect(page.getByText(/^推荐 /)).toBeVisible()
})
