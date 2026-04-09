# Run These Scripts in Order

Go to your Supabase Dashboard SQL Editor and run these scripts in order.

**IMPORTANT**: Use the "RUN" button (▶), NOT the "Explain" button!

## Step 1: Fix RLS Policies (REQUIRED)
Copy and paste the entire contents of `supabase/fix_rls_for_anon.sql` and click **RUN**.

This allows the collector app (using anon key) to write to the database.

## Step 2: Enable Realtime (REQUIRED)
Copy and paste the entire contents of `supabase/enable_realtime.sql` and click **RUN**.

This enables real-time updates so changes appear instantly in the React app.

## Step 3: Verify Setup (OPTIONAL)
Copy and paste the entire contents of `supabase/verify_setup_simple.sql` and click **RUN**.

This checks if everything is configured correctly. Look at the "Messages" tab for the summary:
- ✅ ALL CHECKS PASSED = You're good to go!
- ⚠️ ISSUES FOUND = Follow the suggestions in the output

## Test It

1. Open the collector app
2. Record a test transaction
3. Check the React app - changes should appear within 1-2 seconds

## If It Still Doesn't Work

1. Check the browser console (F12) for errors
2. Verify both apps are using the same Supabase URL
3. Try the diagnostic component (see QUICK_FIX_SUMMARY.md)
4. Check if the collector app shows any error messages

## Common Issues

### "Failed to record collection" in collector app
- RLS is still blocking writes
- Make sure you ran `fix_rls_for_anon.sql`
- Check Supabase logs for policy violations

### Changes appear after 5 seconds but not instantly
- Realtime not enabled properly
- Run `enable_realtime.sql` again
- Check browser console for WebSocket errors

### Changes never appear
- Collector app might not be saving successfully
- Check Supabase Table Editor to see if data is being written
- Verify both apps use the same Supabase URL and anon key
