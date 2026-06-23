import { expect, test } from '@playwright/test'

const adminSession = {
  uid: 'user_test_admin',
  org: 'org_test',
  role: 'admin',
  name: 'Admin Test',
  employeeId: 'emp_admin',
}

const organization = {
  id: 'org_test',
  name: 'Test Workspace',
  slug: 'test-workspace',
  timezone: 'Asia/Jakarta',
}

const employeeRecord = {
  id: 'emp_1',
  employee_number: 'EMP-001',
  full_name: 'Budi Santoso',
  email: 'budi@example.com',
  phone: '08123456789',
  department: 'Operasional',
  job_title: 'Staff',
  employment_type: 'full_time',
  joined_on: '2026-06-01',
  basic_salary: '5000000',
  overtime_hourly_rate: '25000',
  document_status: {},
}

async function mockAuthenticatedApp(page, overrides: { employees?: unknown[]; locations?: unknown[] } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('hadirin_token', 'test-token')
    localStorage.setItem('identime_theme', 'dark')
  })
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { user: adminSession, organization }, error: null }),
  }))
  await page.route('**/api/dashboard', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: { metrics: { employees: 0, present: 0, late: 0, absent: 0, leave: 0, swaps: 0 }, recent: [] },
      error: null,
    }),
  }))
  await page.route('**/api/employees', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: overrides.employees || [], error: null }),
      })
      return
    }
    await route.fallback()
  })
  await page.route('**/api/locations', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: overrides.locations || [], error: null }),
      })
      return
    }
    await route.fallback()
  })
}

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

test('admin can submit the add employee form with normalized data', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  let payload: Record<string, unknown> | null = null
  await mockAuthenticatedApp(page)
  await page.route('**/api/employees', async route => {
    if (route.request().method() === 'POST') {
      payload = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { id: 'emp_new' }, error: null }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], error: null }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Karyawan/ }).click()
  await page.getByRole('main').getByRole('button', { name: 'Tambah pertama' }).click()
  await page.getByLabel('Nama lengkap').fill('  Admin Test  ')
  await page.getByLabel('Nomor karyawan').fill(' EMP-001 ')
  await page.getByLabel('Email akun').fill(' ADMIN@EXAMPLE.COM ')
  await page.getByLabel('Password sementara').fill('TempPass!234')
  await page.getByLabel('Divisi').fill(' Operasional ')
  await page.getByLabel('Jabatan').fill(' Owner ')
  await page.getByLabel('Gaji pokok').fill('')
  await page.getByLabel('Tarif lembur/jam').fill('')
  await page.getByRole('button', { name: /Simpan/ }).click()

  await expect(page.getByText('Karyawan berhasil ditambahkan.')).toBeVisible()
  expect(payload).toMatchObject({
    fullName: 'Admin Test',
    employeeNumber: 'EMP-001',
    email: 'admin@example.com',
    temporaryPassword: 'TempPass!234',
    department: 'Operasional',
    jobTitle: 'Owner',
    basicSalary: 0,
    overtimeHourlyRate: 0,
  })
})

test('admin can edit an employee account and reset the password', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  let payload: Record<string, unknown> | null = null
  await mockAuthenticatedApp(page, { employees: [employeeRecord] })
  await page.route('**/api/employees/emp_1', async route => {
    if (route.request().method() === 'PATCH') {
      payload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { updated: true }, error: null }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Karyawan/ }).click()
  await page.getByRole('button', { name: /Edit Budi Santoso/ }).click()
  await page.getByLabel('Email akun').fill(' budi.baru@example.com ')
  await page.getByLabel('Password baru').fill('NewTemp!234')
  await page.getByRole('button', { name: /Simpan/ }).click()

  await expect(page.getByText('Karyawan berhasil diperbarui.')).toBeVisible()
  expect(payload).toMatchObject({
    fullName: 'Budi Santoso',
    employeeNumber: 'EMP-001',
    email: 'budi.baru@example.com',
    temporaryPassword: 'NewTemp!234',
  })
})

test('signed in user can change their own password', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  let payload: Record<string, unknown> | null = null
  await mockAuthenticatedApp(page)
  await page.route('**/api/me/password', async route => {
    payload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { updated: true }, error: null }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Profil/ }).click()
  await page.getByLabel('Password lama').fill('OldPass!123')
  await page.getByLabel('Password baru').fill('NewPass!456')
  await page.getByLabel('Konfirmasi password').fill('NewPass!456')
  await page.getByRole('button', { name: /Ganti password/ }).click()

  await expect(page.getByText('Password berhasil diganti.')).toBeVisible()
  expect(payload).toMatchObject({
    currentPassword: 'OldPass!123',
    newPassword: 'NewPass!456',
  })
})

test('admin can send a browser location from live tracking', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  let locationPayload: Record<string, unknown> | null = null
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -6.2, longitude: 106.816666, accuracy: 18 })
  await mockAuthenticatedApp(page)
  await page.route('**/api/locations', async route => {
    if (route.request().method() === 'POST') {
      locationPayload = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { recorded: true }, error: null }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: locationPayload ? [{
          employee_id: 'emp_admin',
          full_name: 'Admin Test',
          job_title: 'Owner',
          latitude: String(locationPayload.latitude),
          longitude: String(locationPayload.longitude),
          accuracy_meters: String(locationPayload.accuracy),
          recorded_at: new Date().toISOString(),
        }] : [],
        error: null,
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Live Tracking/ }).click()
  await page.getByRole('button', { name: /Kirim lokasi saya/ }).click()

  await expect(page.getByText('Lokasi kerja berhasil diperbarui.')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: /Admin Test/ })).toBeVisible()
  expect(locationPayload).toMatchObject({
    latitude: -6.2,
    longitude: 106.816666,
    accuracy: 18,
  })
})
