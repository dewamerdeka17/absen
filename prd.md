# Product Requirement Document (PRD): AI-Based Attendance & HR Management System

## 1. Project Overview
We want to build a comprehensive Mobile-Responsive Web Application or Native Mobile App for an **AI-Based Attendance & HR Management System** (Aplikasi Absensi Berbasis AI). The system focuses on automated scheduling, real-time employee tracking, payroll management, and AI-assisted features like face recognition and automated shift rostering.

---

## 2. User Roles
1. **Superadmin / HR Admin:** Full access to dashboard metrics, employee documents, tracking, shift approvals, payroll generation, and reporting.
2. **Employee:** Access to check-in/out, request shift swaps, view personal timesheets, and view personal payslips.

---

## 3. Core Features & Functional Requirements

### 3.1. Authentication & Onboarding
* **Multi-method Login:** Standard email/username + password, Sign-In with Google, and Sign-In with GitHub.
* **Server Address Configuration:** Option to dynamically switch or input server API addresses.
* **User Management:** Admin can reset employee passwords and generate strong, secure random temporary passwords.

### 3.2. Admin Dashboard & Metrics
* **Real-time Status Counters:** Display total employees, active daily attendance, late arrivals, absences, approved leaves, and security alerts.
* **Graphical Insights:** Weekly/Monthly trends for attendance rates, punctuality, and overall productivity.
* **Activity Log:** Recent logs of employee check-ins/outs with exact timestamps.

### 3.3. AI-Powered Face Recognition Attendance
* **AI Face Match:** Check-in validation using device camera with facial biometrics.
* **Geo-Fencing & Live Tracking:** Integration with maps (e.g., Google Maps/OpenStreetMap) to trace real-time device locations of employees while active, plus historical movement paths over the last 7 days.

### 3.4. AI Auto Roster & Shift Management
* **Manual Shifts:** Configure specific types (e.g., Morning Shift: 07:00-17:00, Night Shift: 14:00-23:00) with grace periods/tolerance limits.
* **AI Auto Roster:** Automated AI-driven scheduling based on date ranges, employee availability, and shift types.
* **Shift Swap Requests (Tukar Shift):** Employees can submit a request to swap shifts. Admin reviews and actions this via an approval/rejection queue.

### 3.5. Automated Payroll (Penggajian)
* **Calculation Engine:** Automates net salary calculations based on basic salary, overtime hours, absences, and late-arrival deductions.
* **Approval Flow:** Admin reviews calculated payroll breakdowns per individual before confirming.
* **Multi-Format Export:** Ability to export monthly payslips/payroll summaries into PDF, MS Word, or Image formats.

### 3.6. Employee Management & Digital Documents
* **Profile Database:** Store personal details, contact information, employment type (Full-Time, Contract, etc.), and joining date.
* **Document Vault:** Secure upload and storage indicators for required employee documents:
  * ID Card (KTP), Degree/Certificate (Ijazah), Health Insurance (BPJS), Tax ID (NPWP), Driver's License (SIM), Police Clearance (SKCK), Resume/CV, Employment Contract, and Medical Certificate.

### 3.7. Timesheet, Reports & Operations
* **Timesheet Tracking:** View daily actual hours worked, overtime logs, and status (Draft, Pending, Approved).
* **Reporting Module:** Generate tabular system reports for Employee Rosters, General Attendance, User Accounts, Shift Details, Timesheets, and Payroll Ledger. Export capabilities to PDF, Word, and Excel.

---

## 4. UI/UX & Technical Specifications
* **Design Aesthetic:** Minimalist, clean corporate style with a modern blue/white color scheme, rounded UI components, and intuitive iconography.
* **Navigation:** Bottom navigation bar for easy access to core views (Home, Maps, Camera/Scan, Profile, Settings) and a comprehensive left-hand drawer menu for system-wide modules.
* **Tech Stack Recommendation:** 
  * Frontend: Flutter (for cross-platform mobile) or React/Next.js with Tailwind CSS (optimized for mobile web).
  * Backend: Node.js/Express or Python FastAPI (to easily support AI face recognition and scheduling models).

---

# Prompt for Claude: Action Plan & Implementation
Based on the PRD above, please execute the following:
1. Provide a clean, modular Database Schema (PostgreSQL or MongoDB) to support users, roles, attendance logs, shift rosters, and payroll structures.
2. Draft the API Endpoint Specifications for the Authentication and AI Auto Roster modules.
3. Write a boilerplate implementation code for the core application layout or state management using the framework of your choice (e.g., React or Flutter).