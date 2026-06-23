# Improvement Plan – Hadirin AI attendance app

## 1. UI/UX (quick win)
- Refactor `src/styles.css` – unify color variables, add CSS custom properties for primary/secondary colors.
- Add responsive breakpoints for mobile nav (already present, tighten). 
- Ensure all interactive elements have accessible focus states (outline).
- Replace hard‑coded text in `LiveApp.tsx` with i18n placeholder strings (future‑proof). 
- **ponytail:** after UI, run Lighthouse CI (target >90). 

## 2. Build & Performance
- Enable Vite's `build.rollupOptions.output.manualChunks` to split vendor libs (`react`, `lucide-react`).
- Add lazy‑load for heavy pages (`RosterPage`, `PayrollPage`) via `React.lazy` + `Suspense`.
- Set `esbuild` minify and `target: 'es2022'`.
- **ponytail:** benchmark bundle size (<1.2 MB gzipped). 

## 3. New Feature – Google OAuth login
- Add `@capacitor/google-auth` (or web fallback) wrapper in `src/api.ts`.
- Create `src/components/GoogleLoginButton.tsx`.
- Update `AuthScreen` to show OAuth buttons when `CONFIG.enableOAuth` flag is true.
- Backend endpoint `/auth/google` to verify ID token (placeholder – returns JWT). 
- **ponytail:** write e2e test for login flow. 

## 4. Project Structure
- Move UI components to `src/components/` (e.g., `MetricCard`, `Avatar`).
- Create `src/pages/` folder for page components (`Dashboard`, `EmployeesPage`, …).
- Extract API helpers to `src/services/api.ts`.
- Introduce path alias `@/` in `tsconfig.json` (`"paths": { "@/*": ["src/*"] }`).
- **ponytail:** update imports accordingly. 

## 5. Code Quality & Tests
- Add `eslint` + `prettier` config, enforce `eslint --fix` on commit.
- Add unit tests for `api.ts` (mock fetch) and a snapshot test for `Dashboard`.
- Aim for ≥80 % coverage.
- **ponytail:** CI step runs `npm test && npm run lint`.
