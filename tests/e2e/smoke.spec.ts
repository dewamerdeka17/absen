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
  account_role: 'employee',
  must_change_password: false,
}

async function mockAuthenticatedApp(page, overrides: { employees?: unknown[]; locations?: unknown[]; session?: Record<string, unknown> } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('hadirin_token', 'test-token')
    localStorage.setItem('identime_theme', 'dark')
  })
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { user: overrides.session || adminSession, organization }, error: null }),
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
  await page.route('**/api/work-locations', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], error: null }),
      })
      return
    }
    await route.fallback()
  })
}

test('status endpoint is backed by Postgres', async ({ request }) => {
  const apiBase = process.env.PLAYWRIGHT_API_BASE_URL?.replace(/\/$/, '')
  const response = await request.get(apiBase ? `${apiBase}/api/status` : '/api/status')
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
  await page.route('**/api/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { configured: true, database: 'connected' }, error: null }),
  }))

  await page.goto('/')

  await expect(page).toHaveTitle(/IdenTime/)
  await expect(page.getByRole('heading', { name: /Siapkan ruang kerja|Selamat datang kembali/ })).toBeVisible()
  await expect(page.getByLabel(/Email \/ HP \/ nama \/ username|Email owner/)).toBeVisible()
  await expect(page.getByLabel('Kata sandi')).toBeVisible()
  await expect(page.getByLabel(/Ingat aku/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Google/i })).toHaveCount(0)
  await expect(page.getByText(/Server aplikasi|URL Vercel|Alamat API Vercel/i)).toHaveCount(0)
  await expect(page.getByText('Kamera dan lokasi hanya digunakan saat Anda menjalankan absensi.')).toHaveCount(0)
  await expect(page.getByText(/Cannot read properties/i)).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

for (const identifier of ['budi@example.com', '08123456789', '628123456789', '+628123456789', 'dewa', 'EMP-001']) {
test(`login accepts identifier "${identifier}"`, async ({ page }) => {
  let payload: Record<string, unknown> | null = null
  await page.route('**/api/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { configured: true, database: 'connected' }, error: null }),
  }))
  await page.route('**/api/auth/login', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { token: 'test-token', user: adminSession }, error: null }),
    })
  })
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { user: adminSession, organization }, error: null }),
  }))
  await page.route('**/api/dashboard', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { metrics: { employees: 0, present: 0, late: 0, absent: 0, leave: 0, swaps: 0 }, recent: [] }, error: null }),
  }))

  await page.goto('/')
  await page.getByLabel('Email / HP / nama / username').fill(identifier)
  await page.getByLabel('Kata sandi').fill('TempPass!234')
  await page.getByRole('button', { name: /Masuk ke IdenTime/ }).click()

  await expect(page.getByRole('heading', { name: 'Ringkasan hari ini' })).toBeVisible()
  expect(payload).toMatchObject({ identifier, password: 'TempPass!234' })
})
}

test('login duplicate-name error is clear and disappears when the user edits input', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { configured: true, database: 'connected' }, error: null }),
  }))
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({
      data: null,
      error: {
        code: 'NON_UNIQUE_NAME',
        message: 'Nama ini digunakan oleh lebih dari satu akun. Gunakan email, nomor HP, atau username Anda.',
      },
    }),
  }))

  await page.goto('/')
  await page.getByLabel('Email / HP / nama / username').fill('Dewa')
  await page.getByLabel('Kata sandi').fill('TempPass!234')
  await page.getByRole('button', { name: /Masuk ke IdenTime/ }).click()

  const error = page.getByText('Nama ini digunakan oleh lebih dari satu akun. Gunakan email, nomor HP, atau username Anda.')
  await expect(error).toBeVisible()
  await page.getByLabel('Email / HP / nama / username').fill('dewa')
  await expect(error).toHaveCount(0)
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
  await page.getByLabel('Username').fill('dewa')
  await expect(page.getByLabel('Password sementara')).toBeEnabled()
  await page.getByLabel('Password sementara').fill('TempPass!234')
  await page.getByLabel('Email akun').fill(' ADMIN@EXAMPLE.COM ')
  await page.getByLabel('Role akun').selectOption('hrd')
  await page.getByLabel('Divisi').fill(' Operasional ')
  await page.getByLabel('Jabatan').fill(' Owner ')
  await page.getByLabel('Gaji pokok').fill('3000000')
  await page.getByLabel('Tarif lembur/jam').fill('25000')
  await page.getByRole('button', { name: /Simpan/ }).click()

  await expect(page.getByText('Karyawan berhasil ditambahkan.')).toBeVisible()
  expect(payload).toMatchObject({
    fullName: 'Admin Test',
    employeeNumber: 'EMP-001',
    username: 'dewa',
    email: 'admin@example.com',
    temporaryPassword: 'TempPass!234',
    accountRole: 'hrd',
    department: 'Operasional',
    jobTitle: 'Owner',
    basicSalary: 3000000,
    overtimeHourlyRate: 25000,
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
  await page.getByLabel('Username').fill('budi')
  await page.getByLabel('Email akun').fill(' budi.baru@example.com ')
  await page.getByLabel('Password baru').fill('NewTemp!234')
  await page.getByRole('button', { name: /Simpan/ }).click()

  await expect(page.getByText('Karyawan berhasil diperbarui.')).toBeVisible()
  expect(payload).toMatchObject({
    fullName: 'Budi Santoso',
    employeeNumber: 'EMP-001',
    username: 'budi',
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

test('temporary password forces the signed in user to change password first', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  let payload: Record<string, unknown> | null = null
  await mockAuthenticatedApp(page, { session: { ...adminSession, mustChangePassword: true } })
  await page.route('**/api/me/password', async route => {
    payload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { updated: true }, error: null }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible()
  await page.getByLabel('Password lama').fill('TempPass!234')
  await page.getByLabel('Password baru').fill('NewPass!456')
  await page.getByLabel('Konfirmasi password').fill('NewPass!456')
  await page.getByRole('button', { name: /Ganti password/ }).click()

  await expect(page.getByText('Password berhasil diganti.')).toBeVisible()
  expect(payload).toMatchObject({ currentPassword: 'TempPass!234', newPassword: 'NewPass!456' })
})

test('employee role is guarded from employee management, payroll, and reports navigation', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  await mockAuthenticatedApp(page, { session: { ...adminSession, role: 'employee', employeeId: 'emp_1' } })

  await page.goto('/')

  await expect(page.getByRole('button', { name: /Karyawan/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Penggajian/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Laporan/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Live Tracking/ })).toBeVisible()
})

test('reports export downloads a xlsx workbook', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  await mockAuthenticatedApp(page, { employees: [employeeRecord] })
  await page.route('**/api/attendance?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ employee_id: 'emp_1', full_name: 'Budi Santoso', job_title: 'Staff', department: 'Operasional', event_type: 'check_in', captured_at: new Date().toISOString(), status: 'present', distance_meters: '12', accuracy_meters: '8', work_location_name: 'Kantor pusat' }], error: null }),
  }))
  await page.route('**/api/payroll?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { run: { id: 'run_1', month: '2026-06', status: 'review' }, items: [{ id: 'item_1', full_name: 'Budi Santoso', job_title: 'Staff', basic_salary: '3000000', overtime_amount: '0', late_deduction: '0', absence_deduction: '0', net_salary: '3000000', breakdown: {} }] }, error: null }),
  }))
  await page.route('**/api/rosters?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ id: 'roster_1', employee_id: 'emp_1', full_name: 'Budi Santoso', shift_date: '2026-06-24', shift_type_id: 'shift_1', shift_name: 'Pagi', start_time: '08:00:00', end_time: '17:00:00', color: '#12aeb2', source: 'auto' }], error: null }),
  }))

  await page.goto('/')
  await page.getByRole('button', { name: /Laporan/ }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('main').getByRole('button', { name: /Unduh XLSX/ }).first().click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.xlsx$/)
})

test('manager can configure a work location radius for attendance validation', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  let payload: Record<string, unknown> | null = null
  await mockAuthenticatedApp(page, { session: { ...adminSession, role: 'manager' } })
  await page.route('**/api/work-locations', async route => {
    if (route.request().method() === 'POST') {
      payload = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { id: 'loc_1' }, error: null }),
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
  await page.getByRole('button', { name: /Pengaturan/ }).click()
  await page.getByLabel('Nama lokasi').fill('Kantor pusat')
  await page.getByLabel('Latitude').fill('-6.200000')
  await page.getByLabel('Longitude').fill('106.816666')
  await page.getByLabel('Radius meter').fill('75')
  await page.getByRole('button', { name: /Tambah lokasi/ }).click()

  await expect(page.getByText('Lokasi kerja disimpan.')).toBeVisible()
  expect(payload).toMatchObject({
    name: 'Kantor pusat',
    latitude: -6.2,
    longitude: 106.816666,
    radiusMeters: 75,
    isActive: true,
  })
})

test('admin cannot configure work locations from settings', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  await mockAuthenticatedApp(page)

  await page.goto('/')
  await page.getByRole('button', { name: /Pengaturan/ }).click()

  await expect(page.getByRole('heading', { name: 'Lokasi kerja' })).toBeVisible()
  await expect(page.getByLabel('Nama lokasi')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Tambah lokasi/ })).toHaveCount(0)
})

test('admin without linked employee can send a browser location from live tracking', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'desktop navigation coverage')
  let locationPayload: Record<string, unknown> | null = null
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -6.2, longitude: 106.816666, accuracy: 18 })
  await mockAuthenticatedApp(page, { session: { ...adminSession, employeeId: null } })
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
          tracking_status: 'online',
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
