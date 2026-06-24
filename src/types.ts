export type NavId =
  | 'dashboard'
  | 'attendance'
  | 'employees'
  | 'roster'
  | 'payroll'
  | 'reports'
  | 'maps'
  | 'profile'
  | 'settings'

export type Session = {
  uid: string
  org: string
  role: 'owner' | 'admin' | 'hrd' | 'manager' | 'employee'
  name: string
  employeeId?: string | null
  mustChangePassword?: boolean
}

export type Organization = {
  id: string
  name: string
  slug: string
  timezone: string
  settings?: Record<string, unknown>
}

export type Employee = {
  id: string
  employee_number: string
  full_name: string
  email?: string
  phone?: string
  department: string
  job_title: string
  employment_type: string
  joined_on: string
  basic_salary: string
  overtime_hourly_rate: string
  document_status: Record<string, boolean>
  account_role?: Session['role']
  account_username?: string
  must_change_password?: boolean
}

export type AttendanceRow = {
  employee_id: string
  full_name: string
  job_title: string
  department: string
  event_type?: string
  captured_at?: string
  status?: string
  latitude?: string
  longitude?: string
  accuracy_meters?: string
  distance_meters?: string
  work_location_name?: string
}

export type WorkLocation = {
  id: string
  name: string
  latitude: string
  longitude: string
  radius_meters: number
  is_active: boolean
}

export type DashboardData = {
  metrics: { employees: number; present: number; late: number; absent: number; leave: number; swaps: number }
  recent: Array<{ id: string; event_type: string; captured_at: string; status: string; full_name: string; job_title: string }>
}

export type ShiftType = {
  id: string; name: string; code: string; start_time: string; end_time: string; grace_minutes: number; color: string
}

export type RosterRow = {
  id: string; employee_id: string; full_name: string; shift_date: string; shift_type_id: string
  shift_name: string; start_time: string; end_time: string; color: string; source: string
}

export type PayrollData = {
  run: null | { id: string; month: string; status: string; approved_at?: string }
  items: Array<{
    id: string; full_name: string; job_title: string; basic_salary: string
    overtime_amount: string; late_deduction: string; absence_deduction: string; net_salary: string
    breakdown: Record<string, number>
  }>
}
