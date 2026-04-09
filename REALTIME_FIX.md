# Fix: Collector App Changes Not Reflecting in React App

## Problem
Changes made in the collector app (transactions, collections, account balances) are not immediately visible in the React web app.

## Root Causes Identified

1. **Row Level Security (RLS) Blocking Anon Access** ⭐ MOST LIKELY CAUSE
   - The collector app uses the anon key without authentication
   - Current RLS policies only allow authenticated users
   - This blocks the collector app from writing to the database

2. **Realtime Not Enabled**
   - The `enable_realtime.sql` script may not have been executed
   - Tables need replica identity set to FULL for UPDATE events

3. **Supabase Anon Key Format**
   - The anon key `sb_publishable_p5e3RAcom9Kt0MS6rKkXyg_uVyjh60u` appears to be a custom format
   - Standard Supabase anon keys are longer JWT tokens

## Quick Test: Add Diagnostic Component

I've created a diagnostic component to help you see if realtime is working:

1. Open `src/pages/dashboard/Dashboard.jsx`
2. Add this import at the top:
   ```javascript
   import RealtimeDiagnostic from '../../components/RealtimeDiagnostic';
   ```
3. Add `<RealtimeDiagnostic />` anywhere in the return statement (e.g., right after the opening `<div className="fade-in">`)
4. Refresh your React app
5. You'll see a status card showing if realtime is connected
6. Make a transaction in the collector app and watch for events

## Solutions (Apply in Order)

### ⭐ Solution 1: Fix Row Level Security (RLS) Policies - START HERE

The collector app uses the anon key without authentication, but your RLS policies only allow authenticated users. This is blocking the collector app from writing to the database.

**Steps:**
1. Go to your Supabase Dashboard: https://gwuhyjfqpdyyptlldtnb.supabase.co
2. Navigate to SQL Editor
3. Copy and run the script from `supabase/fix_rls_for_anon.sql`
4. Verify it completes without errors

**What this does:**
- Allows anon key to read: customers, accounts, loans, HP agreements, collectors, collections
- Allows anon key to insert: transactions, collections, HP payments, notifications
- Allows anon key to update: accounts, loans, HP agreements, collectors

### Solution 2: Enable Realtime on All Tables

**Steps:**
1. Go to your Supabase Dashboard: https://gwuhyjfqpdyyptlldtnb.supabase.co
2. Navigate to SQL Editor
3. Copy and run the updated script from `supabase/enable_realtime.sql`
4. Verify it completes without errors

**What this does:**
- Adds all tables to the realtime publication
- Sets replica identity to FULL (required for UPDATE events)
- Allows anon key to insert notifications

### Solution 3: Verify Supabase Anon Key (Optional)

The anon key format looks unusual. Standard Supabase anon keys are much longer JWT tokens (eyJ...).

**Steps:**
1. Go to Supabase Dashboard → Settings → API
2. Check if your `anon` / `public` key matches what's in your code
3. If different, update both:
   - `.env` file: `REACT_APP_SUPABASE_ANON_KEY`
   - `collector-app/src/supabase.js`: `SUPABASE_ANON_KEY`

### Solution 4: Test the Fix

After applying Solution 1 and 2:

1. Open the collector app
2. Record a test transaction
3. Check the React app - changes should appear within 1-2 seconds
4. If you added the diagnostic component, watch for realtime events

### Solution 5: Verify Network Connectivity (If Still Not Working)

**Steps:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by "WS" (WebSocket)
4. Look for a connection to `wss://gwuhyjfqpdyyptlldtnb.supabase.co/realtime/v1/websocket`
5. If it's not there or shows errors, check browser console for error messages

## Expected Behavior After Fix

✅ Changes in collector app appear in React app within 1-2 seconds (realtime)  
✅ If realtime fails, changes appear within 5 seconds (polling fallback)  
✅ Account balances, transactions, collections, and loans all update automatically  
✅ No need to refresh the page manually

## Fallback: Manual Refresh

The React app has a 5-second polling fallback, so changes should appear within 5 seconds even if realtime fails. If they don't:

1. Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Check browser console for errors (F12 → Console tab)

## Files Created/Updated

- ✅ `supabase/fix_rls_for_anon.sql` - NEW: Fixes RLS policies for anon access
- ✅ `supabase/enable_realtime.sql` - UPDATED: Added missing tables to replica identity
- ✅ `src/components/RealtimeDiagnostic.jsx` - NEW: Diagnostic component to test realtime
- ✅ `src/context/AppContext.jsx` - Already has realtime subscriptions (no changes needed)

## Troubleshooting

### Collector app shows "Failed to record collection"
- Run `supabase/fix_rls_for_anon.sql` - RLS is blocking writes

### Changes appear after 5 seconds but not instantly
- Run `supabase/enable_realtime.sql` - Realtime not enabled
- Check diagnostic component for connection status

### Diagnostic shows "CHANNEL_ERROR" or "TIMED_OUT"
- Verify anon key is correct
- Check browser console for WebSocket errors
- Ensure Supabase project is not paused

### Changes never appear, even after 5+ seconds
- Check if collector app is actually saving (look for success message)
- Verify both apps are using the same Supabase URL
- Check Supabase Dashboard → Table Editor to see if data is being written
