import { Pool } from '@neondatabase/serverless'
import { hash } from 'bcryptjs'
import { randomUUID } from 'node:crypto'

const required = ['DATABASE_URL', 'ORG_NAME', 'OWNER_NAME', 'OWNER_EMAIL', 'OWNER_PASSWORD']
const missing = required.filter(key => !process.env[key])

if (missing.length) {
  console.error(`Environment variable wajib diisi: ${missing.join(', ')}`)
  process.exit(1)
}

if (process.env.OWNER_PASSWORD.length < 8) {
  console.error('OWNER_PASSWORD minimal 8 karakter.')
  process.exit(1)
}

const slug = (process.env.ORG_SLUG || process.env.ORG_NAME)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || `org-${Date.now()}`

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const client = await pool.connect()

try {
  await client.query('BEGIN')
  await client.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
      timezone text NOT NULL DEFAULT 'Asia/Jakarta', api_base_url text,
      settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email text NOT NULL, username text, password_hash text NOT NULL, full_name text NOT NULL,
      role text NOT NULL DEFAULT 'owner', status text NOT NULL DEFAULT 'active',
      must_change_password boolean NOT NULL DEFAULT false,
      employee_id text, created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz,
      UNIQUE (organization_id, email)
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','admin','hrd','manager','employee'));
  `)
  const org = await client.query(
    `INSERT INTO organizations (id,name,slug)
     VALUES ($1,$2,$3)
     ON CONFLICT (slug) DO UPDATE SET name=excluded.name
     RETURNING id`,
    [randomUUID(), process.env.ORG_NAME, slug],
  )
  const orgId = org.rows[0].id
  const email = process.env.OWNER_EMAIL.toLowerCase()
  const exists = await client.query('SELECT 1 FROM users WHERE organization_id=$1 AND lower(email)=lower($2) LIMIT 1', [orgId, email])
  if (exists.rowCount) {
    throw new Error(`User ${email} sudah ada di organisasi ${process.env.ORG_NAME}.`)
  }
  await client.query(
    `INSERT INTO users (id,organization_id,email,username,password_hash,full_name,role,status,must_change_password)
     VALUES ($1,$2,$3,$4,$5,$6,'owner','active',false)`,
    [randomUUID(), orgId, email, email, await hash(process.env.OWNER_PASSWORD, 12), process.env.OWNER_NAME],
  )
  await client.query('COMMIT')
  console.log(`Owner dibuat: ${email}`)
  console.log(`Organisasi: ${process.env.ORG_NAME} (${slug})`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
