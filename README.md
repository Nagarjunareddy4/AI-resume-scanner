
# ResuScan AI - Professional Documentation

## 1. AI Provider
ResuScan AI utilizes the **OpenAI ChatGPT API (specifically `gpt-4o-mini`)** for all resume analysis, skill extraction, and scoring. The processing is optimized for high-performance semantic matching.

## 2. Pricing & Access Model
### Free Tier (Guest / Trial)
- **Scans**: Exactly 2 free scans per account/session.
- **Features**: Basic analysis in Candidate and Recruiter modes.
- **Restrictions**: No bulk upload, no result exports, no long-term history for guests.

### Pro Tier (Paid Upgrade)
- **Unlimited Scans**: Analyze as many resumes as needed.
- **Full AI Insights**: Advanced keyword detection and deep experience analysis.
- **Priority Features**: Bulk resume comparison (Recruiter mode) and one-click CSV exports.
- **Permanent History**: Secure, private storage of all previous scan data.

## 3. Core Features
### Candidate Mode
- **Fit Analysis**: Comprehensive comparison between 1 JD and 1 Resume.
- **Actionable Insights**: Match score, missing industry keywords, and constructive resume improvement tips.
- **Validation**: Ensures the candidate name matches the uploaded document.

### Recruiter Mode
- **Bulk Screening**: Process multiple resumes simultaneously against a single JD (Pro).
- **Match Progress**: Visual representation of candidate alignment for fast decision-making.
- **Exporting**: Seamless export of analysis tables to CSV for HR systems (Pro).

## 4. Privacy & Transparency
- **Privacy-First**: Your data is **NOT** used to train AI models and is **NOT** shared with third parties.
- **Explicit Consent**: AI analysis only begins after you agree to our privacy disclaimer.
- **Security**: Data is saved to your account history only to provide continuity and insights.

## 5. Setup Requirements
The application requires the following environment variable:
- `OPENAI_API_KEY`: Required for processing resume data through GPT-4o-mini.

## Supabase – Read Validation (Dev Only)

This project includes a backend-only dev script to safely validate
Supabase READ connectivity without affecting UI or application logic.

### What it does
- Calls Supabase read helpers:
  - `fetchJobDescriptionsByUser('guest')`
  - `fetchScansByUser('guest')`
- Logs:
  - total record count
  - first record only (if present)
- Does NOT insert, update, or delete any data
- Logs errors via `console.error` only
- Exits cleanly

### How to run
Ensure Supabase environment variables are set:

```bash
export VITE_SUPABASE_URL=your_supabase_url
export VITE_SUPABASE_ANON_KEY=your_anon_key

---

## Supabase – Read Test (Dev Only)

A backend-only dev script is included to validate Supabase READ operations
without affecting UI, animations, or production behavior.

### How it works
- The script reads data using an identifier:
  - Uses `TEST_USER_EMAIL` if provided
  - Falls back to `"guest"` otherwise
- This matches how data is written during scans:
  - Logged-in users → `user_email = actual email`
  - Guest users → `user_email = "guest"`

### Run for a logged-in user
```bash
TEST_USER_EMAIL=alice@example.com npm run supabase:read-test


*ResuScan AI is built to provide enterprise-grade screening accuracy with a focus on candidate privacy and recruiter efficiency. © 2024 Nagarjuna Reddy. All rights reserved.*

---

## Enabling Supabase persistence (optional, developer)

To enable Supabase-backed persistence for users, auth logs, and app errors, set these environment variables locally or in your CI environment:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (required at runtime)
- `SUPABASE_DB_URL` or `DATABASE_URL` (required to run the DB setup script that creates the tables)

A helper script is provided to create the required tables if they do not already exist. Run it like:

```bash
SUPABASE_DB_URL=postgres://user:pass@host:port/dbname npm run db:setup
```

This will create tables: `users`, `auth_logs`, and `app_errors` when they are missing.
