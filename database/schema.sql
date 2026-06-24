-- Hadirin AI - PostgreSQL 16+
-- UUID, case-insensitive email, and exclusion constraints.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended', 'inactive');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'intern');
CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent', 'leave', 'sick', 'remote');
CREATE TYPE attendance_event_type AS ENUM ('check_in', 'check_out', 'break_start', 'break_end');
CREATE TYPE approval_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE payroll_status AS ENUM ('draft', 'review', 'approved', 'paid', 'cancelled');
CREATE TYPE document_type AS ENUM ('ktp', 'ijazah', 'bpjs', 'npwp', 'sim', 'skck', 'cv', 'contract', 'medical');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug citext NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  api_base_url text,
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code IN ('owner', 'admin', 'hrd', 'manager', 'employee')),
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  email citext NOT NULL,
  username citext,
  password_hash text,
  provider text NOT NULL DEFAULT 'local' CHECK (provider IN ('local')),
  provider_subject text,
  status user_status NOT NULL DEFAULT 'invited',
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address inet,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_number text NOT NULL,
  full_name text NOT NULL,
  phone text,
  address text,
  job_title text NOT NULL,
  employment_type employment_type NOT NULL DEFAULT 'full_time',
  joined_on date NOT NULL,
  basic_salary numeric(14,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  overtime_hourly_rate numeric(12,2) NOT NULL DEFAULT 0 CHECK (overtime_hourly_rate >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_number)
);

CREATE TABLE employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type document_type NOT NULL,
  storage_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  expires_on date,
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, type)
);

CREATE TABLE face_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  embedding_ref text NOT NULL,
  model_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz
);

CREATE TABLE work_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  latitude numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL,
  radius_meters integer NOT NULL DEFAULT 100 CHECK (radius_meters BETWEEN 50 AND 100),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE shift_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  grace_minutes integer NOT NULL DEFAULT 0 CHECK (grace_minutes >= 0),
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  color text,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);

CREATE TABLE employee_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  available_on date NOT NULL,
  available_from time,
  available_until time,
  is_available boolean NOT NULL DEFAULT true,
  note text,
  UNIQUE (employee_id, available_on)
);

CREATE TABLE roster_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}',
  score numeric(5,2),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'review', 'published', 'failed')),
  warnings jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (period_end >= period_start)
);

CREATE TABLE shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_type_id uuid NOT NULL REFERENCES shift_types(id),
  roster_run_id uuid REFERENCES roster_runs(id) ON DELETE SET NULL,
  work_location_id uuid REFERENCES work_locations(id),
  shift_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'swap')),
  status approval_status NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
);

CREATE TABLE shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_assignment_id uuid NOT NULL REFERENCES shift_assignments(id),
  target_assignment_id uuid NOT NULL REFERENCES shift_assignments(id),
  requested_by uuid NOT NULL REFERENCES employees(id),
  reason text,
  status approval_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_assignment_id <> target_assignment_id)
);

CREATE TABLE attendance_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES shift_assignments(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  status attendance_status NOT NULL,
  first_check_in timestamptz,
  last_check_out timestamptz,
  worked_minutes integer NOT NULL DEFAULT 0 CHECK (worked_minutes >= 0),
  overtime_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
  late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  notes text,
  UNIQUE (employee_id, work_date)
);

CREATE TABLE attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_day_id uuid NOT NULL REFERENCES attendance_days(id) ON DELETE CASCADE,
  event_type attendance_event_type NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  device_captured_at timestamptz,
  server_captured_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_accuracy_meters numeric(8,2),
  distance_meters numeric(10,2),
  work_location_id uuid REFERENCES work_locations(id) ON DELETE SET NULL,
  work_location_name text,
  face_match_score numeric(5,4) CHECK (face_match_score BETWEEN 0 AND 1),
  liveness_score numeric(5,4) CHECK (liveness_score BETWEEN 0 AND 1),
  device_id text,
  evidence_storage_key text,
  anomaly_flags jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE location_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL,
  latitude numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL,
  accuracy_meters numeric(8,2),
  device_id text
);

CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('annual', 'sick', 'permission', 'unpaid')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text,
  status approval_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  CHECK (ends_on >= starts_on)
);

CREATE TABLE timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  regular_minutes integer NOT NULL DEFAULT 0,
  overtime_minutes integer NOT NULL DEFAULT 0,
  status approval_status NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  UNIQUE (employee_id, period_start, period_end)
);

CREATE TABLE payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date NOT NULL,
  status payroll_status NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  UNIQUE (organization_id, period_start, period_end)
);

CREATE TABLE payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  basic_salary numeric(14,2) NOT NULL DEFAULT 0,
  overtime_amount numeric(14,2) NOT NULL DEFAULT 0,
  allowance_amount numeric(14,2) NOT NULL DEFAULT 0,
  absence_deduction numeric(14,2) NOT NULL DEFAULT 0,
  late_deduction numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  other_deduction numeric(14,2) NOT NULL DEFAULT 0,
  net_salary numeric(14,2) GENERATED ALWAYS AS
    (basic_salary + overtime_amount + allowance_amount - absence_deduction - late_deduction - tax_amount - other_deduction) STORED,
  breakdown jsonb NOT NULL DEFAULT '{}',
  status payroll_status NOT NULL DEFAULT 'review',
  UNIQUE (payroll_period_id, employee_id)
);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_org_status ON users (organization_id, status);
CREATE INDEX idx_employees_org_active ON employees (organization_id, is_active);
CREATE INDEX idx_assignments_date_employee ON shift_assignments (shift_date, employee_id);
CREATE INDEX idx_attendance_work_date_status ON attendance_days (work_date, status);
CREATE INDEX idx_events_attendance_time ON attendance_events (attendance_day_id, captured_at);
CREATE INDEX idx_location_employee_time ON location_points (employee_id, recorded_at DESC);
CREATE INDEX idx_payroll_period_status ON payroll_periods (organization_id, status);
CREATE INDEX idx_audit_org_time ON audit_logs (organization_id, created_at DESC);
