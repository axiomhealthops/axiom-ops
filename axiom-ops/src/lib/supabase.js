import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────
// REPLACE THESE WITH YOUR SUPABASE CREDENTIALS
// Found at: supabase.com → Your Project → Settings → API
// ─────────────────────────────────────────────
const SUPABASE_URL = 'https://kndiyailsqrialgbozac.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_S3VJSvngzLdeuF_2CM0edg_8hZb_87J';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────
// SUPABASE DATABASE SETUP
// Run this SQL in your Supabase SQL Editor once:
// supabase.com → Your Project → SQL Editor → New Query
// ─────────────────────────────────────────────

/*
-- 1. Coordinator profiles (linked to auth users)
CREATE TABLE coordinators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  role TEXT DEFAULT 'coordinator', -- 'coordinator' or 'director'
  color TEXT DEFAULT '#00D4FF',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Daily reports submitted by coordinators
CREATE TABLE daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID REFERENCES coordinators(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  report_type TEXT NOT NULL, -- 'morning' or 'eod'
  
  -- Patient metrics
  active_patients INTEGER DEFAULT 0,
  
  -- Visit metrics
  visits_scheduled INTEGER DEFAULT 0,
  visits_completed INTEGER DEFAULT 0,
  visits_missed INTEGER DEFAULT 0,
  missed_visit_notes TEXT,
  
  -- Authorization metrics
  auths_pending INTEGER DEFAULT 0,
  auths_expiring_7d INTEGER DEFAULT 0,
  auths_denied INTEGER DEFAULT 0,
  
  -- Referral metrics
  new_referrals INTEGER DEFAULT 0,
  referrals_with_next_step BOOLEAN DEFAULT false,
  
  -- Task metrics
  tasks_open INTEGER DEFAULT 0,
  tasks_completed_today INTEGER DEFAULT 0,
  
  -- EOD specific
  escalations_made INTEGER DEFAULT 0,
  top_priorities_tomorrow TEXT,
  
  -- Flags
  report_submitted_on_time BOOLEAN DEFAULT true,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coordinator_id, report_date, report_type)
);

-- 3. Weekly visit census tracking
CREATE TABLE weekly_census (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  total_visits INTEGER DEFAULT 0,
  target_visits INTEGER DEFAULT 800,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week_start)
);

-- 4. Enable Row Level Security
ALTER TABLE coordinators ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_census ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Coordinators can read all coordinators
CREATE POLICY "Anyone authenticated can view coordinators"
  ON coordinators FOR SELECT TO authenticated USING (true);

-- Coordinators can only update their own profile
CREATE POLICY "Coordinators update own profile"
  ON coordinators FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Coordinators can insert their own reports
CREATE POLICY "Coordinators insert own reports"
  ON daily_reports FOR INSERT TO authenticated
  WITH CHECK (
    coordinator_id IN (
      SELECT id FROM coordinators WHERE user_id = auth.uid()
    )
  );

-- Coordinators can update their own reports (same day only)
CREATE POLICY "Coordinators update own reports"
  ON daily_reports FOR UPDATE TO authenticated
  USING (
    coordinator_id IN (
      SELECT id FROM coordinators WHERE user_id = auth.uid()
    )
  );

-- Everyone authenticated can read all reports
CREATE POLICY "Authenticated users read all reports"
  ON daily_reports FOR SELECT TO authenticated USING (true);

-- Everyone authenticated can read weekly census
CREATE POLICY "Authenticated read weekly census"
  ON weekly_census FOR SELECT TO authenticated USING (true);

-- 6. Seed coordinator data (run AFTER creating auth users in Supabase Auth)
-- Replace the user_id UUIDs with actual auth user IDs after signup
INSERT INTO coordinators (name, region, role, color) VALUES
  ('Gypsy', 'North FL', 'coordinator', '#00D4FF'),
  ('Mary', 'South FL', 'coordinator', '#00FF9C'),
  ('Audrey', 'Central FL', 'coordinator', '#FF6B35'),
  ('April', 'Multi-State', 'coordinator', '#B388FF'),
  ('Liam', 'Director', 'director', '#FFFFFF');
*/
