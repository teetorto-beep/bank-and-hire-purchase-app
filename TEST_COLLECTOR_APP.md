# Test: Is Collector App Actually Saving to Database?

## Quick Test

1. Open the collector app
2. Record a test payment
3. Does it show a SUCCESS message with a green checkmark?
4. Or does it show an ERROR?

## If You See an Error

The collector app is being BLOCKED by Row Level Security (RLS) policies.

**YOU MUST RUN THIS SCRIPT:**
- Go to Supabase SQL Editor
- Copy and paste ALL of `supabase/fix_rls_for_anon.sql`
- Click RUN (not Explain)

This is the MOST IMPORTANT step. Without this, the collector app cannot write anything to the database.

## If You See Success But Data Doesn't Appear

Then run:
- `supabase/enable_realtime.sql` in Supabase SQL Editor

## How to Check if Data is Actually in Database

1. Go to Supabase Dashboard
2. Click "Table Editor" in the left menu
3. Open the "collections" table
4. Sort by "created_at" descending
5. Do you see the recent collections from the collector app?

### If YES (data is in database):
- The problem is realtime sync
- Run `supabase/enable_realtime.sql`
- Hard refresh your React app (Ctrl+Shift+R)

### If NO (data is NOT in database):
- The collector app is being blocked by RLS
- Run `supabase/fix_rls_for_anon.sql` IMMEDIATELY
- This is blocking ALL writes from the collector app

## Critical: Did You Run These Scripts?

Have you actually run these scripts in Supabase SQL Editor?

- [ ] `supabase/fix_rls_for_anon.sql` - REQUIRED
- [ ] `supabase/enable_realtime.sql` - REQUIRED

If you haven't run them, that's why nothing is working!
