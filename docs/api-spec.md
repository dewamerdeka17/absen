# API Specification — Authentication & AI Auto Roster

Base path: `/api/v1`  
Content type: `application/json`  
Authentication: short-lived Bearer access token; rotating refresh token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.

All responses use this envelope:

```json
{
  "data": {},
  "meta": { "requestId": "req_01J..." },
  "error": null
}
```

Errors use an appropriate HTTP status and a stable machine-readable code:

```json
{
  "data": null,
  "meta": { "requestId": "req_01J..." },
  "error": { "code": "VALIDATION_ERROR", "message": "Input tidak valid", "fields": { "email": "Wajib diisi" } }
}
```

## Authentication

### `POST /auth/login`

Login by organization, email/username, and password. Rate limit: 5 attempts / 15 minutes per IP and identity.

```json
{
  "organization": "nusantara-digital",
  "identity": "dimas@nusantaradigital.id",
  "password": "secret"
}
```

`200` returns `{ user, organization, accessToken, expiresIn: 900 }` and sets the refresh cookie. Possible errors: `401 INVALID_CREDENTIALS`, `423 ACCOUNT_SUSPENDED`, `429 RATE_LIMITED`.

### `GET /auth/oauth/:provider/start`

Provider is `google` or `github`. Query: `organization`, optional `redirectUri`. Generates signed state + PKCE and redirects to the provider. The callback endpoint is `GET /auth/oauth/:provider/callback?code=...&state=...` and redirects back to the configured frontend with a one-time exchange code.

### `POST /auth/oauth/exchange`

Exchanges the short-lived, single-use callback code for a session.

```json
{ "code": "otc_..." }
```

### `POST /auth/refresh`

Rotates the refresh token cookie and returns a new access token. Reuse detection revokes the token family.

### `POST /auth/logout`

Revokes the current refresh token and clears the cookie. Returns `204`.

### `GET /auth/me`

Returns current user, employee profile, role, and effective permissions.

### `POST /auth/password/forgot`

```json
{ "organization": "nusantara-digital", "email": "user@example.com" }
```

Always returns `202` to prevent account enumeration.

### `POST /auth/password/reset`

```json
{ "token": "reset-token", "newPassword": "new strong password" }
```

Revokes all existing sessions after success.

### `POST /admin/users/:userId/temporary-password`

Permission: `users.password.reset`. Generates a cryptographically secure temporary password; never accepts one from the URL or logs it.

```json
{ "expiresInHours": 24, "forceChangeOnLogin": true }
```

The plaintext password is returned exactly once:

```json
{
  "data": { "temporaryPassword": "...", "expiresAt": "2026-06-23T09:00:00Z" },
  "meta": { "requestId": "req_..." },
  "error": null
}
```

### `GET /client-config`

Unauthenticated, non-sensitive server metadata used by the server-address configuration screen: organization branding, API version, auth providers, and health status. A mobile client must enforce HTTPS and an optional deployment allowlist before persisting a custom server.

## AI Auto Roster

Permissions: `roster.read` for reads and `roster.generate` / `roster.publish` for mutations.

### `POST /rosters/generate`

Starts an asynchronous generation job. An idempotency key is required via `Idempotency-Key` header.

```json
{
  "periodStart": "2026-06-29",
  "periodEnd": "2026-07-05",
  "employeeIds": ["b9dd36b8-..."],
  "shiftTypeIds": ["779bb4c7-...", "1839ad4d-..."],
  "workLocationId": "1190a21f-...",
  "constraints": {
    "maxWeeklyMinutes": 2700,
    "minimumRestMinutes": 660,
    "maxConsecutiveDays": 6,
    "respectAvailability": true,
    "balanceWeekendShifts": true,
    "allowOvertime": false
  }
}
```

`202 Accepted`:

```json
{
  "data": { "rosterRunId": "809...", "status": "queued", "statusUrl": "/api/v1/rosters/runs/809..." },
  "meta": { "requestId": "req_..." },
  "error": null
}
```

Validation rejects a period over 31 days, inactive employees/shifts, or cross-organization identifiers. Hard constraints must never be relaxed silently.

### `GET /rosters/runs/:runId`

Returns job status: `queued`, `running`, `review`, `published`, or `failed`; progress percent; optimization score; warnings; and a summary. Polling interval should be at least 2 seconds. The service may additionally emit `roster.run.updated` over SSE/WebSocket.

### `GET /rosters/runs/:runId/assignments`

Paginated generated assignments. Query: `cursor`, `limit` (max 200), `employeeId`, `date`.

```json
{
  "data": {
    "items": [{
      "id": "...",
      "employee": { "id": "...", "name": "Budi Santoso" },
      "shift": { "id": "...", "name": "Pagi", "startsAt": "2026-06-29T07:00:00+07:00", "endsAt": "2026-06-29T17:00:00+07:00" },
      "source": "ai",
      "constraintNotes": []
    }]
  },
  "meta": { "nextCursor": null, "requestId": "req_..." },
  "error": null
}
```

### `PATCH /rosters/runs/:runId/assignments/:assignmentId`

Allows a reviewer to adjust a draft assignment. Requires `If-Match` with the roster version to prevent lost updates.

```json
{ "employeeId": "...", "shiftTypeId": "...", "shiftDate": "2026-06-30" }
```

Returns `409 ROSTER_CONFLICT` if it overlaps another shift or violates a hard constraint.

### `POST /rosters/runs/:runId/recalculate`

Re-optimizes only unresolved or manually selected assignments while locking reviewer-approved rows.

```json
{ "lockedAssignmentIds": ["..."], "reason": "Coverage pagi kurang" }
```

### `POST /rosters/runs/:runId/publish`

Atomically marks the run published, activates its assignments, and queues employee notifications. Requires `Idempotency-Key` and the current `version`.

```json
{ "version": 4, "notifyEmployees": true }
```

### `DELETE /rosters/runs/:runId`

Cancels/deletes a draft run. Published runs cannot be deleted; they require an audited amendment.

### Supporting endpoints

- `GET /shift-types` — active shift types and grace periods.
- `GET /employees/availability?from=&to=&departmentId=` — availability input.
- `GET /rosters?from=&to=&employeeId=` — published assignments.
- `POST /shift-swaps` — employee submits a swap request.
- `PATCH /shift-swaps/:id/review` — admin approves/rejects atomically.

## Security and audit requirements

- Tenant scope comes from the authenticated session, never from a trusted request body.
- Passwords use Argon2id; reset and refresh tokens are stored only as hashes.
- Face images and embeddings are encrypted, access-controlled, retention-limited, and processed only after explicit consent.
- Every login, password reset, roster generation/edit/publish, and approval writes an immutable audit log.
- Location history has a defined retention period (minimum product need: 7 days) and must not be collected outside an active work session.

