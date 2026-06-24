/// <reference types="node" />

import { Pool, type PoolClient } from '@neondatabase/serverless'
import { compare, hash } from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

type VercelRequest = {
  method?: string
  url?: string
  body?: unknown
  query: Record<string, string | string[] | undefined>
  headers: Record<string, string | undefined>
}

type VercelResponse = {
  status(code: number): VercelResponse
  json(value: unknown): VercelResponse
  end(): VercelResponse
  setHeader(name: string, value: string | string[]): VercelResponse
}

export const config = { maxDuration: 30 }

const connectionString = process.env.DATABASE_URL
const pool = connectionString ? new Pool({ connectionString }) : null
let schemaPromise: Promise<void> | null = null

const schemaSql = `
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta', api_base_url text,
  settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL, username text, password_hash text NOT NULL, full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','hrd','manager','employee')), status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT false,
  employee_id text, created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz,
  UNIQUE (organization_id, email)
);
CREATE TABLE IF NOT EXISTS employees (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_number text NOT NULL, full_name text NOT NULL, email text, phone text,
  department text NOT NULL DEFAULT 'Umum', job_title text NOT NULL,
  employment_type text NOT NULL DEFAULT 'full_time', joined_on date NOT NULL,
  basic_salary numeric(14,2) NOT NULL DEFAULT 0, overtime_hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
  document_status jsonb NOT NULL DEFAULT '{}', is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_number)
);
CREATE TABLE IF NOT EXISTS work_locations (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL, latitude numeric(9,6) NOT NULL, longitude numeric(9,6) NOT NULL,
  radius_meters integer NOT NULL DEFAULT 100 CHECK (radius_meters BETWEEN 50 AND 100),
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','admin','hrd','manager','employee'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_username ON users(organization_id, lower(username)) WHERE username IS NOT NULL AND username <> '';
CREATE TABLE IF NOT EXISTS shift_types (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL, code text NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
  grace_minutes integer NOT NULL DEFAULT 0, color text NOT NULL DEFAULT '#12aeb2', is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS shift_assignments (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_type_id text NOT NULL REFERENCES shift_types(id), shift_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual', status text NOT NULL DEFAULT 'published', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, shift_date)
);
CREATE TABLE IF NOT EXISTS attendance_events (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('check_in','check_out')),
  captured_at timestamptz NOT NULL DEFAULT now(), latitude numeric(9,6), longitude numeric(9,6),
  accuracy_meters numeric(9,2), face_proof_hash text, device_info text, status text NOT NULL DEFAULT 'present',
  device_captured_at timestamptz, server_captured_at timestamptz NOT NULL DEFAULT now(),
  distance_meters numeric(10,2), work_location_id text REFERENCES work_locations(id) ON DELETE SET NULL,
  work_location_name text
);
ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS device_captured_at timestamptz;
ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS server_captured_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS distance_meters numeric(10,2);
ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS work_location_id text REFERENCES work_locations(id) ON DELETE SET NULL;
ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS work_location_name text;
CREATE TABLE IF NOT EXISTS location_points (
  id bigserial PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE, recorded_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(9,6) NOT NULL, longitude numeric(9,6) NOT NULL, accuracy_meters numeric(9,2)
);
CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requester_id text NOT NULL REFERENCES employees(id), target_employee_id text REFERENCES employees(id),
  assignment_id text NOT NULL REFERENCES shift_assignments(id), reason text, status text NOT NULL DEFAULT 'pending',
  reviewed_by text REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE TABLE IF NOT EXISTS payroll_runs (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month text NOT NULL, status text NOT NULL DEFAULT 'review', created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz, approved_by text REFERENCES users(id), UNIQUE (organization_id, month)
);
CREATE TABLE IF NOT EXISTS payroll_items (
  id text PRIMARY KEY, payroll_run_id text NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id text NOT NULL REFERENCES employees(id), basic_salary numeric(14,2) NOT NULL,
  overtime_amount numeric(14,2) NOT NULL DEFAULT 0, late_deduction numeric(14,2) NOT NULL DEFAULT 0,
  absence_deduction numeric(14,2) NOT NULL DEFAULT 0, net_salary numeric(14,2) NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}', UNIQUE (payroll_run_id, employee_id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY, organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL, action text NOT NULL,
  entity_type text NOT NULL, entity_id text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_org ON employees(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_org_time ON attendance_events(organization_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_org_date ON shift_assignments(organization_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_locations_org_time ON location_points(organization_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_locations_org ON work_locations(organization_id, is_active);
`

async function ensureSchema() {
  if (!pool) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'DATABASE_URL belum dikonfigurasi di Vercel.')
  if (!schemaPromise) schemaPromise = (async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(82461356)')
      await client.query(schemaSql)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      schemaPromise = null
      throw error
    } finally {
      client.release()
    }
  })()
  return schemaPromise
}

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: unknown) { super(message) }
}

function duplicateEmployeeError(error: unknown) {
  const pgError = error as { code?: string; constraint?: string }
  if (pgError.code !== '23505') return null
  const constraint = String(pgError.constraint || '')
  if (constraint.includes('employee_number')) {
    return new ApiError(409, 'EMPLOYEE_NUMBER_EXISTS', 'Nomor karyawan sudah digunakan.')
  }
  if (constraint.includes('users') && constraint.includes('email')) {
    return new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'Email akun sudah terdaftar.')
  }
  return new ApiError(409, 'DUPLICATE_EMPLOYEE_DATA', 'Data karyawan sudah ada.')
}

type Role = 'owner' | 'admin' | 'hrd' | 'manager' | 'employee'
type Session = { uid: string; org: string; role: Role; name: string; employeeId?: string | null; mustChangePassword?: boolean }

const peopleRoles: readonly Role[] = ['owner', 'admin', 'hrd']
const operationsRoles: readonly Role[] = ['owner', 'admin', 'hrd', 'manager']
const workLocationRoles: readonly Role[] = ['owner', 'hrd', 'manager']

function normalizePhone(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return raw
  if (raw.startsWith('+')) return `+${digits}`
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`
  if (digits.startsWith('62')) return `+${digits}`
  return raw
}

function looksLikePhone(value: string) {
  return /^[+\d][\d\s().-]{7,}$/.test(value.trim())
}

function secret() {
  const value = process.env.JWT_SECRET || (!process.env.VERCEL ? 'local-development-secret-change-me' : '')
  if (!value || value.length < 24) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'JWT_SECRET minimal 24 karakter belum dikonfigurasi.')
  return new TextEncoder().encode(value)
}

async function issueToken(session: Session) {
  return new SignJWT(session).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').setSubject(session.uid).sign(secret())
}

function tokenFrom(req: VercelRequest) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  const match = req.headers.cookie?.match(/(?:^|; )hadirin_session=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

async function sessionFor(req: VercelRequest, required: boolean | readonly Role[] = false): Promise<Session> {
  const token = tokenFrom(req)
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.')
  try {
    const verified = await jwtVerify(token, secret())
    const tokenSession = verified.payload as unknown as Session
    const result = await pool!.query('SELECT id,organization_id,full_name,role,employee_id,status,must_change_password FROM users WHERE id=$1 LIMIT 1', [tokenSession.uid])
    const user = result.rows[0]
    if (!user || user.status !== 'active') throw new ApiError(401, 'SESSION_EXPIRED', 'Sesi telah berakhir. Silakan masuk kembali.')
    const session: Session = { uid: user.id, org: user.organization_id, role: user.role, name: user.full_name, employeeId: user.employee_id, mustChangePassword: user.must_change_password }
    const allowed = required === true ? peopleRoles : required || []
    if (allowed.length && !allowed.includes(session.role)) throw new ApiError(403, 'FORBIDDEN', 'Role akun tidak memiliki izin untuk aksi ini.')
    return session
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(401, 'SESSION_EXPIRED', 'Sesi telah berakhir. Silakan masuk kembali.')
  }
}

function send(res: VercelResponse, status: number, data: unknown, meta: Record<string, unknown> = {}) {
  return res.status(status).json({ data, meta: { requestId: randomUUID(), ...meta }, error: null })
}

function routePath(req: VercelRequest) {
  return (req.url || '').split('?')[0].replace(/^\/api/, '').replace(/\/$/, '') || '/'
}

function requestBody(req: VercelRequest) {
  const value = req.body
  const parseJson = (text: string) => {
    if (!text.trim()) return undefined
    try {
      return JSON.parse(text)
    } catch {
      throw new ApiError(400, 'INVALID_JSON', 'Body JSON tidak valid.')
    }
  }
  if (typeof value === 'string') return parseJson(value)
  if (Buffer.isBuffer(value)) return parseJson(value.toString('utf8'))
  return value
}

function body<T>(req: VercelRequest, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(requestBody(req))
  if (!parsed.success) {
    const flattened = parsed.error.flatten()
    throw new ApiError(400, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid.', {
      ...flattened.fieldErrors,
      ...(flattened.formErrors.length ? { _form: flattened.formErrors } : {}),
    })
  }
  return parsed.data
}

async function audit(client: PoolClient, session: Session, action: string, entityType: string, entityId?: string, metadata = {}) {
  await client.query('INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6)', [session.org, session.uid, action, entityType, entityId || null, JSON.stringify(metadata)])
}

const credentialsSchema = z.object({
  identifier: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  password: z.string().min(8),
}).refine(value => value.identifier || value.email, { message: 'Identifier wajib diisi.', path: ['identifier'] })
const setupSchema = z.object({ organizationName: z.string().min(2), fullName: z.string().min(2), email: z.string().email(), password: z.string().min(8) })
const passwordChangeSchema = z.object({ currentPassword: z.string().min(8), newPassword: z.string().min(8) })
const employeeSchema = z.object({
  fullName: z.string().min(2), email: z.string().email().optional().or(z.literal('')), phone: z.string().optional(),
  employeeNumber: z.string().min(1), department: z.string().min(1), jobTitle: z.string().min(1),
  employmentType: z.enum(['full_time','part_time','contract','intern']).default('full_time'),
  joinedOn: z.string(), basicSalary: z.coerce.number().nonnegative(), overtimeHourlyRate: z.coerce.number().nonnegative().default(0),
  temporaryPassword: z.string().min(8).optional(),
  accountRole: z.enum(['owner','admin','hrd','manager','employee']).default('employee').optional(),
})
const workLocationSchema = z.object({
  name: z.string().trim().min(2),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  radiusMeters: z.coerce.number().int().min(50).max(100).default(100),
  isActive: z.boolean().default(true).optional(),
})
const attendanceCheckSchema = z.object({
  eventType: z.enum(['check_in','check_out']),
  employeeId: z.string().optional(),
  latitude: z.number({ error: 'Koordinat latitude wajib dikirim.' }).gte(-90).lte(90),
  longitude: z.number({ error: 'Koordinat longitude wajib dikirim.' }).gte(-180).lte(180),
  accuracy: z.number({ error: 'Akurasi GPS wajib dikirim.' }).nonnegative(),
  faceProofHash: z.string().min(8, 'Foto wajib diambil sebelum absensi.'),
  deviceInfo: z.string().optional(),
  deviceTimestamp: z.string().datetime().optional(),
})

function businessDaysForMonth(value: string) {
  const [year, month] = value.split('-').map(Number)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month
  const isFuture = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)
  if (isFuture) return 0
  const end = isCurrent ? now.getDate() : lastDay
  let count = 0
  for (let day = 1; day <= end; day++) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count++
  }
  return count
}

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const earth = 6371000
  const toRad = (value: number) => value * Math.PI / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(h))
}

async function matchingWorkLocation(client: PoolClient, org: string, latitude: number, longitude: number) {
  const result = await client.query('SELECT id,name,latitude,longitude,radius_meters FROM work_locations WHERE organization_id=$1 AND is_active=true ORDER BY created_at', [org])
  if (!result.rowCount) throw new ApiError(400, 'WORK_LOCATION_REQUIRED', 'Lokasi kerja aktif belum diatur. Tambahkan lokasi kerja di Pengaturan.')
  const ranked = result.rows
    .map(row => ({
      id: row.id as string,
      name: row.name as string,
      radius: Number(row.radius_meters),
      distance: haversineMeters(latitude, longitude, Number(row.latitude), Number(row.longitude)),
    }))
    .sort((a, b) => a.distance - b.distance)
  const nearest = ranked[0]
  if (!nearest || nearest.distance > nearest.radius) {
    throw new ApiError(400, 'OUTSIDE_WORK_RADIUS', `Lokasi Anda berada ${Math.round(nearest?.distance || 0)} meter dari lokasi kerja terdekat. Maksimal ${nearest?.radius || 100} meter.`)
  }
  return nearest
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()

  await ensureSchema()
  const path = routePath(req)
  const method = req.method || 'GET'

  if (method === 'GET' && path === '/status') {
    const result = await pool!.query('SELECT EXISTS(SELECT 1 FROM users) AS configured')
    return send(res, 200, { configured: result.rows[0].configured, database: 'connected' })
  }

  if (method === 'POST' && path === '/setup') {
    const input = body(req, setupSchema)
    const client = await pool!.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(82461357)')
      const exists = await client.query('SELECT 1 FROM users LIMIT 1')
      if (exists.rowCount) throw new ApiError(409, 'ALREADY_CONFIGURED', 'Aplikasi sudah dikonfigurasi.')
      const orgId = randomUUID(), userId = randomUUID()
      const slug = input.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `org-${Date.now()}`
      await client.query('INSERT INTO organizations (id,name,slug) VALUES ($1,$2,$3)', [orgId,input.organizationName,slug])
      await client.query('INSERT INTO users (id,organization_id,email,username,password_hash,full_name,role,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [userId,orgId,input.email.toLowerCase(),input.email.toLowerCase(),await hash(input.password,12),input.fullName,'owner',false])
      await client.query('COMMIT')
      const session: Session = { uid:userId,org:orgId,role:'owner',name:input.fullName,mustChangePassword:false }
      const token = await issueToken(session)
      return send(res, 201, { token, user: session, organization: { id:orgId,name:input.organizationName } })
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  if (method === 'POST' && path === '/auth/login') {
    const input = body(req, credentialsSchema)
    const identifier = (input.identifier || input.email || '').trim()
    const normalizedPhone = looksLikePhone(identifier) ? normalizePhone(identifier) : ''
    const normalizedPhoneDigits = normalizedPhone.replace(/[^\d]/g, '')
    const direct = await pool!.query(`SELECT u.id,u.organization_id,u.email,u.password_hash,u.full_name,u.role,u.employee_id,u.status,u.must_change_password
      FROM users u
      LEFT JOIN employees e ON e.id=u.employee_id
      WHERE lower(u.email)=lower($1)
        OR lower(coalesce(u.username,''))=lower($1)
        OR lower(e.employee_number)=lower($1)
        OR ($2<>'' AND e.phone=$2)
        OR ($3<>'' AND regexp_replace(coalesce(e.phone,''),'[^0-9]','','g')=$3)
      ORDER BY u.last_login_at DESC NULLS LAST,u.created_at DESC
      LIMIT 1`,[identifier,normalizedPhone,normalizedPhoneDigits])
    let user = direct.rows[0]
    if (!user) {
      const byName = await pool!.query(`SELECT u.id,u.organization_id,u.email,u.password_hash,u.full_name,u.role,u.employee_id,u.status,u.must_change_password
        FROM users u
        LEFT JOIN employees e ON e.id=u.employee_id
        WHERE lower(u.full_name)=lower($1) OR lower(e.full_name)=lower($1)
        ORDER BY u.last_login_at DESC NULLS LAST,u.created_at DESC
        LIMIT 2`,[identifier])
      if (byName.rowCount && byName.rowCount > 1) throw new ApiError(409,'NON_UNIQUE_NAME','Nama tidak unik. Silakan login menggunakan email atau nomor HP.')
      user = byName.rows[0]
    }
    if (!user || user.status !== 'active' || !(await compare(input.password,user.password_hash))) throw new ApiError(401,'INVALID_CREDENTIALS','Username/email/nomor HP atau kata sandi salah.')
    await pool!.query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id])
    const session: Session = { uid:user.id,org:user.organization_id,role:user.role,name:user.full_name,employeeId:user.employee_id,mustChangePassword:user.must_change_password }
    const token = await issueToken(session)
    res.setHeader('Set-Cookie',`hadirin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`)
    return send(res,200,{ token,user:session })
  }

  if (method === 'POST' && path === '/auth/logout') {
    res.setHeader('Set-Cookie','hadirin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
    return res.status(204).end()
  }

  if (method === 'GET' && path === '/me') {
    const session = await sessionFor(req)
    const org = await pool!.query('SELECT id,name,slug,timezone,settings FROM organizations WHERE id=$1',[session.org])
    return send(res,200,{ user:session,organization:org.rows[0] })
  }

  if (method === 'PATCH' && path === '/me/password') {
    const session = await sessionFor(req)
    const input = body(req, passwordChangeSchema)
    const result = await pool!.query('SELECT password_hash FROM users WHERE id=$1 AND organization_id=$2 LIMIT 1',[session.uid,session.org])
    const user = result.rows[0]
    if (!user || !(await compare(input.currentPassword,user.password_hash))) throw new ApiError(401,'INVALID_CURRENT_PASSWORD','Password lama tidak sesuai.')
    await pool!.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2 AND organization_id=$3',[await hash(input.newPassword,12),session.uid,session.org])
    return send(res,200,{updated:true})
  }

  if (method === 'GET' && path === '/dashboard') {
    const session = await sessionFor(req)
    const [employees, attendance, recent, swaps] = await Promise.all([
      pool!.query('SELECT count(*)::int AS total FROM employees WHERE organization_id=$1 AND is_active=true',[session.org]),
      pool!.query(`SELECT count(DISTINCT employee_id)::int AS present,
        count(DISTINCT employee_id) FILTER (WHERE status='late')::int AS late
        FROM attendance_events WHERE organization_id=$1 AND event_type='check_in' AND (captured_at AT TIME ZONE 'Asia/Jakarta')::date=(now() AT TIME ZONE 'Asia/Jakarta')::date`,[session.org]),
      pool!.query(`SELECT a.id,a.event_type,a.captured_at,a.status,e.full_name,e.job_title
        FROM attendance_events a JOIN employees e ON e.id=a.employee_id WHERE a.organization_id=$1 ORDER BY a.captured_at DESC LIMIT 8`,[session.org]),
      pool!.query(`SELECT count(*)::int AS total FROM shift_swap_requests WHERE organization_id=$1 AND status='pending'`,[session.org]),
    ])
    const total=employees.rows[0].total, present=attendance.rows[0].present, late=attendance.rows[0].late
    return send(res,200,{ metrics:{employees:total,present,late,absent:Math.max(0,total-present),leave:0,swaps:swaps.rows[0].total},recent:recent.rows })
  }

  if (path === '/employees' && method === 'GET') {
    const session=await sessionFor(req)
    const result=await pool!.query(`SELECT e.*,u.role AS account_role,u.must_change_password
      FROM employees e
      LEFT JOIN users u ON u.employee_id=e.id AND u.organization_id=e.organization_id
      WHERE e.organization_id=$1 AND e.is_active=true
      ORDER BY e.created_at DESC`,[session.org])
    return send(res,200,result.rows)
  }

  if (path === '/employees' && method === 'POST') {
    const session=await sessionFor(req,true), input=body(req,employeeSchema), client=await pool!.connect(), id=randomUUID()
    try { await client.query('BEGIN')
      const email = input.email?.trim().toLowerCase() || null
      const phone = normalizePhone(input.phone)
      const accountRole = input.accountRole || 'employee'
      await client.query(`INSERT INTO employees (id,organization_id,employee_number,full_name,email,phone,department,job_title,employment_type,joined_on,basic_salary,overtime_hourly_rate)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,session.org,input.employeeNumber.trim(),input.fullName.trim(),email,phone||null,input.department.trim(),input.jobTitle.trim(),input.employmentType,input.joinedOn,input.basicSalary,input.overtimeHourlyRate])
      if(email){
        const existing = await client.query('SELECT id,employee_id FROM users WHERE organization_id=$1 AND lower(email)=lower($2) FOR UPDATE',[session.org,email])
        if(existing.rowCount){
          const linkedEmployeeId = existing.rows[0].employee_id
          if(linkedEmployeeId&&linkedEmployeeId!==id)throw new ApiError(409,'EMAIL_ALREADY_LINKED','Email ini sudah terhubung dengan karyawan lain.')
          await client.query('UPDATE users SET employee_id=$1,username=$2,full_name=$3,role=$4 WHERE id=$5',[id,input.employeeNumber.trim(),input.fullName.trim(),accountRole,existing.rows[0].id])
        }else if(input.temporaryPassword){
          await client.query('INSERT INTO users (id,organization_id,email,username,password_hash,full_name,role,employee_id,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),session.org,email,input.employeeNumber.trim(),await hash(input.temporaryPassword,12),input.fullName.trim(),accountRole,id,true])
        }else{
          throw new ApiError(400,'TEMPORARY_PASSWORD_REQUIRED','Password sementara wajib diisi jika email akun karyawan diisi.')
        }
      }
      await audit(client,session,'employee.create','employee',id); await client.query('COMMIT')
      return send(res,201,{id})
    } catch(error){
      await client.query('ROLLBACK')
      const duplicate = duplicateEmployeeError(error)
      throw duplicate || error
    } finally{client.release()}
  }

  const employeeMatch=path.match(/^\/employees\/([^/]+)$/)
  if(employeeMatch&&method==='PATCH'){
    const session=await sessionFor(req,true),input=body(req,employeeSchema.partial()),client=await pool!.connect()
    try{
      await client.query('BEGIN')
      const employeeId=employeeMatch[1]
      const existing=await client.query('SELECT * FROM employees WHERE id=$1 AND organization_id=$2 AND is_active=true FOR UPDATE',[employeeId,session.org])
      if(!existing.rowCount)throw new ApiError(404,'EMPLOYEE_NOT_FOUND','Karyawan tidak ditemukan.')
      const current=existing.rows[0]
      const values:unknown[]=[]
      const updates:string[]=[]
      const has=(key:keyof typeof input)=>Object.prototype.hasOwnProperty.call(input,key)
      const add=(column:string,value:unknown)=>{values.push(value);updates.push(`${column}=$${values.length}`)}
      if(has('fullName'))add('full_name',input.fullName!.trim())
      if(has('employeeNumber'))add('employee_number',input.employeeNumber!.trim())
      if(has('email'))add('email',input.email?.trim().toLowerCase()||null)
      if(has('phone'))add('phone',normalizePhone(input.phone)||null)
      if(has('department'))add('department',input.department!.trim())
      if(has('jobTitle'))add('job_title',input.jobTitle!.trim())
      if(has('employmentType'))add('employment_type',input.employmentType)
      if(has('joinedOn'))add('joined_on',input.joinedOn)
      if(has('basicSalary'))add('basic_salary',input.basicSalary)
      if(has('overtimeHourlyRate'))add('overtime_hourly_rate',input.overtimeHourlyRate)
      if(updates.length){
        values.push(employeeId,session.org)
        await client.query(`UPDATE employees SET ${updates.join(',')},updated_at=now() WHERE id=$${values.length-1} AND organization_id=$${values.length}`,values)
      }
      const fullName=has('fullName')?input.fullName!.trim():current.full_name
      const email=has('email')?input.email?.trim().toLowerCase()||null:(current.email?String(current.email).toLowerCase():null)
      const temporaryPassword=input.temporaryPassword?.trim()
      const accountRole=input.accountRole || undefined
      const employeeNumber=has('employeeNumber')?input.employeeNumber!.trim():current.employee_number
      const linked=(await client.query('SELECT id,email,role FROM users WHERE organization_id=$1 AND employee_id=$2 FOR UPDATE',[session.org,employeeId])).rows[0]
      if(email){
        const emailUser=(await client.query('SELECT id,employee_id FROM users WHERE organization_id=$1 AND lower(email)=lower($2) FOR UPDATE',[session.org,email])).rows[0]
        if(emailUser?.employee_id&&emailUser.employee_id!==employeeId)throw new ApiError(409,'EMAIL_ALREADY_LINKED','Email ini sudah terhubung dengan karyawan lain.')
        if(linked&&emailUser&&linked.id!==emailUser.id)throw new ApiError(409,'EMAIL_ALREADY_REGISTERED','Email akun sudah terdaftar.')
        const account=linked||emailUser
        if(account){
          if(temporaryPassword){
            await client.query('UPDATE users SET email=$1,username=$2,full_name=$3,employee_id=$4,password_hash=$5,status=$6,must_change_password=true,role=coalesce($7,role) WHERE id=$8',[email,employeeNumber,fullName,employeeId,await hash(temporaryPassword,12),'active',accountRole,account.id])
          }else{
            await client.query('UPDATE users SET email=$1,username=$2,full_name=$3,employee_id=$4,status=$5,role=coalesce($6,role) WHERE id=$7',[email,employeeNumber,fullName,employeeId,'active',accountRole,account.id])
          }
        }else{
          if(!temporaryPassword)throw new ApiError(400,'TEMPORARY_PASSWORD_REQUIRED','Password sementara wajib diisi untuk membuat akun karyawan.')
          await client.query('INSERT INTO users (id,organization_id,email,username,password_hash,full_name,role,employee_id,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),session.org,email,employeeNumber,await hash(temporaryPassword,12),fullName,accountRole||'employee',employeeId,true])
        }
      }else if(temporaryPassword){
        if(!linked)throw new ApiError(400,'EMPLOYEE_ACCOUNT_REQUIRED','Isi email akun untuk membuat atau mengubah password akun karyawan.')
        await client.query('UPDATE users SET password_hash=$1,full_name=$2,username=$3,must_change_password=true,role=coalesce($4,role) WHERE id=$5',[await hash(temporaryPassword,12),fullName,employeeNumber,accountRole,linked.id])
      }else if(linked&&(has('fullName')||has('employeeNumber'))){
        await client.query('UPDATE users SET full_name=$1,username=$2,role=coalesce($3,role) WHERE id=$4',[fullName,employeeNumber,accountRole,linked.id])
      }else if(linked&&accountRole){
        await client.query('UPDATE users SET role=$1 WHERE id=$2',[accountRole,linked.id])
      }
      await audit(client,session,'employee.update','employee',employeeId)
      await client.query('COMMIT')
      return send(res,200,{updated:true})
    }catch(error){
      await client.query('ROLLBACK')
      const duplicate=duplicateEmployeeError(error)
      throw duplicate||error
    }finally{client.release()}
  }
  if(employeeMatch&&method==='DELETE'){
    const session=await sessionFor(req,true);await pool!.query('UPDATE employees SET is_active=false,updated_at=now() WHERE id=$1 AND organization_id=$2',[employeeMatch[1],session.org]);return res.status(204).end()
  }

  if(path==='/attendance'&&method==='GET'){
    const session=await sessionFor(req); const date=typeof req.query.date==='string'?req.query.date:new Date().toISOString().slice(0,10)
    const canSeeAll=operationsRoles.includes(session.role)
    const params=canSeeAll?[session.org,date]:[session.org,date,session.employeeId]
    const scope=canSeeAll?'':' AND e.id=$3'
    const result=await pool!.query(`SELECT DISTINCT ON(e.id) e.id AS employee_id,e.full_name,e.job_title,e.department,a.event_type,a.captured_at,a.status,a.latitude,a.longitude
        ,a.accuracy_meters,a.distance_meters,a.work_location_name
      FROM employees e LEFT JOIN attendance_events a ON a.employee_id=e.id AND (a.captured_at AT TIME ZONE 'Asia/Jakarta')::date=$2::date
      WHERE e.organization_id=$1 AND e.is_active=true${scope} ORDER BY e.id,a.captured_at DESC`,params)
    return send(res,200,result.rows)
  }

  if(path==='/attendance/check'&&method==='POST'){
    const session=await sessionFor(req),input=body(req,attendanceCheckSchema),client=await pool!.connect()
    const employeeId=session.role==='employee'?session.employeeId:input.employeeId
    if(!employeeId)throw new ApiError(400,'EMPLOYEE_REQUIRED','Pilih karyawan atau tautkan akun ke data karyawan.')
    try{
      await client.query('BEGIN')
      const owned=await client.query('SELECT id FROM employees WHERE id=$1 AND organization_id=$2 AND is_active=true',[employeeId,session.org]);if(!owned.rowCount)throw new ApiError(404,'EMPLOYEE_NOT_FOUND','Karyawan tidak ditemukan.')
      const location=await matchingWorkLocation(client,session.org,input.latitude,input.longitude)
      const shift=await client.query(`SELECT st.start_time,st.grace_minutes FROM shift_assignments sa JOIN shift_types st ON st.id=sa.shift_type_id WHERE sa.employee_id=$1 AND sa.shift_date=(now() AT TIME ZONE 'Asia/Jakarta')::date`,[employeeId])
      let status='present';if(input.eventType==='check_in'&&shift.rows[0]){const [h,m]=String(shift.rows[0].start_time).split(':').map(Number);const now=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jakarta'}));if(now.getHours()*60+now.getMinutes()>h*60+m+shift.rows[0].grace_minutes)status='late'}
      const id=randomUUID(),capturedAt=new Date().toISOString()
      await client.query(`INSERT INTO attendance_events (id,organization_id,employee_id,event_type,latitude,longitude,accuracy_meters,face_proof_hash,device_info,status,device_captured_at,server_captured_at,distance_meters,work_location_id,work_location_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12,$13,$14)`,[id,session.org,employeeId,input.eventType,input.latitude,input.longitude,input.accuracy,input.faceProofHash,input.deviceInfo||null,status,input.deviceTimestamp||null,location.distance,location.id,location.name])
      await client.query('INSERT INTO location_points (organization_id,employee_id,latitude,longitude,accuracy_meters) VALUES ($1,$2,$3,$4,$5)',[session.org,employeeId,input.latitude,input.longitude,input.accuracy])
      await client.query('COMMIT')
      return send(res,201,{id,status,capturedAt,distanceMeters:Math.round(location.distance),workLocation:location.name})
    }catch(error){
      await client.query('ROLLBACK')
      throw error
    }finally{client.release()}
  }

  if(path==='/work-locations'&&method==='GET'){
    const session=await sessionFor(req)
    const result=await pool!.query('SELECT * FROM work_locations WHERE organization_id=$1 ORDER BY is_active DESC,created_at DESC',[session.org])
    return send(res,200,result.rows)
  }
  if(path==='/work-locations'&&method==='POST'){
    const session=await sessionFor(req,workLocationRoles),input=body(req,workLocationSchema),id=randomUUID()
    await pool!.query(`INSERT INTO work_locations (id,organization_id,name,latitude,longitude,radius_meters,is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,[id,session.org,input.name,input.latitude,input.longitude,input.radiusMeters,input.isActive ?? true])
    return send(res,201,{id})
  }
  const workLocationMatch=path.match(/^\/work-locations\/([^/]+)$/)
  if(workLocationMatch&&method==='PATCH'){
    const session=await sessionFor(req,workLocationRoles),input=body(req,workLocationSchema.partial())
    const result=await pool!.query(`UPDATE work_locations SET
      name=coalesce($1,name), latitude=coalesce($2,latitude), longitude=coalesce($3,longitude),
      radius_meters=coalesce($4,radius_meters), is_active=coalesce($5,is_active), updated_at=now()
      WHERE id=$6 AND organization_id=$7`,[input.name||null,input.latitude??null,input.longitude??null,input.radiusMeters??null,input.isActive??null,workLocationMatch[1],session.org])
    if(!result.rowCount)throw new ApiError(404,'WORK_LOCATION_NOT_FOUND','Lokasi kerja tidak ditemukan.')
    return send(res,200,{updated:true})
  }

  if(path==='/locations'&&method==='GET'){
    const session=await sessionFor(req)
    const canSeeAll=operationsRoles.includes(session.role)
    if(!canSeeAll&&!session.employeeId)throw new ApiError(400,'EMPLOYEE_REQUIRED','Akun belum ditautkan ke karyawan.')
    const params=canSeeAll?[session.org]:[session.org,session.employeeId]
    const onlyMine=canSeeAll?'':' AND l.employee_id=$2'
    const result=await pool!.query(`WITH active_attendance AS (
        SELECT DISTINCT ON (employee_id) employee_id,event_type,captured_at
        FROM attendance_events
        WHERE organization_id=$1 AND (captured_at AT TIME ZONE 'Asia/Jakarta')::date=(now() AT TIME ZONE 'Asia/Jakarta')::date
        ORDER BY employee_id,captured_at DESC
      ),
      latest_location AS (
        SELECT DISTINCT ON (employee_id) employee_id,latitude,longitude,accuracy_meters,recorded_at
        FROM location_points l
        WHERE organization_id=$1${onlyMine}
        ORDER BY employee_id,recorded_at DESC
      )
      SELECT l.employee_id,e.full_name,e.job_title,l.latitude,l.longitude,l.accuracy_meters,l.recorded_at,
        CASE WHEN l.recorded_at>now()-interval '90 seconds' THEN 'online'
             WHEN l.recorded_at>now()-interval '5 minutes' THEN 'stale'
             ELSE 'offline' END AS tracking_status
      FROM latest_location l
      JOIN active_attendance a ON a.employee_id=l.employee_id AND a.event_type='check_in'
      JOIN employees e ON e.id=l.employee_id AND e.organization_id=$1 AND e.is_active=true
      ORDER BY l.recorded_at DESC`,params);return send(res,200,result.rows)
  }
  if(path==='/locations'&&method==='POST'){
    const session=await sessionFor(req),input=body(req,z.object({latitude:z.number().gte(-90).lte(90),longitude:z.number().gte(-180).lte(180),accuracy:z.number().nonnegative().optional()})),client=await pool!.connect()
    try{
      await client.query('BEGIN')
      let employeeId=session.employeeId
      if(!employeeId&&operationsRoles.includes(session.role)){
        const user=(await client.query('SELECT email,full_name FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE',[session.uid,session.org])).rows[0]
        const existing=user?.email?(await client.query('SELECT id FROM employees WHERE organization_id=$1 AND lower(email)=lower($2) AND is_active=true LIMIT 1',[session.org,user.email])).rows[0]:null
        employeeId=existing?.id
        if(!employeeId){
          employeeId=randomUUID()
          let employeeNumber=`ADM-${session.uid.slice(0,8).toUpperCase()}`
          const numberExists=await client.query('SELECT 1 FROM employees WHERE organization_id=$1 AND employee_number=$2',[session.org,employeeNumber])
          if(numberExists.rowCount)employeeNumber=`ADM-${Date.now().toString(36).toUpperCase()}`
          await client.query(`INSERT INTO employees (id,organization_id,employee_number,full_name,email,department,job_title,employment_type,joined_on,basic_salary,overtime_hourly_rate)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[employeeId,session.org,employeeNumber,user?.full_name||session.name,user?.email||null,'Admin','Administrator','full_time',new Date().toISOString().slice(0,10),0,0])
        }
        await client.query('UPDATE users SET employee_id=$1 WHERE id=$2 AND organization_id=$3',[employeeId,session.uid,session.org])
      }
      if(!employeeId)throw new ApiError(400,'EMPLOYEE_REQUIRED','Akun belum ditautkan ke karyawan. Tambahkan data karyawan dengan email akun ini, lalu coba lagi.')
      const owned=await client.query('SELECT id FROM employees WHERE id=$1 AND organization_id=$2 AND is_active=true',[employeeId,session.org])
      if(!owned.rowCount)throw new ApiError(404,'EMPLOYEE_NOT_FOUND','Karyawan tertaut tidak ditemukan.')
      await client.query('INSERT INTO location_points (organization_id,employee_id,latitude,longitude,accuracy_meters) VALUES ($1,$2,$3,$4,$5)',[session.org,employeeId,input.latitude,input.longitude,input.accuracy||null])
      await client.query('COMMIT')
      return send(res,201,{recorded:true,employeeId})
    }catch(error){
      await client.query('ROLLBACK')
      throw error
    }finally{client.release()}
  }

  if(path==='/shift-types'&&method==='GET'){
    const session=await sessionFor(req);const result=await pool!.query('SELECT * FROM shift_types WHERE organization_id=$1 AND is_active=true ORDER BY start_time',[session.org]);return send(res,200,result.rows)
  }
  if(path==='/shift-types'&&method==='POST'){
    const session=await sessionFor(req,operationsRoles),input=body(req,z.object({name:z.string().min(2),code:z.string().min(1),startTime:z.string(),endTime:z.string(),graceMinutes:z.coerce.number().nonnegative().default(0),color:z.string().default('#12aeb2')})),id=randomUUID();await pool!.query('INSERT INTO shift_types (id,organization_id,name,code,start_time,end_time,grace_minutes,color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,session.org,input.name,input.code,input.startTime,input.endTime,input.graceMinutes,input.color]);return send(res,201,{id})
  }

  if(path==='/rosters'&&method==='GET'){
    const session=await sessionFor(req);const from=String(req.query.from||new Date().toISOString().slice(0,10)),to=String(req.query.to||from);const result=await pool!.query(`SELECT sa.id,sa.employee_id,e.full_name,sa.shift_date,st.id AS shift_type_id,st.name AS shift_name,st.start_time,st.end_time,st.color,sa.source FROM shift_assignments sa JOIN employees e ON e.id=sa.employee_id JOIN shift_types st ON st.id=sa.shift_type_id WHERE sa.organization_id=$1 AND sa.shift_date BETWEEN $2 AND $3 ORDER BY e.full_name,sa.shift_date`,[session.org,from,to]);return send(res,200,result.rows)
  }
  if(path==='/rosters/generate'&&method==='POST'){
    const session=await sessionFor(req,operationsRoles),input=body(req,z.object({periodStart:z.string(),periodEnd:z.string(),shiftTypeIds:z.array(z.string()).optional()})),client=await pool!.connect()
    try{await client.query('BEGIN');const employees=(await client.query('SELECT id FROM employees WHERE organization_id=$1 AND is_active=true ORDER BY created_at',[session.org])).rows;const shifts=(await client.query('SELECT id FROM shift_types WHERE organization_id=$1 AND is_active=true ORDER BY start_time',[session.org])).rows;if(!employees.length||!shifts.length)throw new ApiError(400,'ROSTER_INPUT_REQUIRED','Tambahkan karyawan dan tipe shift terlebih dahulu.');const start=new Date(`${input.periodStart}T00:00:00Z`),end=new Date(`${input.periodEnd}T00:00:00Z`);if(end<start||(+end-+start)/86400000>31)throw new ApiError(400,'INVALID_PERIOD','Periode maksimal 31 hari.');await client.query('DELETE FROM shift_assignments WHERE organization_id=$1 AND shift_date BETWEEN $2 AND $3',[session.org,input.periodStart,input.periodEnd]);let count=0,dayIndex=0;for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1),dayIndex++){if(d.getUTCDay()===0||d.getUTCDay()===6)continue;for(let i=0;i<employees.length;i++){const shift=shifts[(i+dayIndex)%shifts.length];await client.query('INSERT INTO shift_assignments (id,organization_id,employee_id,shift_type_id,shift_date,source) VALUES ($1,$2,$3,$4,$5,$6)',[randomUUID(),session.org,employees[i].id,shift.id,d.toISOString().slice(0,10),'auto']);count++}}await audit(client,session,'roster.generate','roster',undefined,{periodStart:input.periodStart,periodEnd:input.periodEnd,count});await client.query('COMMIT');return send(res,201,{assignments:count})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }

  if(path==='/swaps'&&method==='GET'){
    const session=await sessionFor(req);const result=await pool!.query(`SELECT s.*,e.full_name,sa.shift_date,st.name AS shift_name FROM shift_swap_requests s JOIN employees e ON e.id=s.requester_id JOIN shift_assignments sa ON sa.id=s.assignment_id JOIN shift_types st ON st.id=sa.shift_type_id WHERE s.organization_id=$1 ORDER BY s.created_at DESC`,[session.org]);return send(res,200,result.rows)
  }
  const swapReview=path.match(/^\/swaps\/([^/]+)\/review$/)
  if(swapReview&&method==='PATCH'){const session=await sessionFor(req,true),input=body(req,z.object({status:z.enum(['approved','rejected'])}));await pool!.query('UPDATE shift_swap_requests SET status=$1,reviewed_by=$2,reviewed_at=now() WHERE id=$3 AND organization_id=$4',[input.status,session.uid,swapReview[1],session.org]);return send(res,200,{status:input.status})}

  if(path==='/payroll'&&method==='GET'){
    const session=await sessionFor(req,true),month=String(req.query.month||new Date().toISOString().slice(0,7));const run=await pool!.query('SELECT * FROM payroll_runs WHERE organization_id=$1 AND month=$2',[session.org,month]);if(!run.rowCount)return send(res,200,{run:null,items:[]});const items=await pool!.query(`SELECT pi.*,e.full_name,e.job_title,e.department FROM payroll_items pi JOIN employees e ON e.id=pi.employee_id WHERE pi.payroll_run_id=$1 ORDER BY e.full_name`,[run.rows[0].id]);return send(res,200,{run:run.rows[0],items:items.rows})
  }
  if(path==='/payroll/generate'&&method==='POST'){
    const session=await sessionFor(req,true),input=body(req,z.object({month:z.string().regex(/^\d{4}-\d{2}$/)})),client=await pool!.connect(),runId=randomUUID();try{await client.query('BEGIN');const old=await client.query('SELECT id,status FROM payroll_runs WHERE organization_id=$1 AND month=$2',[session.org,input.month]);if(old.rows[0]?.status==='approved')throw new ApiError(409,'PAYROLL_APPROVED','Payroll yang disetujui tidak dapat dihitung ulang.');if(old.rowCount){await client.query('DELETE FROM payroll_runs WHERE id=$1',[old.rows[0].id])}const workdays=businessDaysForMonth(input.month);if(!workdays)throw new ApiError(400,'INVALID_PAYROLL_MONTH','Payroll untuk bulan mendatang belum dapat dihitung.');await client.query('INSERT INTO payroll_runs (id,organization_id,month) VALUES ($1,$2,$3)',[runId,session.org,input.month]);const employees=(await client.query('SELECT * FROM employees WHERE organization_id=$1 AND is_active=true',[session.org])).rows;const [year,month]=input.month.split('-').map(Number);for(const employee of employees){const stats=(await client.query(`SELECT count(DISTINCT (captured_at AT TIME ZONE 'Asia/Jakarta')::date) FILTER(WHERE event_type='check_in')::int AS days,count(DISTINCT (captured_at AT TIME ZONE 'Asia/Jakarta')::date) FILTER(WHERE event_type='check_in' AND status='late')::int AS late FROM attendance_events WHERE employee_id=$1 AND EXTRACT(YEAR FROM captured_at AT TIME ZONE 'Asia/Jakarta')=$2 AND EXTRACT(MONTH FROM captured_at AT TIME ZONE 'Asia/Jakarta')=$3`,[employee.id,year,month])).rows[0];const absences=Math.max(0,workdays-stats.days),absenceDeduction=Number(employee.basic_salary)/workdays*absences,lateDeduction=Number(employee.basic_salary)/workdays/8*.5*stats.late,overtime=0,net=Math.max(0,Number(employee.basic_salary)+overtime-absenceDeduction-lateDeduction);await client.query(`INSERT INTO payroll_items (id,payroll_run_id,employee_id,basic_salary,overtime_amount,late_deduction,absence_deduction,net_salary,breakdown) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),runId,employee.id,employee.basic_salary,overtime,lateDeduction,absenceDeduction,net,JSON.stringify({daysPresent:stats.days,lateDays:stats.late,absentDays:absences,workdays})])}await audit(client,session,'payroll.generate','payroll',runId,{month:input.month});await client.query('COMMIT');return send(res,201,{runId,employees:employees.length})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
  const payrollApprove=path.match(/^\/payroll\/([^/]+)\/approve$/)
  if(payrollApprove&&method==='POST'){const session=await sessionFor(req,true);await pool!.query(`UPDATE payroll_runs SET status='approved',approved_at=now(),approved_by=$1 WHERE id=$2 AND organization_id=$3`,[session.uid,payrollApprove[1],session.org]);return send(res,200,{approved:true})}

  if(path==='/organization'&&method==='PATCH'){const session=await sessionFor(req,true),input=body(req,z.object({name:z.string().min(2).optional(),timezone:z.string().optional(),settings:z.record(z.string(),z.unknown()).optional()}));await pool!.query('UPDATE organizations SET name=coalesce($1,name),timezone=coalesce($2,timezone),settings=settings||$3::jsonb WHERE id=$4',[input.name||null,input.timezone||null,JSON.stringify(input.settings||{}),session.org]);return send(res,200,{updated:true})}

  throw new ApiError(404,'NOT_FOUND','Endpoint tidak ditemukan.')
}

export default async function api(req: VercelRequest,res: VercelResponse){
  try{return await handler(req,res)}catch(error){
    const known=error instanceof ApiError
    const status=known?error.status:500,code=known?error.code:'INTERNAL_ERROR',message=known?error.message:'Terjadi kesalahan pada server.'
    if(!known)console.error(error)
    return res.status(status).json({data:null,meta:{requestId:randomUUID()},error:{code,message,fields:known?error.fields:undefined}})
  }
}
