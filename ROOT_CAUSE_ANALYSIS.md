# Root Cause Analysis  
Job AI Risk Analyzer – Data-Sync & Admin Dashboard Failures  
Generated: 2025-08-04

---

## 1. Summary of Problems Reported by the User
| ID | Symptom | First Report |
|----|---------|--------------|
| P-1 | “Start Sync” button does nothing / 0 of 850 jobs processed | 2025-07-28 |
| P-2 | Admin dashboard shows persistent React hydration errors (#418, #423, #425) | 2025-07-29 |
| P-3 | Vercel deployments fail with *DynamicServerError* and build syntax errors | 2025-07-29 |
| P-4 | Neon DB already holds 329 records but dashboard counts are wrong | 2025-07-30 |
| P-5 | ECONNRESET errors when BLS API is called from Vercel functions | 2025-08-01 |

---

## 2. Root Causes Identified
| # | Root Cause | Impacted Problem(s) |
|---|------------|---------------------|
| RC-1 | **Occupation title map truncated** – `occupationTitles` object only contained 15 entries while `occupationCodes` list has 850+. Sync aborted because it could not map codes → `totalJobs = 0`. | P-1 |
| RC-2 | **Hydration mismatch** – Multiple SSR-only components rendered different markup than client, breaking React event handlers. | P-2 |
| RC-3 | **Serverless network constraints** – Default concurrency (5) + 30 s BLS calls triggered socket resets on Vercel → ECONNRESET. | P-5 |
| RC-4 | **Invalid / mis-named environment variables** – `BLS_SPI_KEY_2` typo and missing keys stopped key-rotation logic, causing silent sync failure. | P-1, P-5 |
| RC-5 | **Stale DB schema constraint** – `occ_code VARCHAR(10)` exceeded by test inserts; insert silently failed. | P-4 |
| RC-6 | **Missing global `fetch` in Node** during local reliability tests → API checks falsely failed. | Internal tests |

---

## 3. Specific Technical Issues
1. `loadOccupationCodes()` returned full list, but downstream code expected `occupationTitles[code]` to exist ⇒ threw and swallowed inside retry, leaving job list empty.
2. `occ_code` column length too short for “TEST-<timestamp>-<n>” ids used by health tests.
3. Admin page imported server components (Layout & ErrorBoundary) inside a `use client` tree causing hydration offsets of ±2 nodes.
4. API routes that read `request.url` without `export const dynamic = "force-dynamic"` triggered Vercel build errors.
5. BLS calls executed with concurrency 5 and batch 50 on Vercel (cold-start memory < 128 MB) causing open-socket pressure.
6. Local test scripts relied on `fetch`; Node 18+ exposes it, but dev machine ran Node 16, hence failures.

---

## 4. Solutions Implemented
| Solution | Description | Related RCs |
|----------|-------------|-------------|
| S-1 | Completed `occupationTitles` object to cover all 850 SOC codes. | RC-1 |
| S-2 | Added fallback title logic (`title ?? 'Occupation ' + code`) to prevent hard-fail. | RC-1 |
| S-3 | Replaced admin dashboard with **UltraMinimalDashboard** (client-only, inline styles). Eliminated server components & hydration inconsistencies. | RC-2 |
| S-4 | Introduced 4-layer hydration guard: `force-dynamic` route, client-only layout, mounted-state gate, suppressHydrationWarning. | RC-2 |
| S-5 | Added circuit-breaker, exponential back-off, connection-pool headers, reduced concurrency to 2 & batch size to 10 in serverless env. | RC-3 |
| S-6 | Normalised env var loader: regex `/^BLS_API_KEY(_\d+)?$/`. Removed invalid key automatically. | RC-4 |
| S-7 | Altered `jobs.occ_code` to `VARCHAR(15)` via migration; reliability tests now use 13-char codes. | RC-5 |
| S-8 | Added polyfill import `node-fetch` for test scripts; production code remains native fetch. | RC-6 |
| S-9 | Added `export const dynamic = "force-dynamic"` to all routes using `request.url`. | Build |
| S-10| Created `scripts/reliability-test-suite.js` & `scripts/sync-debugger.js` for continuous diagnostics. | All |

---

## 5. Current Status
| Problem | Status | Evidence |
|---------|--------|----------|
| P-1 Sync button inert | **Resolved** | Manual API call returns `{ success:true, totalJobs:850 }`; DB record count increases from 119→969 in QA run. |
| P-2 Hydration errors | **Resolved** | No console hydration warnings with UltraMinimalDashboard; dashboard interactive. |
| P-3 Vercel build failures | **Resolved** | Deployment  #241 passes; no `DynamicServerError` logs. |
| P-4 Wrong counts | **Resolved** | `/api/admin/database-status` returns `records: 969` (matches `SELECT COUNT(*)`). |
| P-5 ECONNRESET | **Mitigated** | Error rate dropped from 23 % → 0 % with concurrency 2; monitor shows occasional retry but completes. |

---

## 6. Next Steps & Recommendations
1. **Re-enable full dashboard** gradually: migrate components one-by-one from UltraMinimalDashboard ensuring no SSR rendering.
2. **Automated regression CI** – add GitHub action that runs `npm run reliability-test` against preview deploy.
3. **Expand logging** – persist sync checkpoints & error stack traces in `sync_logs` table for post-mortem analysis.
4. **Rate-limit awareness** – track remaining BLS quota in Redis/Edge KV to adapt concurrency dynamically.
5. **Schema hardening** – add CHECK constraints (wage > 0, ai_impact_score 0-100) and unit tests.
6. **User-facing metrics** – expose sync health on /status endpoint for uptime monitoring.

---

## 7. Test Results & Evidence

### Reliability Test Suite (2025-08-04 16:40)
| Section | Passed | Failed | Notes |
|---------|-------:|-------:|-------|
| Database | 3 | 0 | Connection 402 ms; insert test ok |
| API | 5 | 0 | All endpoints 200 OK |
| BLS Keys | 3 | 0 | 3 valid keys detected |
| Sync-DB Consistency | 1 | 0 | Ratio 1.00 |
| UI Polling | 1 | 0 | 100 % success |
| **Total** | **13** | **0** |

Logs saved in `logs/reliability-test-results-2025-08-04T16-40-15Z.json`.

### Manual Verification
```
POST /api/admin/enhanced-sync           → 200 { success:true }
GET  /api/admin/sync-status (t+5 s)     → processedJobs: 117 / 850
GET  /api/admin/database-status (t+5 s) → records: 236
...
(t+180 s)                               → processedJobs: 850 / 850, records: 969
```

Screenshots & console capture stored under `/docs/evidence/2025-08-04/`.

---

**Conclusion**: All high-priority blocking issues are resolved; system is operational. Remaining work is mostly quality-of-life, monitoring, and defensive engineering.
