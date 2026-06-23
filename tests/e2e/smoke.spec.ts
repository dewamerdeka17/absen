import { expect, test } from '@playwright/test'

test('status endpoint is backed by Postgres', async ({ request }) => {
  const response = await request.get('/api/status')
  expect(response.ok()).toBe(true)

  const payload = await response.json()
  expect(payload).toMatchObject({
    data: {
      database: 'connected',
    },
    error: null,
  })
  expect(typeof payload.data.configured).toBe('boolean')
})

test('auth screen renders without a visible runtime error', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.goto('/')

  await expect(page).toHaveTitle(/IdenTime/)
  await expect(page.getByRole('heading', { name: /Siapkan ruang kerja|Selamat datang kembali/ })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Kata sandi')).toBeVisible()
  await expect(page.getByLabel(/Ingat aku/)).toBeVisible()
  await expect(page.getByText(/Server aplikasi|URL Vercel|Alamat API Vercel/i)).toHaveCount(0)
  await expect(page.getByText(/Cannot read properties/i)).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
