# Check Database Directly

We need to verify if the collector app is actually writing to the `collections` table.

## Step 1: Check Collections Table in Supabase

1. Go to Supabase Dashboard: https://gwuhyjfqpdyyptlldtnb.supabase.co
2. Click **Table Editor** in the left sidebar
3. Select the **collections** table
4. Click the **created_at** column header to sort by newest first
5. Look at the most recent entries

## What to Check:

### Question 1: Do you see the GH₵ 800.00 collection?
- Look for a row with amount = 800
- created_at should be recent (today)
- collector_name should be "DOMINIC"
- customer_name should match

### Question 2: What's the most recent created_at timestamp?
- Compare it to the transaction timestamp (TXN1775748329279YWH)
- They should be very close (within seconds)

### Question 3: How many total rows in collections table?
- Look at the bottom of the table editor
- It should show total count

## Step 2: Run This SQL Query

In Supabase SQL Editor, run this:

```sql
-- Check recent collections
SELECT 
  id,
  collector_name,
  customer_name,
  amount,
  payment_type,
  created_at,
  status
FROM collections
ORDER BY created_at DESC
LIMIT 10;
```

This will show you the 10 most recent collections.

## Step 3: Compare with Transactions

Run this to see if transactions exist without matching collections:

```sql
-- Find transactions from collector app that might not have collection records
SELECT 
  t.id,
  t.reference,
  t.amount,
  t.narration,
  t.created_at as transaction_time,
  c.id as collection_id,
  c.created_at as collection_time
FROM transactions t
LEFT JOIN collections c ON t.reference LIKE '%' || c.id::text || '%' 
  OR (t.amount = c.amount AND DATE(t.created_at) = DATE(c.created_at))
WHERE t.narration LIKE '%DOMINIC%'
  AND t.created_at > NOW() - INTERVAL '1 day'
ORDER BY t.created_at DESC
LIMIT 10;
```

## Expected Results:

### If collections ARE in the database:
- The React app has a caching/refresh issue
- Solution: Clear browser cache, hard refresh (Ctrl+Shift+R)

### If collections are NOT in the database:
- The collector app is not writing to collections table
- There's an error in the collector app code
- Check collector app console for errors

## Tell Me:

1. Do you see the GH₵ 800.00 collection in the collections table?
2. What's the total count of collections?
3. What's the most recent created_at timestamp?
