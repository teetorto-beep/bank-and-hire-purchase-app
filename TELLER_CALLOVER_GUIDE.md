# Teller Call-Over Report Guide

## Overview

The Teller Call-Over Report is a critical end-of-day reconciliation tool that helps you review all teller transactions before posting them to the general ledger.

## What is Call-Over?

Call-over is the process of:
1. Reviewing all transactions posted by tellers during the day
2. Verifying cash on hand matches the system records
3. Reconciling any discrepancies
4. Approving transactions for final posting

## How to Access

### Method 1: From Reports Page
1. Go to **Reports** from the sidebar
2. Click the **"Teller Call-Over"** button in the top-right corner

### Method 2: Direct URL
Navigate to: `/reports/teller`

## Features

### 1. Date Selection
- Select any date to view transactions for that day
- Defaults to today's date
- Can review historical transactions

### 2. Teller Filter
- View all tellers combined
- Filter by specific teller
- Useful for individual teller reconciliation

### 3. Show Reversed Transactions
- Toggle to include/exclude reversed transactions
- Helps identify corrections made during the day

### 4. Summary Cards

#### Total Credits
- Sum of all deposit/credit transactions
- Number of credit transactions
- Displayed in green

#### Total Debits
- Sum of all withdrawal/debit transactions
- Number of debit transactions
- Displayed in red

#### Net Cash Position
- Credits minus Debits
- Shows if cash increased (green) or decreased (red)
- Critical for cash reconciliation

#### Total Transactions
- Total number of transactions
- Number of tellers who posted transactions

### 5. Teller Summary Table
When viewing all tellers, shows:
- Each teller's name
- Their total credits and count
- Their total debits and count
- Their net cash position
- Total transactions posted

### 6. Transaction Details Table
Complete list of all transactions showing:
- Time of transaction
- Reference number
- Account number
- Customer name
- Narration/description
- Transaction type (Credit/Debit)
- Amount
- Balance after transaction
- Teller who posted it
- Status (Posted/Reversed)

## Export Options

### PDF Export
- Professional formatted report
- Includes all transaction details
- Summary totals at the bottom
- Perfect for physical records and audits

### CSV Export
- Spreadsheet format
- All transaction data
- Easy to analyze in Excel
- Good for further processing

## Call-Over Process

### Step 1: Select Date
Choose the date you want to reconcile (usually today)

### Step 2: Review Summary
Check the summary cards:
- Are the totals reasonable?
- Does the net cash position make sense?

### Step 3: Review by Teller
If multiple tellers:
1. Review the Teller Summary table
2. Check each teller's totals
3. Identify any unusual patterns

### Step 4: Review Individual Transactions
Scroll through the transaction details:
- Look for unusual amounts
- Verify narrations are clear
- Check for any reversed transactions
- Ensure all transactions are legitimate

### Step 5: Physical Cash Count
For each teller:
1. Count physical cash on hand
2. Compare with their net cash position
3. Reconcile any differences

### Step 6: Document Discrepancies
If there are differences:
- Note the amount
- Identify the cause
- Document the resolution
- Create adjustment entries if needed

### Step 7: Export Records
1. Export PDF for physical filing
2. Export CSV for digital records
3. Store in appropriate location

### Step 8: Approve for Posting
Once reconciled:
- Transactions are ready for GL posting
- Can proceed with end-of-day process

## Common Scenarios

### Scenario 1: Cash Over
Net cash position is positive (more credits than debits)
- Teller should have more cash than they started with
- Verify deposits were properly recorded
- Check for any missing withdrawals

### Scenario 2: Cash Short
Net cash position is negative (more debits than credits)
- Teller should have less cash than they started with
- Verify withdrawals were properly recorded
- Check for any missing deposits

### Scenario 3: Reversed Transactions
Transactions marked as reversed:
- Check why they were reversed
- Verify correction was made
- Ensure customer was properly handled

### Scenario 4: Large Transactions
Unusually large amounts:
- Verify authorization was obtained
- Check supporting documentation
- Confirm customer identity

## Best Practices

### Daily Routine
1. Run call-over at end of each business day
2. Don't leave until reconciled
3. Export and file reports daily

### Multiple Tellers
1. Review each teller individually first
2. Then review combined totals
3. Have each teller verify their own transactions

### Documentation
1. Keep PDF exports for audit trail
2. Store CSV files for analysis
3. Document any discrepancies in writing

### Discrepancy Resolution
1. Investigate immediately
2. Don't carry forward unresolved differences
3. Create adjustment entries when needed
4. Get supervisor approval for adjustments

## Troubleshooting

### No Transactions Showing
- Check the date selected
- Verify teller filter is set correctly
- Ensure transactions were posted today

### Totals Don't Match
- Check if reversed transactions are included
- Verify date range is correct
- Look for transactions posted after hours

### Missing Teller
- Teller may not have posted any transactions
- Check if teller is in the system
- Verify teller permissions

### Export Not Working
- Check browser pop-up blocker
- Ensure sufficient permissions
- Try different export format

## Security & Compliance

### Access Control
- Only authorized users should access call-over
- Typically: Managers, Supervisors, Auditors
- Tellers can view their own transactions

### Audit Trail
- All transactions are timestamped
- Teller identity is recorded
- Exports create permanent records

### Regulatory Compliance
- Daily reconciliation is required
- Records must be kept for audit
- Discrepancies must be documented

## Tips for Efficiency

1. **Run call-over before tellers leave** - Easier to resolve issues while they're present
2. **Use teller filter** - Review one teller at a time for accuracy
3. **Export immediately** - Don't wait until later
4. **Check reversed transactions** - They often indicate issues
5. **Compare to previous days** - Spot unusual patterns
6. **Keep physical records** - PDF exports in a binder

## Integration with Other Features

### Post Transaction
- Transactions posted here appear in call-over
- Ensure proper narration for easy review

### Transaction History
- Full history available for reference
- Can cross-check with call-over report

### General Ledger
- After call-over, transactions post to GL
- Call-over ensures GL accuracy

### Approvals
- Some transactions may need approval
- Call-over helps identify pending approvals

## Keyboard Shortcuts

- **Date picker**: Click to select date
- **Teller dropdown**: Click to filter
- **Export buttons**: Click for instant export

## Mobile Access

The Teller Call-Over report is optimized for desktop use due to the detailed tables. For mobile:
- Use landscape orientation
- Scroll horizontally for full table
- Export and view PDF on mobile

## Support

For issues or questions:
1. Check this guide first
2. Contact your system administrator
3. Review transaction history for context
4. Consult with supervisor for discrepancies

---

**Remember**: Call-over is your last line of defense against errors. Take your time, be thorough, and don't rush the process. A few extra minutes of careful review can prevent major issues later.
