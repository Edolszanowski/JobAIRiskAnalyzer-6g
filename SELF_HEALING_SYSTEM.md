# Self-Healing Database & Data-Sync System

## 1. Overview
The new self-healing layer makes the Job AI Risk Analyzer resilient to:
* **Database outages & slowdowns** – automatic retries, circuit-breaker and health checks.
* **BLS API rate-limits & failures** – key rotation, exponential back-off and automatic pause / resume.
* **Partial sync failures** – progress checkpoints and resumable sync.
* **Operational insight** – real-time health metrics and alerting endpoints.

Outcome: higher uptime, safer deployments, fewer manual restarts and simple observability.

---

## 2. Architecture

```
Client (Admin UI / Cron) ──► API Routes
                                   │
                                   ▼
                        +─────────────────────+
                        │  Self-Healing Layer │
                        │  (lib/*-enhanced)   │
                        +─────────────────────+
                          │     │        │
                          │     │        └─► Health Monitor
                          │     │
                          │     └─► BLSSyncService (async workers)
                          │
                          └─► Neon DB  ◄── Circuit Breaker
```

Component roles:

| Component | Purpose |
|-----------|---------|
| **database-enhanced.ts** | Wraps Neon client with retry, circuit-breaker, validation, batch operations & periodic health check. |
| **bls-sync-enhanced.ts** | Concurrent, resumable job-sync engine with automatic key rotation, progress events & error recovery. |
| **health-monitor.ts** | Consolidates metrics from DB, API keys, BLS API and Sync → computes overall health + alerts + auto-recovery. |
| **API routes** | `/api/database-status`, `/api/admin/enhanced-sync`, `/api/admin/system-health` expose status & control. |

---

## 3. Features

### Database Self-Healing
* Connection retry with exponential back-off (configurable attempts/delay).
* Circuit-breaker opens after _n_ consecutive failures; auto-resets after cool-down.
* Transaction wrapper with automatic rollback.
* Batch insert helper with validation and conflict-update logic.
* Periodic health-check pings to keep pool warm and measure latency.

### Sync Self-Healing
* Key rotation across unlimited BLS API keys (500 req/day limit each).
* Intelligent fallback when all keys blocked (waits until reset, or manual restart).
* Concurrent workers (configurable) with per-job retry & back-off.
* Checkpoints every batch → resume exactly where it left off.
* Skips already-analysed jobs to save quota.
* Emits events: `progress`, `jobProcessed`, `jobError`, `checkpoint`, `healthCheck`.

### Health Monitoring
* Aggregated scores per component: database, apiKeys, blsApi, dataSync.
* Alert levels: _info, warning, error, critical_.
* Auto-recovery actions (DB reconnect, API key rotation, sync restart).
* History & metrics retained in-memory (persist externally if desired).

---

## 4. Usage

### Endpoints

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `GET` | `/api/database-status` | Current DB health (adds `circuitBreakerOpen`, `consecutiveFailures`). |
| `POST` | `/api/admin/enhanced-sync` | Start the new sync. Body options: `maxConcurrent`, `batchSize`, `retryAttempts`, `validateData` (bool), `forceRestart` (bool). |
| `DELETE` | `/api/admin/enhanced-sync` | Stop a running enhanced sync. |
| `GET` | `/api/admin/enhanced-sync` | Current enhanced-sync progress (`?detailed=true` for full object). |
| `GET` | `/api/admin/system-health` | System health summary (`?detailed=true&history=true&limit=20`). |
| `POST` | `/api/admin/system-health` | Trigger manual health check. Body: `{ forceRestart: true }` to restart monitor. |

Legacy endpoints still work; add `?enhanced=true` to `/api/admin/start-sync` or `/api/admin/start-sync?enhanced=true` to delegate to new engine.

### Quick start (curl)
```bash
# Start sync with defaults
curl -X POST /api/admin/enhanced-sync

# Start with 10 workers & restart
curl -X POST /api/admin/enhanced-sync -d '{"maxConcurrent":10,"forceRestart":true}'

# Watch progress
watch -n5 'curl /api/admin/enhanced-sync?detailed=true | jq .'

# Get health summary
curl /api/admin/system-health
```

---

## 5. Configuration

Environment variables (add to `.env.local`):

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` / `NEON_DATABASE_URL` | Neon Postgres connection string | `postgres://user:pass@aws.neon.tech/db` |
| `BLS_API_KEY` | Primary BLS API key | `ABCD1234...` |
| `BLS_API_KEY_2..N` | Additional keys for rotation | `EFGH5678...` |
| `DB_RETRY_ATTEMPTS` | Override default (5) | `3` |
| `DB_BASE_RETRY_DELAY` | ms initial delay | `100` |
| `DB_CIRCUIT_BREAKER_THRESHOLD` | failures before open (5) | `10` |
| `SYNC_MAX_CONCURRENT` | default workers | `5` |
| `SYNC_BATCH_SIZE` | default batch size | `50` |
| `HEALTH_CHECK_INTERVAL` | ms between checks | `60000` |

*(all have sane defaults; override only as needed).*

---

## 6. Monitoring

1. **Dashboard Widgets**  
   Point the admin dashboard cards to:
   * `/api/database-status`
   * `/api/admin/enhanced-sync`
   * `/api/admin/system-health`

2. **Metrics & Alerts**  
   Subscribe to server-side events on the `HealthMonitor` instance or poll `/system-health?detailed=true`.

3. **Logs**  
   All components log with emoji prefixes:  
   * `🔌` circuit events  
   * `🔄` sync activity  
   * `🚨` alerts  
   Tail logs in your hosting platform or Streamlit server console.

---

## 7. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `circuitBreakerOpen: true` in `/database-status` | DB unreachable / repeated failures | Verify `DATABASE_URL`, check Neon status, wait for reset or restart service. |
| Sync stuck at 0% and `/enhanced-sync` shows `Low API requests remaining` | All BLS keys hit daily limit | Add more keys or wait until next UTC day. |
| High `errorRate` in `dataSync` component | Occupation code causing repeated API failure | Inspect `jobError` events, blacklist problematic code, re-run with `forceRestart`. |
| `All API keys are blocked` alert | Keys temporarily blocked due to 429/403 | Reset keys, ensure rotation, adjust `maxConcurrent` to lower request rate. |
| Memory usage climbs steadily | Health history too big | Lower `historySize` in monitor or persist to external store and reset monitor. |

---

## 8. Migration Guide

1. **Keep existing UI** – no changes needed; old endpoints still function.
2. **Switch admin calls**  
   Replace:
   ```
   POST /api/admin/start-sync
   GET  /api/admin/sync-status
   ```
   with:
   ```
   POST /api/admin/enhanced-sync
   GET  /api/admin/enhanced-sync
   ```
3. **Enable health monitor** – ensure at least one BLS key env var is set; the first `/system-health` call auto-starts monitoring.
4. **Remove deprecated code (optional)** – legacy sync logic in `start-sync` can be deleted once confident.
5. **Deploy to Streamlit** – Streamlit just calls the same endpoints; no additional work.
6. **Observe** – verify `/system-health` returns `healthy` and sync completes without errors.

---

Happy coding! The system will now take care of itself – and let you know whenever it needs a hand. 🚀
