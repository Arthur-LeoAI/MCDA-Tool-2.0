import { expect, test, type Page } from '@playwright/test'

// New users start in the guided mode (S8).
const next = (page: Page) => page.getByRole('button', { name: 'Next' })
const step = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Guided' }).getByRole('button', { name })

test('guided: Amazon scenario, import with aliases, ranking, conclusion, then expert mode', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'What are you deciding?' })).toBeVisible()
  await page
    .getByRole('region', { name: 'Amazon US product selection' })
    .getByRole('button', { name: 'Choose' })
    .click()

  // Import: the template's word for alternatives is "product".
  await expect(page.getByRole('heading', { name: 'Import your product data' })).toBeVisible()
  const csv =
    'Product,Monthly sales,Margin (%),Fees %,Reviews,Size\n' +
    'Mat,1800,28,34,4200,standard\nLamp,2600,22,30,9800,standard\nBox,900,31,41,650,oversize\nBrush,1500,35,33,2300,standard\n'
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })

  // Columns: matched by alias without choosing the template again.
  await expect(page.getByRole('combobox', { name: 'Template criterion: Monthly sales' })).toHaveValue('monthly_sales')
  await expect(page.getByRole('combobox', { name: 'Template criterion: Size' })).toHaveValue('size_tier')
  await page.getByRole('button', { name: /^Import \d+ criteria/ }).click() // not the Import step

  // Check.
  await expect(page.getByText('4 product(s), 5 criteria')).toBeVisible()
  await expect(page.getByText('The data can be analysed.')).toBeVisible()
  await next(page).click()

  // Criteria: the template's scoring, with its notes in the settings.
  await expect(page.getByRole('heading', { name: 'How is each criterion scored?' })).toBeVisible()
  await expect(page.getByText('Logarithmic (diminishing returns)').first()).toBeVisible()
  await next(page).click()

  // Weights: rank the groups (the template already ranks them) and rank within profit.
  await expect(page.getByRole('heading', { name: 'Which criteria matter most?' })).toBeVisible()
  const profit = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Profit', exact: true }) })
  await profit.getByRole('radio', { name: 'Ranking' }).click()
  await expect(profit.getByRole('button', { name: 'Move up: Platform and fulfilment fees' })).toBeVisible()
  await next(page).click()

  // Conclusion.
  await expect(page.getByText(/^Recommended: (Mat|Lamp|Box|Brush)/)).toBeVisible()
  await expect(page.getByText(/^Confidence: \w+\. In /)).toBeVisible()

  // Expert mode works on the same project.
  await page.getByRole('button', { name: 'Explore in expert mode' }).click()
  await expect(page.getByRole('heading', { name: 'Results', level: 1 })).toBeVisible()
  await expect(page.locator('section', { hasText: 'Ranking comparison' }).locator('tbody tr')).toHaveCount(4)
  await page.getByRole('radio', { name: 'Guided' }).click()
  await expect(page.getByRole('heading', { name: 'Conclusion', level: 1 })).toBeVisible()
})

test('guided: example data goes straight to the check step', async ({ page }) => {
  await page.goto('/app')
  const elt = page.getByRole('region', { name: 'ELT technology assessment' })
  await elt.getByRole('button', { name: 'Use example data' }).click()
  await expect(page.getByText('7 technology(s), 34 criteria')).toBeVisible()
  await expect(step(page, 'Check')).toHaveAttribute('aria-current', 'step')
  await step(page, 'Conclusion').click()
  await expect(page.getByText(/^Recommended: /)).toBeVisible()
})
