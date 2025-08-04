# Fixing BLS API Keys in Vercel  
*(JobAIRiskAnalyzer-6g – Environment Guide)*  

---

## Why This Matters
Two of your three BLS API keys (`BLS_API_KEY_2` and `BLS_API_KEY_3`) are **invalid**. Because the sync service rotates keys, any bad key causes extra retries and can pause the job import. Removing or replacing the bad keys restores full throughput (1 key = 500 requests/day).

---

## 1. Get Your Valid BLS Keys

1. Visit <https://data.bls.gov/registrationEngine/> and register (or sign in).  
2. Copy the **32-character alphanumeric key** you receive by email or from your account page.  
   • Example pattern: `60239f8eca874ce8be93238a358c4c09`  
3. (Optional) Request additional keys with a different email address if you need more than 500 requests/day.  

*Tip – Keys that are **64 characters** long or contain `-` / `_` are not BLS keys.*

---

## 2. Open Your Vercel Environment Variables

1. Log in to <https://vercel.com>.  
2. In the left sidebar, click **Dashboard** → choose the **JobAIRiskAnalyzer-6g** project.  
3. Navigate: **Settings** ➜ **Environment Variables**.

---

## 3. Identify Problem Keys

Look for variables named exactly:

| Variable | Status you saw | Action |
| -------- | -------------- | ------ |
| `BLS_API_KEY` | ✅ Valid (keep) | Leave as is |
| `BLS_API_KEY_2` | ❌ Invalid (blocked) | Delete or replace |
| `BLS_API_KEY_3` | ❌ Invalid (blocked) | Delete or replace |

Invalid keys are usually 64-character strings or marked “blocked” in the `/api/admin/test-api-keys` endpoint.

---

## 4. Remove / Replace Keys

### A. Remove  
1. Click the trash-can icon beside `BLS_API_KEY_2` and `BLS_API_KEY_3`.  
2. Confirm deletion.

### B. Replace  
1. Click the pencil icon.  
2. Paste your new **32-char** key.  
3. Save.

*(You may either remove or replace — doing both replacements is ideal so you regain 1 500 × 3 = **1500** daily requests.)*

---

## 5. Redeploy to Apply Changes

1. At the top right of the Vercel project page, press **Deployments**.  
2. Click **Redeploy** (or **Trigger Redeploy**) for the latest commit.  
   • Vercel builds with the updated env vars and redeploys in a few minutes.  

---

## 6. Verify Everything Works

1. After deployment finishes, open:  
   `https://job-ai-risk-analyzer-6g.vercel.app/api/admin/test-api-keys`  
2. Expect output similar to:  

```
"totalKeys": 3,
"workingKeys": 3,
"totalRemainingRequests": 1500
```

3. Start a sync from the Admin dashboard (`Start Sync`) and confirm progress.

---

## 7. Troubleshooting

| Symptom | Likely Cause | Fix |
| ------- | ------------ | --- |
| `/api/admin/test-api-keys` shows 0 keys | Env vars not set in **Production** scope | Re-add in *Production* (not *Preview* or *Development*) |
| Key still “invalid” after replacement | Typo or wrong key format | Re-copy from BLS email; ensure exactly 32 chars |
| Sync pauses with “All API keys limit reached” | Hit daily cap | Add more keys or wait until midnight ET when BLS resets counts |

---

## 8. Security Reminder
Vercel encrypts environment variables, but **never commit keys to Git**. `.env.local` is git-ignored; keep it that way for local testing.

---

### Quick Reference

1. Vercel Dashboard → Project → Settings → Environment Variables  
2. Remove bad `BLS_API_KEY_2`, `BLS_API_KEY_3`  
3. Add new 32-char keys  
4. Redeploy → Verify `/api/admin/test-api-keys`  
5. Enjoy uninterrupted 850+ job sync 🚀
