# AxiomHealth Care Coordination Command Center

A full-stack operational dashboard for AxiomHealth's care coordination team.
Built with React + Supabase. Costs $0/month to run.

---

## STACK
- **Frontend:** React (free on Vercel)
- **Database + Auth:** Supabase (free tier — 500MB, unlimited users)
- **Hosting:** Vercel (free tier — unlimited deployments)

---

## DEPLOYMENT GUIDE (30 minutes total)

### STEP 1 — Supabase Setup (10 min)

1. Go to https://supabase.com → Sign up free
2. Click "New Project" → name it "axiom-ops" → set a database password → Create
3. Wait ~2 minutes for setup
4. Go to **Settings → API**
5. Copy:
   - **Project URL** (looks like `https://abcdef.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)
6. Open `src/lib/supabase.js` and replace:
   ```
   const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
   ```
7. Go to **SQL Editor → New Query** in Supabase
8. Paste ALL the SQL from the comment block in `src/lib/supabase.js`
9. Click **Run**

### STEP 2 — Create Staff Accounts (5 min)

1. In Supabase → Go to **Authentication → Users → Add User**
2. Create one account per person:
   - liam@axiomhealthmanagement.com (director)
   - gypsy@axiomhealthmanagement.com
   - mary@axiomhealthmanagement.com
   - audrey@axiomhealthmanagement.com
   - april@axiomhealthmanagement.com
3. Go to **SQL Editor** and link each user to their coordinator profile:
   ```sql
   UPDATE coordinators
   SET user_id = 'PASTE-AUTH-USER-UUID-HERE'
   WHERE name = 'Gypsy';
   -- Repeat for each coordinator
   -- For Liam:
   INSERT INTO coordinators (user_id, name, region, role, color)
   VALUES ('LIAMS-AUTH-UUID', 'Liam', 'Director', 'director', '#FFFFFF');
   ```
   (Find each UUID in Authentication → Users → click user → copy ID)

### STEP 3 — Deploy to Vercel (5 min)

1. Push this folder to a GitHub repo (github.com → New repo → upload files)
2. Go to https://vercel.com → Sign up free with GitHub
3. Click "New Project" → Import your GitHub repo
4. Click **Deploy** — Vercel auto-detects React
5. Done. You'll get a URL like `axiom-ops.vercel.app`

### STEP 4 — Custom Domain (Optional, free)

In Vercel → Project → Settings → Domains → Add `ops.axiomhealthmanagement.com`
(Requires adding a DNS record in your domain registrar — Vercel guides you through it)

---

## HOW IT WORKS

### Director View (Liam)
- Sees full command center dashboard
- Real-time updates as coordinators submit reports
- 4 tabs: Overview, Team, Trends, Reports
- Weekly visit target tracker (manually updateable)
- Automatic alerts for missing reports, high caseloads, expiring auths

### Coordinator View (Gypsy, Mary, Audrey, April)
- Sees only their own report submission form
- Morning report (due 9 AM): patients, visits, auths, referrals, tasks
- EOD report (due 4:30 PM): completions, missed visits, escalations, tomorrow's priorities
- Can update/resubmit same-day if numbers change
- Mobile-friendly — works on phone

---

## MONTHLY COST BREAKDOWN

| Service | Free Tier Limit | Your Usage | Cost |
|---------|----------------|------------|------|
| Supabase | 500MB DB, 50k MAU | ~5 users, <10MB | $0 |
| Vercel | Unlimited deploys, 100GB bandwidth | Minimal | $0 |
| **Total** | | | **$0/month** |

You won't hit these limits with a 5-person team for years.

---

## ADDING NEW COORDINATORS

1. Create auth user in Supabase → Authentication → Users
2. Run SQL: `INSERT INTO coordinators (user_id, name, region, role, color) VALUES (...)`
3. They can log in immediately

---

## SUPPORT
Built for AxiomHealth by Claude (Anthropic)
For changes or new features, bring this codebase back to Claude.ai
