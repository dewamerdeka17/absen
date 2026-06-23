/// <reference types="node" />

import { Pool, type PoolClient } from '@neondatabase/serverless'
import { compare, hash } from 'bcryptjs'
import { createRemoteJWKSet, SignJWT, jwtVerify } from 'jose'
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
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const googleIssuers = new Set(['https://accounts.google.com', 'accounts.google.com'])

const schemaSql = `
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta', api_base_url text,
  settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL, password_hash text NOT NULL, full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','employee')), status text NOT NULL DEFAULT 'active',
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;
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
  accuracy_meters numeric(9,2), face_proof_hash text, device_info text, status text NOT NULL DEFAULT 'present'
);
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

type Session = { uid: string; org: string; role: 'admin' | 'employee'; name: string; employeeId?: string | null }

function secret() {
  const value = process.env.JWT_SECRET || (!process.env.VERCEL ? 'local-development-secret-change-me' : '')
  if (!value || value.length < 24) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'JWT_SECRET minimal 24 karakter belum dikonfigurasi.')
  return new TextEncoder().encode(value)
}

async function issueToken(session: Session) {
  return new SignJWT(session).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').setSubject(session.uid).sign(secret())
}

function requestOrigin(req: VercelRequest) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || (host?.includes('localhost') ? 'http' : 'https')
  if (!host) return 'http://localhost:5173'
  return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`
}

function requestUrl(req: VercelRequest) {
  return new URL(req.url || '/', requestOrigin(req))
}

function normalizeOrigin(value?: string | null) {
  if (!value) return null
  try { return new URL(value).origin } catch { return null }
}

function allowedReturnTo(req: VercelRequest, value?: string | null) {
  const fallback = requestOrigin(req)
  const allowed = new Set(
    [fallback, process.env.APP_ORIGIN, ...(process.env.OAUTH_ALLOWED_ORIGINS || '').split(',')]
      .map(v => normalizeOrigin(v))
      .filter((v): v is string => Boolean(v)),
  )
  const origin = normalizeOrigin(value) || fallback
  return allowed.has(origin) ? origin : fallback
}

function redirect(res: VercelResponse, location: string) {
  res.setHeader('Location', location)
  return res.status(302).end()
}

function oauthRedirectUri(req: VercelRequest) {
  return process.env.GOOGLE_REDIRECT_URI || `${requestOrigin(req)}/api/auth/google/callback`
}

function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

function oauthErrorUrl(returnTo: string, message: string) {
  const target = new URL(returnTo)
  target.searchParams.set('oauth_error', message)
  return target.toString()
}

async function googleState(returnTo: string, nonce: string) {
  return new SignJWT({ provider: 'google', returnTo, nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret())
}

async function returnToFromState(req: VercelRequest, state?: string | null) {
  if (!state) return allowedReturnTo(req, null)
  try {
    const verified = await jwtVerify(state, secret())
    const returnTo = typeof verified.payload.returnTo === 'string' ? verified.payload.returnTo : null
    return allowedReturnTo(req, returnTo)
  } catch {
    return allowedReturnTo(req, null)
  }
}

async function startGoogleOAuth(req: VercelRequest, res: VercelResponse) {
  const url = requestUrl(req)
  const returnTo = allowedReturnTo(req, url.searchParams.get('returnTo'))
  const config = googleConfig()
  if (!config) return redirect(res, oauthErrorUrl(returnTo, 'Google OAuth belum dikonfigurasi di server.'))

  const nonce = randomUUID()
  const state = await googleState(returnTo, nonce)
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', config.clientId)
  authUrl.searchParams.set('redirect_uri', oauthRedirectUri(req))
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('nonce', nonce)
  authUrl.searchParams.set('prompt', 'select_account')
  return redirect(res, authUrl.toString())
}

async function finishGoogleOAuth(req: VercelRequest, res: VercelResponse) {
  const url = requestUrl(req)
  const state = url.searchParams.get('state')
  const returnTo = await returnToFromState(req, state)

  try {
    const config = googleConfig()
    if (!config) throw new ApiError(503, 'GOOGLE_OAUTH_NOT_CONFIGURED', 'Google OAuth belum dikonfigurasi di server.')
    const code = url.searchParams.get('code')
    if (url.searchParams.get('error')) throw new ApiError(400, 'GOOGLE_OAUTH_CANCELLED', 'Login Google dibatalkan.')
    if (!code || !state) throw new ApiError(400, 'GOOGLE_OAUTH_INVALID_CALLBACK', 'Callback Google tidak lengkap.')

    const stateResult = await jwtVerify(state, secret())
    if (stateResult.payload.provider !== 'google' || typeof stateResult.payload.nonce !== 'string') {
      throw new ApiError(400, 'GOOGLE_OAUTH_INVALID_STATE', 'Sesi login Google tidak valid.')
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: oauthRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    })
    const tokenPayload = await tokenResponse.json() as { id_token?: string; error_description?: string }
    if (!tokenResponse.ok || !tokenPayload.id_token) {
      throw new ApiError(401, 'GOOGLE_OAUTH_TOKEN_FAILED', tokenPayload.error_description || 'Token Google tidak dapat diverifikasi.')
    }

    const verified = await jwtVerify(tokenPayload.id_token, googleJwks, { audience: config.clientId })
    const googlePayload = verified.payload
    if (!googleIssuers.has(String(googlePayload.iss))) throw new ApiError(401, 'GOOGLE_OAUTH_INVALID_ISSUER', 'Issuer Google tidak valid.')
    if (googlePayload.nonce !== stateResult.payload.nonce) throw new ApiError(401, 'GOOGLE_OAUTH_INVALID_NONCE', 'Sesi login Google tidak cocok.')
    const email = typeof googlePayload.email === 'string' ? googlePayload.email.toLowerCase() : ''
    if (!email || (googlePayload.email_verified !== true && googlePayload.email_verified !== 'true')) {
      throw new ApiError(401, 'GOOGLE_EMAIL_NOT_VERIFIED', 'Email Google belum terverifikasi.')
    }

    const result = await pool!.query('SELECT id,organization_id,email,full_name,role,employee_id,status FROM users WHERE lower(email)=lower($1) AND status=$2', [email, 'active'])
    if (!result.rowCount) throw new ApiError(403, 'GOOGLE_EMAIL_NOT_REGISTERED', 'Email Google belum terdaftar di IdenTime.')
    if (result.rowCount > 1) throw new ApiError(409, 'GOOGLE_EMAIL_AMBIGUOUS', 'Email Google terdaftar di lebih dari satu organisasi.')
    const user = result.rows[0]
    await pool!.query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id])
    const session: Session = { uid: user.id, org: user.organization_id, role: user.role, name: user.full_name, employeeId: user.employee_id }
    const token = await issueToken(session)
    res.setHeader('Set-Cookie', `hadirin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`)
    const target = new URL(returnTo)
    target.searchParams.set('oauth_token', token)
    return redirect(res, target.toString())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login Google gagal.'
    return redirect(res, oauthErrorUrl(returnTo, message))
  }
}

function tokenFrom(req: VercelRequest) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  const match = req.headers.cookie?.match(/(?:^|; )hadirin_session=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

async function sessionFor(req: VercelRequest, admin = false): Promise<Session> {
  const token = tokenFrom(req)
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.')
  try {
    const verified = await jwtVerify(token, secret())
    const session = verified.payload as unknown as Session
    if (admin && session.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Akses admin diperlukan.')
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

function body<T>(req: VercelRequest, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid.', parsed.error.flatten().fieldErrors)
  return parsed.data
}

async function audit(client: PoolClient, session: Session, action: string, entityType: string, entityId?: string, metadata = {}) {
  await client.query('INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6)', [session.org, session.uid, action, entityType, entityId || null, JSON.stringify(metadata)])
}

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) })
const employeeSchema = z.object({
  fullName: z.string().min(2), email: z.string().email().optional().or(z.literal('')), phone: z.string().optional(),
  employeeNumber: z.string().min(1), department: z.string().min(1), jobTitle: z.string().min(1),
  employmentType: z.enum(['full_time','part_time','contract','intern']).default('full_time'),
  joinedOn: z.string(), basicSalary: z.coerce.number().nonnegative(), overtimeHourlyRate: z.coerce.number().nonnegative().default(0),
  temporaryPassword: z.string().min(8).optional(),
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

  if (method === 'GET' && path === '/auth/google/start') return startGoogleOAuth(req, res)

  if (method === 'GET' && path === '/auth/google/callback') return finishGoogleOAuth(req, res)

  if (method === 'POST' && path === '/setup') {
    const input = body(req, z.object({ organizationName: z.string().min(2), fullName: z.string().min(2) }).merge(credentialsSchema))
    const client = await pool!.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(82461357)')
      const exists = await client.query('SELECT 1 FROM users LIMIT 1')
      if (exists.rowCount) throw new ApiError(409, 'ALREADY_CONFIGURED', 'Aplikasi sudah dikonfigurasi.')
      const orgId = randomUUID(), userId = randomUUID()
      const slug = input.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `org-${Date.now()}`
      await client.query('INSERT INTO organizations (id,name,slug) VALUES ($1,$2,$3)', [orgId,input.organizationName,slug])
      await client.query('INSERT INTO users (id,organization_id,email,password_hash,full_name,role) VALUES ($1,$2,$3,$4,$5,$6)', [userId,orgId,input.email.toLowerCase(),await hash(input.password,12),input.fullName,'admin'])
      await client.query('COMMIT')
      const session: Session = { uid:userId,org:orgId,role:'admin',name:input.fullName }
      const token = await issueToken(session)
      return send(res, 201, { token, user: session, organization: { id:orgId,name:input.organizationName } })
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  if (method === 'POST' && path === '/auth/login') {
    const input = body(req, credentialsSchema)
    const result = await pool!.query('SELECT id,organization_id,email,password_hash,full_name,role,employee_id,status FROM users WHERE lower(email)=lower($1) LIMIT 1',[input.email])
    const user = result.rows[0]
    if (!user || user.status !== 'active' || !(await compare(input.password,user.password_hash))) throw new ApiError(401,'INVALID_CREDENTIALS','Email atau kata sandi salah.')
    await pool!.query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id])
    const session: Session = { uid:user.id,org:user.organization_id,role:user.role,name:user.full_name,employeeId:user.employee_id }
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
    const result=await pool!.query('SELECT * FROM employees WHERE organization_id=$1 AND is_active=true ORDER BY created_at DESC',[session.org])
    return send(res,200,result.rows)
  }

  if (path === '/employees' && method === 'POST') {
    const session=await sessionFor(req,true), input=body(req,employeeSchema), client=await pool!.connect(), id=randomUUID()
    try { await client.query('BEGIN')
      await client.query(`INSERT INTO employees (id,organization_id,employee_number,full_name,email,phone,department,job_title,employment_type,joined_on,basic_salary,overtime_hourly_rate)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,session.org,input.employeeNumber,input.fullName,input.email||null,input.phone||null,input.department,input.jobTitle,input.employmentType,input.joinedOn,input.basicSalary,input.overtimeHourlyRate])
      if(input.email&&input.temporaryPassword){await client.query('INSERT INTO users (id,organization_id,email,password_hash,full_name,role,employee_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),session.org,input.email.toLowerCase(),await hash(input.temporaryPassword,12),input.fullName,'employee',id])}
      await audit(client,session,'employee.create','employee',id); await client.query('COMMIT')
      return send(res,201,{id})
    } catch(error){await client.query('ROLLBACK');throw error} finally{client.release()}
  }

  const employeeMatch=path.match(/^\/employees\/([^/]+)$/)
  if(employeeMatch&&method==='PATCH'){
    const session=await sessionFor(req,true),input=body(req,employeeSchema.partial())
    const keys:Record<string,string>={fullName:'full_name',email:'email',phone:'phone',employeeNumber:'employee_number',department:'department',jobTitle:'job_title',employmentType:'employment_type',joinedOn:'joined_on',basicSalary:'basic_salary',overtimeHourlyRate:'overtime_hourly_rate'}
    const entries=Object.entries(input).filter(([key,value])=>keys[key]&&value!==undefined)
    if(!entries.length)throw new ApiError(400,'NO_CHANGES','Tidak ada perubahan.')
    const values=entries.map(([,value])=>value); values.push(employeeMatch[1],session.org)
    await pool!.query(`UPDATE employees SET ${entries.map(([key],i)=>`${keys[key]}=$${i+1}`).join(',')},updated_at=now() WHERE id=$${values.length-1} AND organization_id=$${values.length}`,values)
    return send(res,200,{updated:true})
  }
  if(employeeMatch&&method==='DELETE'){
    const session=await sessionFor(req,true);await pool!.query('UPDATE employees SET is_active=false,updated_at=now() WHERE id=$1 AND organization_id=$2',[employeeMatch[1],session.org]);return res.status(204).end()
  }

  if(path==='/attendance'&&method==='GET'){
    const session=await sessionFor(req); const date=typeof req.query.date==='string'?req.query.date:new Date().toISOString().slice(0,10)
    const result=await pool!.query(`SELECT DISTINCT ON(e.id) e.id AS employee_id,e.full_name,e.job_title,e.department,a.event_type,a.captured_at,a.status,a.latitude,a.longitude
      FROM employees e LEFT JOIN attendance_events a ON a.employee_id=e.id AND (a.captured_at AT TIME ZONE 'Asia/Jakarta')::date=$2::date
      WHERE e.organization_id=$1 AND e.is_active=true ORDER BY e.id,a.captured_at DESC`,[session.org,date])
    return send(res,200,result.rows)
  }

  if(path==='/attendance/check'&&method==='POST'){
    const session=await sessionFor(req),input=body(req,z.object({eventType:z.enum(['check_in','check_out']),employeeId:z.string().optional(),latitude:z.number().optional(),longitude:z.number().optional(),accuracy:z.number().optional(),faceProofHash:z.string().optional(),deviceInfo:z.string().optional()}))
    const employeeId=session.role==='employee'?session.employeeId:input.employeeId
    if(!employeeId)throw new ApiError(400,'EMPLOYEE_REQUIRED','Pilih karyawan atau tautkan akun ke data karyawan.')
    const owned=await pool!.query('SELECT id FROM employees WHERE id=$1 AND organization_id=$2 AND is_active=true',[employeeId,session.org]);if(!owned.rowCount)throw new ApiError(404,'EMPLOYEE_NOT_FOUND','Karyawan tidak ditemukan.')
    const shift=await pool!.query(`SELECT st.start_time,st.grace_minutes FROM shift_assignments sa JOIN shift_types st ON st.id=sa.shift_type_id WHERE sa.employee_id=$1 AND sa.shift_date=(now() AT TIME ZONE 'Asia/Jakarta')::date`,[employeeId])
    let status='present';if(input.eventType==='check_in'&&shift.rows[0]){const [h,m]=String(shift.rows[0].start_time).split(':').map(Number);const now=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jakarta'}));if(now.getHours()*60+now.getMinutes()>h*60+m+shift.rows[0].grace_minutes)status='late'}
    const id=randomUUID();await pool!.query(`INSERT INTO attendance_events (id,organization_id,employee_id,event_type,latitude,longitude,accuracy_meters,face_proof_hash,device_info,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,session.org,employeeId,input.eventType,input.latitude||null,input.longitude||null,input.accuracy||null,input.faceProofHash||null,input.deviceInfo||null,status])
    return send(res,201,{id,status,capturedAt:new Date().toISOString()})
  }

  if(path==='/locations'&&method==='GET'){
    const session=await sessionFor(req,true);const result=await pool!.query(`SELECT DISTINCT ON(l.employee_id) l.employee_id,e.full_name,e.job_title,l.latitude,l.longitude,l.accuracy_meters,l.recorded_at FROM location_points l JOIN employees e ON e.id=l.employee_id WHERE l.organization_id=$1 AND l.recorded_at>now()-interval '7 days' ORDER BY l.employee_id,l.recorded_at DESC`,[session.org]);return send(res,200,result.rows)
  }
  if(path==='/locations'&&method==='POST'){
    const session=await sessionFor(req),input=body(req,z.object({latitude:z.number(),longitude:z.number(),accuracy:z.number().optional()}));if(!session.employeeId)throw new ApiError(400,'EMPLOYEE_REQUIRED','Akun belum ditautkan ke karyawan.');await pool!.query('INSERT INTO location_points (organization_id,employee_id,latitude,longitude,accuracy_meters) VALUES ($1,$2,$3,$4,$5)',[session.org,session.employeeId,input.latitude,input.longitude,input.accuracy||null]);return send(res,201,{recorded:true})
  }

  if(path==='/shift-types'&&method==='GET'){
    const session=await sessionFor(req);const result=await pool!.query('SELECT * FROM shift_types WHERE organization_id=$1 AND is_active=true ORDER BY start_time',[session.org]);return send(res,200,result.rows)
  }
  if(path==='/shift-types'&&method==='POST'){
    const session=await sessionFor(req,true),input=body(req,z.object({name:z.string().min(2),code:z.string().min(1),startTime:z.string(),endTime:z.string(),graceMinutes:z.coerce.number().nonnegative().default(0),color:z.string().default('#12aeb2')})),id=randomUUID();await pool!.query('INSERT INTO shift_types (id,organization_id,name,code,start_time,end_time,grace_minutes,color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,session.org,input.name,input.code,input.startTime,input.endTime,input.graceMinutes,input.color]);return send(res,201,{id})
  }

  if(path==='/rosters'&&method==='GET'){
    const session=await sessionFor(req);const from=String(req.query.from||new Date().toISOString().slice(0,10)),to=String(req.query.to||from);const result=await pool!.query(`SELECT sa.id,sa.employee_id,e.full_name,sa.shift_date,st.id AS shift_type_id,st.name AS shift_name,st.start_time,st.end_time,st.color,sa.source FROM shift_assignments sa JOIN employees e ON e.id=sa.employee_id JOIN shift_types st ON st.id=sa.shift_type_id WHERE sa.organization_id=$1 AND sa.shift_date BETWEEN $2 AND $3 ORDER BY e.full_name,sa.shift_date`,[session.org,from,to]);return send(res,200,result.rows)
  }
  if(path==='/rosters/generate'&&method==='POST'){
    const session=await sessionFor(req,true),input=body(req,z.object({periodStart:z.string(),periodEnd:z.string(),shiftTypeIds:z.array(z.string()).optional()})),client=await pool!.connect()
    try{await client.query('BEGIN');const employees=(await client.query('SELECT id FROM employees WHERE organization_id=$1 AND is_active=true ORDER BY created_at',[session.org])).rows;const shifts=(await client.query('SELECT id FROM shift_types WHERE organization_id=$1 AND is_active=true ORDER BY start_time',[session.org])).rows;if(!employees.length||!shifts.length)throw new ApiError(400,'ROSTER_INPUT_REQUIRED','Tambahkan karyawan dan tipe shift terlebih dahulu.');const start=new Date(`${input.periodStart}T00:00:00Z`),end=new Date(`${input.periodEnd}T00:00:00Z`);if(end<start||(+end-+start)/86400000>31)throw new ApiError(400,'INVALID_PERIOD','Periode maksimal 31 hari.');await client.query('DELETE FROM shift_assignments WHERE organization_id=$1 AND shift_date BETWEEN $2 AND $3',[session.org,input.periodStart,input.periodEnd]);let count=0,dayIndex=0;for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1),dayIndex++){if(d.getUTCDay()===0||d.getUTCDay()===6)continue;for(let i=0;i<employees.length;i++){const shift=shifts[(i+dayIndex)%shifts.length];await client.query('INSERT INTO shift_assignments (id,organization_id,employee_id,shift_type_id,shift_date,source) VALUES ($1,$2,$3,$4,$5,$6)',[randomUUID(),session.org,employees[i].id,shift.id,d.toISOString().slice(0,10),'ai']);count++}}await audit(client,session,'roster.generate','roster',undefined,{periodStart:input.periodStart,periodEnd:input.periodEnd,count});await client.query('COMMIT');return send(res,201,{assignments:count})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
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
