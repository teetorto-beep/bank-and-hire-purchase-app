# Quick Fix: Collector App → React App Sync Issue

## The Problem
Changes made in the collector app don't show up in the React web app.

## The Root Cause
Your Supabase Row Level Security (RLS) policies only allow **authenticated users**, but the collector app uses the **anon key without authentication**. This blocks all writes from the collector app.

## The Fix (2 Steps)

### Step 1: Fix RLS Policies (REQUIRED)
1. Open Supabase Dashboard: https://gwuhyjfqpdyyptlldtnb.supabase.co
2. Go to SQL Editor
3. Run this script: `supabase/fix_rls_for_anon.sql`

### Step 2: Enable Realtime (REQUIRED)
1. In the same SQL Editor
2. Run this script: `supabase/enable_realtime.sql`

### Step 3: Verify Setup (OPTIONAL)
1. In the same SQL Editor
2. Run this script: `supabase/verify_setup.sql`
3. Check the output - it will tell you if everything is configured correctly

## Test It
1. Open collector app
2. Record a transaction
3. Check React app - should update within 1-2 seconds

## Optional: Add Diagnostic Tool
To see realtime status in your React app:

1. Edit `src/pages/dashboard/Dashboard.jsx`
2. Add at top:
   ```javascript
   import RealtimeDiagnostic from '../../components/RealtimeDiagnostic';
   ```
3. Add in the component:
   ```javascript
   <RealtimeDiagnostic />
   ```

This shows you if realtime is connected and logs all database events.

## What If It Still Doesn't Work?

The React app has a 5-second polling fallback. If changes don't appear within 5 seconds:
- Check browser console (F12) for errors
- Verify both apps use the same Supabase URL
- Check Supabase Table Editor to see if data is actually being written

## Files I Created
- `supabase/fix_rls_for_anon.sql` - Fixes the RLS blocking issue
- `supabase/enable_realtime.sql` - Updated to enable realtime properly
- `src/components/RealtimeDiagnostic.jsx` - Diagnostic tool
- `REALTIME_FIX.md` - Detailed troubleshooting guide
