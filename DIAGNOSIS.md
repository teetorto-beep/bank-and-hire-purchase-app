# Diagnosis: Collector App Not Reflecting in React App

## Step 1: Check Collector App Behavior

When you record a payment in the collector app, what happens?

### Scenario A: You see a SUCCESS screen ✅
- Green checkmark icon
- "Payment Recorded!" title
- Shows customer name, amount, new balance, reference number

**If this is what you see:** The collector app IS saving to the database successfully. Skip to Step 3.

### Scenario B: You see an ERROR alert ❌
- Red alert popup
- Says "Error" or "Failed to record collection"
- Shows an error message

**If this is what you see:** The collector app is BLOCKED by RLS policies. Go to Step 2.

### Scenario C: It just hangs/loads forever ⏳
- Spinner keeps spinning
- Never shows success or error

**If this is what you see:** Network issue or RLS blocking. Go to Step 2.

---

## Step 2: Fix RLS Policies (REQUIRED if you see errors)

The collector app uses the anon key without authentication, but your database has Row Level Security (RLS) that only allows authenticated users.

### Action Required:
1. Open Supabase Dashboard: https://gwuhyjfqpdyyptlldtnb.supabase.co
2. Go to SQL Editor (left sidebar)
3. Copy the ENTIRE contents of `supabase/fix_rls_for_anon.sql`
4. Paste into SQL Editor
5. Click the **RUN** button (▶) - NOT "Explain"
6. Wait for "Success" message

### What This Does:
- Allows the collector app (anon key) to:
  - Read customers, accounts, loans
  - Insert transactions and collections
  - Update account balances, loan outstanding amounts
  - Insert notifications

### After Running:
- Try recording a payment in the collector app again
- You should now see the SUCCESS screen
- Then go to Step 3

---

## Step 3: Enable Realtime (REQUIRED for instant updates)

Even if data is saving, it won't appear instantly without realtime.

### Action Required:
1. In the same Supabase SQL Editor
2. Copy the ENTIRE contents of `supabase/enable_realtime.sql`
3. Paste into SQL Editor
4. Click **RUN** (▶)
5. Wait for "Success" message

### What This Does:
- Adds all tables to the realtime publication
- Sets replica identity to FULL (required for UPDATE events)
- Enables instant sync between collector app and React app

### After Running:
- Changes should appear in React app within 1-2 seconds
- No need to refresh the page

---

## Step 4: Verify Setup (OPTIONAL)

To confirm everything is configured correctly:

1. In Supabase SQL Editor
2. Copy contents of `supabase/verify_setup_simple.sql`
3. Click **RUN**
4. Check the "Messages" tab for results

**Expected Output:**
```
✅ ALL CHECKS PASSED - Configuration looks good!
```

**If you see issues:**
- Follow the suggestions in the output
- Re-run the scripts mentioned

---

## Step 5: Test End-to-End

1. **Open collector app**
2. **Record a test payment** (small amount like GH₵ 1.00)
3. **Check for SUCCESS screen** in collector app
4. **Immediately check React app** (within 2 seconds)
5. **Look at:**
   - Transaction History page (should show new transaction)
   - Collection Report page (should show new collection)
   - Account balance (should be updated)

---

## Step 6: Check Database Directly

If you're still not sure if data is saving:

1. Go to Supabase Dashboard
2. Click **Table Editor** (left sidebar)
3. Open **collections** table
4. Click the **created_at** column header to sort by newest first
5. Do you see recent collections?

### If YES:
- Data IS saving
- Problem is realtime sync
- Make sure you ran `enable_realtime.sql`
- Hard refresh React app (Ctrl+Shift+R)

### If NO:
- Data is NOT saving
- Collector app is blocked
- Make sure you ran `fix_rls_for_anon.sql`
- Check collector app for error messages

---

## Common Issues

### "Error: new row violates row-level security policy"
- You didn't run `fix_rls_for_anon.sql`
- Or it failed to run
- Run it again and check for errors

### "Success in collector app but nothing in React app"
- You didn't run `enable_realtime.sql`
- Or realtime is not connecting
- Check browser console (F12) for WebSocket errors
- Hard refresh React app

### "Changes appear after 5 seconds"
- Realtime is not working, but polling is
- This is OK but not ideal
- Run `enable_realtime.sql` for instant updates

### "Nothing works at all"
- Check if both apps use the same Supabase URL
- Check if anon key is correct in both apps
- Check Supabase project is not paused
- Check internet connection

---

## Quick Checklist

- [ ] Ran `fix_rls_for_anon.sql` in Supabase SQL Editor
- [ ] Ran `enable_realtime.sql` in Supabase SQL Editor
- [ ] Collector app shows SUCCESS screen when recording payment
- [ ] Checked Supabase Table Editor - collections table has recent data
- [ ] Hard refreshed React app (Ctrl+Shift+R)
- [ ] Checked browser console for errors (F12)

---

## Still Not Working?

Tell me:
1. What happens when you record a payment in collector app? (Success/Error/Hangs)
2. Did you run both SQL scripts? (Yes/No)
3. Do you see data in Supabase Table Editor → collections table? (Yes/No)
4. Any errors in browser console? (F12 → Console tab)
