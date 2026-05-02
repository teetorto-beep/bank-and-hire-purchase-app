# Majupat Love Enterprise — Complete User Guide

**Version 2.0 | Developed by Maxbraynn Technology & Systems**

---

## Table of Contents

1. Introduction & Overview
2. System Access & Login
3. Dashboard
4. Customer Management
5. Account Management
6. Teller Operations (Post Transaction)
7. Transaction History & Statement
8. Pending Approvals
9. Loans
10. Hire Purchase (HP)
11. Collectors & Field Collections
12. Reports
13. General Ledger (GL)
14. Products & HP Items Catalogue
15. User Management
16. Settings (Approval Rules, Backups, Data Management)
17. Collector Mobile App
18. Customer Mobile App
19. Roles & Permissions
20. Troubleshooting

---

## 1. Introduction & Overview

Majupat Love Enterprise Banking System is a full-featured microfinance and hire-purchase management platform. It supports:

- Customer onboarding and KYC
- Savings, current, fixed deposit, and hire-purchase accounts
- Loan origination, disbursement, and repayment tracking
- Hire purchase agreements with linked loan financing
- Field collection via mobile app (collector app)
- Customer self-service via mobile app (customer app)
- General ledger with double-entry bookkeeping
- Approval workflows for transactions, loans, and account openings
- Automated backups with PDF, CSV, and Excel export
- Role-based access control (Admin, Manager, Teller, Collector, Viewer)

**Web App URL:** https://banking-app-a6b8a.web.app

---

## 2. System Access & Login

### Accessing the System
Open the web app URL in any modern browser (Chrome, Firefox, Edge).

### Login
1. Enter your **Email** and **Password**
2. Click **Sign In**
3. The system will load your dashboard based on your role

### Default Credentials
| Role  | Email                  | Password   |
|-------|------------------------|------------|
| Admin | admin@majupat.com      | admin123   |
| Teller| teller@majupat.com     | teller123  |

> **Important:** Change default passwords immediately after first login via Settings → Users.

### Forgot Password
Contact your system administrator to reset your password via the Users management page.

---

## 3. Dashboard

The dashboard is the first screen after login. It provides a real-time overview of the business.

### Key Metrics Displayed
- **Total Customers** — number of registered customers
- **Active Accounts** — accounts currently in active status
- **Total Deposits** — sum of all savings account balances
- **Active Loans** — number of loans currently active
- **Loan Book** — total outstanding loan balance
- **Overdue Loans** — loans past their due date
- **Today's Collections** — field collections recorded today
- **Pending Approvals** — items waiting for admin/manager action

### Charts & Graphs
- Transaction volume over time
- Loan portfolio breakdown by type
- Collection performance by collector

### Real-Time Updates
The dashboard refreshes automatically every 2 seconds and updates instantly when any transaction is posted.

---

## 4. Customer Management

**Menu:** Customers

### Viewing Customers
The customers list shows all registered customers with their name, phone, Ghana Card number, KYC status, and number of accounts.

**Search:** Use the search bar to find customers by name, phone number, or Ghana Card number.

**Filters:** Filter by KYC status (Pending, Verified, Rejected).

### Adding a New Customer
1. Click **New Customer**
2. Fill in the required fields:
   - **Full Name** (required)
   - **Phone Number** (required)
   - **Ghana Card Number**
   - **Date of Birth**
   - **Address**
   - **Occupation**
   - **Employer**
   - **Monthly Income**
3. Click **Save Customer**

### Customer KYC
After creating a customer, update their KYC status:
- **Pending** — documents not yet verified
- **Verified** — identity confirmed
- **Rejected** — documents failed verification

### Customer Detail View
Click any customer to open their full profile showing:
- Personal information
- All linked accounts
- Loan history
- HP agreements
- Transaction history

### Customer App Credentials
To give a customer access to the mobile customer app:
1. Open the customer detail
2. Set **App Username** and **App Password**
3. Share credentials with the customer

---

## 5. Account Management

**Menu:** Accounts

### Account Types
| Type           | Description                              |
|----------------|------------------------------------------|
| Savings        | Standard interest-bearing savings account|
| Current        | Demand deposit / current account         |
| Fixed Deposit  | Time-locked deposit with fixed rate      |
| Hire Purchase  | Account linked to HP agreement           |
| Joint          | Account shared by multiple customers     |

### Opening a New Account
1. Go to **Accounts → Open Account**
2. Search for the customer (by name, phone, or Ghana Card)
3. Select the account type
4. Choose the product (defines interest rate and terms)
5. Enter initial deposit amount (if any)
6. Click **Submit**

> If approval rules require it, the account opening will go to the Pending Approvals queue.

### Account 360° View
The **Account 360°** page gives a complete view of any customer:
1. Search by account number, name, phone, or Ghana Card
2. See all accounts, balances, loans, HP agreements, and recent transactions
3. Apply account balance to offset a loan directly from this screen

### Account Status
- **Active** — normal operating status
- **Dormant** — no transactions for an extended period
- **Frozen** — temporarily blocked (admin action)
- **Closed** — permanently closed

### Account Search
Use **Account Search** to quickly find any account by number.

---

## 6. Teller Operations

**Menu:** Teller → Teller Session

The Teller Session is the main screen for posting transactions.

### Starting a Session
The teller session loads automatically. It shows:
- Today's transaction count and total
- Quick-post buttons for common operations
- Recent transactions posted in this session

### Posting a Credit (Deposit)
1. Search for the account (by number or customer name)
2. Select the account from results
3. Enter the **Amount**
4. Select **Credit** as the transaction type
5. Enter a **Narration** (description)
6. Click **Post Transaction**

### Posting a Debit (Withdrawal)
1. Search for the account
2. Select the account
3. Enter the **Amount**
4. Select **Debit** as the transaction type
5. Enter a **Narration**
6. Click **Post Transaction**

> If the amount exceeds the approval threshold set in Settings, the transaction will go to the Pending Approvals queue instead of posting immediately.

### Fund Transfer
1. Search for the **source account**
2. Enter the amount
3. Search for the **destination account**
4. Enter narration
5. Click **Transfer**

### Transaction Narration Presets
Common narrations are available as quick-select buttons (e.g., "Cash Deposit", "Withdrawal", "Loan Repayment") to speed up data entry.

### Reversing a Transaction
Admins and managers can reverse a posted transaction:
1. Go to **Transaction History**
2. Find the transaction
3. Click the **Reverse** icon
4. Enter the reason for reversal
5. Click **Confirm Reversal**

A counter-entry is posted and the original is marked as reversed.

---

## 7. Transaction History & Statement

### Transaction History
**Menu:** Transactions → History

Shows all transactions across all accounts. Features:
- Search by narration, reference, account number, customer name, or posted by
- Filter by type (Credit/Debit) and date range
- Export to **CSV** or **PDF**
- View full transaction details
- Reverse transactions (admin/manager only)

### Account Statement
**Menu:** Transactions → Statement

Generate a professional bank statement for any account:
1. Search for the account
2. Select a period preset (Today, This Week, This Month, Last Month, Custom)
3. Or enter custom **From** and **To** dates
4. Click **Generate Statement**

The statement shows:
- Account and customer details
- Opening balance, total credits, total debits, closing balance
- Full transaction list with running balance
- Loan summary (if applicable)
- HP agreement summary (if applicable)

**Export options:** Print, CSV, PDF

---

## 8. Pending Approvals

**Menu:** Transactions → Approvals

All items requiring authorization appear here.

### Types of Approvals
- **Transactions** — credits/debits above the threshold amount
- **Account Openings** — new account requests from collectors
- **Loan Applications** — new loan requests

### Approving an Item
1. Review the details of the pending item
2. Click **Approve** (green button)
3. The item is processed immediately

### Rejecting an Item
1. Click **Reject** (red button)
2. Enter the reason for rejection
3. Click **Confirm Rejection**

The submitter (teller or collector) is notified of the decision.

### Approval Rules
Configure which operations require approval in **Settings → Approval Rules**. See Section 16.

---

## 9. Loans

**Menu:** Loans

### Loan Types
| Type          | Description                        |
|---------------|------------------------------------|
| Personal      | General purpose personal loan      |
| Micro         | Small business / micro-finance     |
| Mortgage      | Property-backed loan               |
| Emergency     | Short-term emergency loan          |
| Group         | Group lending scheme               |
| Hire Purchase | Linked to HP agreement             |

### Applying for a Loan
**Menu:** Loans → New Loan

1. **Select Customer** — search by name or phone
2. **Select Account** — the account to link the loan to
3. **Select Product** — defines the default interest rate
4. **Enter Amount** — loan principal
5. **Set Tenure** — repayment period in months
6. **Interest Rate** — pre-filled from product, can be edited
7. **Calculation Method:**
   - **Amortization** — reducing balance (standard banking)
   - **Flat Rate** — simple interest on original principal
8. **Purpose** — brief description of loan purpose
9. Click **Submit**

The system calculates and displays:
- Monthly payment
- Total repayment amount
- Total interest
- Daily and weekly payment equivalents

### Loan Calculator
**Menu:** Loans → Calculator

Use this to calculate loan repayments before creating a loan. Enter principal, rate, tenure, and method to see the full repayment schedule.

### Loan Approval
If loan creation requires approval (configured in Settings), the loan goes to Pending Approvals. Admin/manager approves and the loan is disbursed.

### Loan Repayment
From the Loans list:
1. Find the active loan
2. Click the **$** (repayment) button
3. Enter the repayment amount
4. Click **Record Repayment**

The system:
- Reduces `loans.outstanding` by the payment amount
- Posts a debit transaction to the account
- Marks the loan as **Completed** when outstanding reaches zero

### Loan Status
| Status    | Meaning                              |
|-----------|--------------------------------------|
| Pending   | Awaiting approval                    |
| Active    | Disbursed and repayments ongoing     |
| Overdue   | Past due date with balance remaining |
| Completed | Fully repaid                         |
| Rejected  | Application was rejected             |

### Loan Reports
The Loans page has a **Reports** tab showing:
- Loan portfolio summary by period
- Total principal, repayment, outstanding
- Collection rate percentage
- Export to CSV or PDF

---

## 10. Hire Purchase (HP)

**Menu:** Hire Purchase

Hire purchase allows customers to acquire goods and pay in instalments.

### HP Items Catalogue
**Menu:** Hire Purchase → Items

Manage the catalogue of goods available for hire purchase:
1. Click **New Item**
2. Enter item name, category, description
3. Set the **Cash Price**
4. Set **Daily Payment** and **Weekly Payment** suggested amounts
5. Set **Stock** quantity
6. Click **Save**

### Creating an HP Agreement
**Menu:** Hire Purchase → Agreements → New Agreement

1. **Select Customer**
2. **Select Item** from the catalogue
3. **Payment Frequency** — Daily, Weekly, or Monthly
4. **Down Payment** — upfront payment (optional)
5. **Generate Linked Loan** — tick this to create a loan record for the balance
   - Set **Interest Rate** (pre-filled from HP product)
   - Set **Tenure** in months
   - Select **Linked Account**
6. Click **Create Agreement**

The system shows a full breakdown:
- Principal (item price minus down payment)
- Total interest
- Monthly payment
- Total repayment

### HP Payment History
The **Payment History** tab shows all payments made against HP agreements, including who collected the payment and the remaining balance.

### Recording an HP Payment (Web)
From the Agreements list:
1. Find the active agreement
2. Click **Pay**
3. Enter the payment amount
4. Click **Record Payment**

The system updates:
- `hp_agreements.total_paid` and `remaining`
- `hp_payments` record
- Linked `loans.outstanding` (if a loan is linked)

---

## 11. Collectors & Field Collections

**Menu:** Collectors

### Managing Collectors
1. Click **New Collector**
2. Enter name, phone, zone, username, and password
3. Click **Save**

The collector can then log in to the **Collector Mobile App** using their username and password.

### Assigning Customers to Collectors
From the Collector Detail page, assign specific customers to a collector for their zone.

### Collection Report
**Menu:** Collectors → Collection Report

View all collections by collector, date range, and payment type. Export to PDF.

### Collector Detail
Click any collector to see:
- Their assigned customers
- Total collected amount
- Collection history by date

---

## 12. Reports

**Menu:** Reports

### Available Reports

#### Summary Report
Overview of the entire business:
- Total deposits, withdrawals, net movement
- Loan portfolio summary
- Collection summary
- Period filters: Today, This Week, This Month, Custom

#### Teller Report
**Menu:** Reports → Teller Report

Daily teller performance report showing:
- Transactions posted by each teller
- Total credits and debits per teller
- Session summary

#### Collection Report
Field collection performance:
- Collections by collector
- Collections by payment type (Savings, Loan, HP)
- Date range filter
- Export to PDF

### Exporting Reports
All reports support:
- **PDF** — formatted printable report
- **CSV** — raw data for spreadsheet analysis

---

## 13. General Ledger (GL)

**Menu:** General Ledger

The GL module provides double-entry bookkeeping for the enterprise.

### Chart of Accounts
The system comes pre-loaded with a standard chart of accounts:

| Code Range | Type      | Examples                          |
|------------|-----------|-----------------------------------|
| 1000–1999  | Assets    | Cash, Loan Receivables, Deposits  |
| 2000–2999  | Liabilities| Customer Deposits, Interest Payable|
| 3000–3999  | Equity    | Share Capital, Retained Earnings  |
| 4000–4999  | Revenue   | Loan Interest, Transaction Fees   |
| 5000–5999  | Expenses  | Salaries, Rent, Provisions        |

### Posting a Journal Entry
1. Go to **General Ledger → Post Entry**
2. Select the **Debit Account**
3. Select the **Credit Account**
4. Enter the **Amount**
5. Enter a **Narration**
6. Click **Post Entry**

> Journal entries may require approval depending on your Settings configuration.

### End of Day
**Menu:** General Ledger → End of Day

Run the end-of-day process to:
- Reconcile all transactions
- Generate the daily GL summary
- Close the day's books

### GL Reports
View the trial balance, income statement, and balance sheet from the GL page.

---

## 14. Products & HP Items Catalogue

### Bank Products
**Menu:** Products

Products define the terms for accounts and loans:
1. Click **New Product**
2. Enter product name and category
3. Set **Interest Rate** (% per annum)
4. Set **Minimum Balance**
5. Set **Monthly Fee** (if applicable)
6. Set **Tenure** (for loan products)
7. Add **Benefits** (bullet points shown to customers)
8. Click **Save**

**Categories:** Savings, Current, Fixed Deposit, Hire Purchase, Personal Loan, Micro Loan, Mortgage, Emergency, Group

### HP Items
**Menu:** Hire Purchase → Items

See Section 10 for full details on managing the HP items catalogue.

---

## 15. User Management

**Menu:** Users (Admin only)

### Adding a New User
1. Click **New User**
2. Enter **Name**, **Email**, **Password**
3. Select **Role**
4. Enter **Phone** (optional)
5. Click **Save**

### Editing a User
1. Click the **Edit** icon on any user
2. Update fields as needed
3. Leave **Password** blank to keep the current password
4. Click **Save**

### User Roles
| Role      | Access Level                                              |
|-----------|-----------------------------------------------------------|
| Admin     | Full access to everything including Settings and Users    |
| Manager   | All operations except user management and system settings |
| Teller    | Post transactions, view accounts, generate statements     |
| Collector | Mobile app only — record field collections                |
| Viewer    | Read-only access to reports and dashboards                |

### Custom Permissions
For fine-grained control, admins can set custom permissions per user to override their role defaults. Click the **Permissions** icon on any user.

### Deactivating a User
Set the user's **Status** to **Inactive** to prevent login without deleting the account.

---

## 16. Settings

**Menu:** Settings (Admin only)

### System Info Tab
Shows application version, current user session details, and a database overview with row counts per table.

### Approval Rules Tab
Configure which operations require manager/admin approval before processing.

**Available Rules:**
| Rule                | Description                                    |
|---------------------|------------------------------------------------|
| Credit Threshold    | Credits above GH₵X require approval           |
| Debit Threshold     | Debits above GH₵X require approval            |
| Transfer Threshold  | Transfers above GH₵X require approval         |
| Account Opening     | All new accounts require approval              |
| Loan Creation       | All new loans require approval                 |
| GL Journal Entry    | Manual GL entries require approval             |
| Customer Creation   | New customer registration requires approval    |
| User Creation       | Adding new users requires approval             |

**To configure a rule:**
1. Toggle the rule **ON**
2. Set the threshold amount (for amount-based rules)
3. Select which **roles** the rule applies to
4. Click **Save Rules**

> Admins are always exempt from approval rules.

### Backups Tab
**Auto-Backup:** Saves all data to the database every 30 minutes while admin is logged in.

**Auto-Download:** Automatically downloads a ZIP backup to your computer every 10 days.

**Manual Backup:** Click **Backup Now** to create an immediate backup.

**Backup Table columns:**
- **#** — backup number (Latest = most recent)
- **Date & Time** — when the backup was created
- **Created By** — which user triggered it
- **Rows** — total number of database rows captured

**Export options per backup:**
- **CSV** — ZIP file containing one CSV per table
- **Excel** — Single XLSX file with each table as a sheet
- **PDF** — Summary report with row counts and key statistics

**Restore:** Click **Restore** on any backup to roll back all data to that point in time.

### Data Management Tab
**Download All Data:** Exports the entire database as a ZIP of CSV files.

**Individual Table Clear:** Clear specific tables (with confirmation).

**Clear All Data:**
1. Click **Clear All Data**
2. Enter your **admin login password** when prompted
3. Click **Verify Password**
4. Review the final confirmation screen
5. Click **Yes, Delete All Data**

> After clearing, the default admin and teller accounts are automatically restored. GL chart of accounts is also re-seeded.

---

## 17. Collector Mobile App

The Collector App is an Android application for field agents to record cash collections.

### Login
- Enter your **Username** and **Password** (set by admin in the web system)
- Tap **Sign In**

### Dashboard (Home)
Shows:
- Good morning/afternoon/evening greeting
- Total collected for the selected period
- Breakdown by Savings, Loan, and HP
- Recent collections list
- Period filter: Today, 7 Days, Month, All

### Recording a Collection (Collect Tab)
**Step 1 — Find Account:**
1. Tap the **Collect** tab (center button)
2. Type the account number or customer name
3. Tap **Search**
4. Select the correct account from results

**Step 2 — Post Collection:**
1. Select the **Payment Type:**
   - **Savings** — customer depositing into savings (increases account balance)
   - **Loan** — customer making loan repayment (reduces loan outstanding)
   - **HP** — customer making hire purchase payment (reduces HP remaining balance)
2. Enter the **Amount**
3. Add **Notes** (optional — receipt number, remarks)
4. Tap **Post [Type]**

**What happens in the database:**
- **Savings:** `accounts.balance` increases, `transactions` record (credit) inserted
- **Loan:** `loans.outstanding` decreases, `transactions` record (debit) inserted
- **HP:** `hp_agreements.remaining` decreases, `hp_payments` record inserted, linked `loans.outstanding` decreases, `transactions` record (debit) inserted
- All types: `collections` record inserted, `collectors.total_collected` updated

### Accounts Tab
Submit new account opening requests on behalf of customers:
1. Search for existing customer or create new
2. Select product
3. Enter initial deposit
4. Submit for admin approval

### Reports Tab
View your collection history with date range filter:
- Quick filters: Today, 7 Days, This Month, All Time
- Custom date range (From / To)
- Export to PDF

### Alerts Tab
View notifications from the system (approvals, rejections, updates).

### Profile Tab
View your collector profile and total collected amount. Sign out from here.

---

## 18. Customer Mobile App

The Customer App allows customers to view their accounts and transaction history.

### Login
- Enter **App Username** and **App Password** (set by admin/teller in the web system)
- Tap **Sign In**

### Home Screen
- Total portfolio balance across all accounts
- Today's credits and debits
- Quick action buttons (Accounts, Loans, History, Alerts)
- Overdue loan alerts
- Next payment due reminder
- Recent transactions

### Accounts Tab
- View all active accounts
- See balance for each account
- Tap an account to view its transaction history

### Loans Tab
- View all active and overdue loans
- See outstanding balance, monthly payment, next due date
- Progress bar showing repayment percentage

### History Tab
- Full transaction history across all accounts
- Filter by date range
- Search by narration

### Notifications Tab
- Real-time alerts for deposits, withdrawals, loan updates
- Mark as read

### Profile Tab
- View personal information
- Sign out

---

## 19. Roles & Permissions Summary

| Feature                    | Admin | Manager | Teller | Viewer |
|----------------------------|-------|---------|--------|--------|
| Dashboard                  | ✅    | ✅      | ✅     | ✅     |
| View Customers             | ✅    | ✅      | ✅     | ✅     |
| Add/Edit Customers         | ✅    | ✅      | ✅     | ❌     |
| View Accounts              | ✅    | ✅      | ✅     | ✅     |
| Open Accounts              | ✅    | ✅      | ✅     | ❌     |
| Post Transactions          | ✅    | ✅      | ✅     | ❌     |
| Reverse Transactions       | ✅    | ✅      | ❌     | ❌     |
| Approve Transactions       | ✅    | ✅      | ❌     | ❌     |
| View Loans                 | ✅    | ✅      | ✅     | ✅     |
| Create Loans               | ✅    | ✅      | ✅*    | ❌     |
| Approve Loans              | ✅    | ✅      | ❌     | ❌     |
| HP Agreements              | ✅    | ✅      | ✅     | ✅     |
| Manage Collectors          | ✅    | ✅      | ❌     | ❌     |
| View Reports               | ✅    | ✅      | ✅     | ✅     |
| General Ledger             | ✅    | ✅      | ✅*    | ✅     |
| Manage Products            | ✅    | ✅      | ❌     | ❌     |
| Manage Users               | ✅    | ❌      | ❌     | ❌     |
| Settings & Approval Rules  | ✅    | ❌      | ❌     | ❌     |
| Backup & Data Management   | ✅    | ❌      | ❌     | ❌     |

*Subject to approval rules configured in Settings.

---

## 20. Troubleshooting

### Cannot Log In
- Check your email and password are correct
- Ensure your account status is **Active** (ask admin)
- Clear browser cache and try again (Ctrl+Shift+R)

### Transaction Not Posting
- Check if the amount exceeds the approval threshold — it may be in Pending Approvals
- Ensure the account is **Active** (not Frozen or Closed)
- Check your internet connection

### Loan Repayment Not Reducing Balance
- Ensure the loan status is **Active** or **Overdue** (not Pending or Completed)
- Verify the correct account is selected
- Check the collector app is connected to the internet

### HP Payment Not Updating
- Ensure the HP agreement status is **Active**
- The customer must have an active HP agreement in the system
- Check that the agreement is linked to the correct customer

### Collector App — "No Active Loan Found"
- The loan must be in **Active** or **Overdue** status
- The loan must be linked to the customer's account
- Ask admin to verify the loan status in the web system

### Collector App — "No Active HP Found"
- The HP agreement must be in **Active** status
- The agreement must be linked to the customer (by customer ID)
- Ask admin to verify the HP agreement in the web system

### Data Not Refreshing
- Pull down to refresh on mobile apps
- Press Ctrl+Shift+R on the web app
- Check internet connection

### Backup Not Working
- Ensure you are logged in as Admin or Manager
- The backups table must exist in Supabase (run the SQL in the setup guide)
- Check the browser console for error messages

### Clear All Data Password Not Working
- Use your **admin login password** (the same one you use to sign in)
- If you changed your password recently, use the new password
- Passwords are case-sensitive — check Caps Lock

---

## Quick Reference Card

### Common Keyboard Shortcuts (Web App)
| Action              | Shortcut      |
|---------------------|---------------|
| Hard refresh        | Ctrl+Shift+R  |
| Open new tab        | Ctrl+T        |
| Print statement     | Ctrl+P        |

### Key Account Numbers
- Account numbers start with **1000** followed by 7 digits
- Example: **10001234567**

### Transaction Reference Format
- Teller transactions: **TXN** + timestamp + random suffix
- Collector transactions: **COL** + timestamp + random suffix

### Support Contact
For technical support, contact:
**Maxbraynn Technology & Systems**
Developer of Majupat Love Enterprise Banking System

---

*This document is confidential and intended for authorized users of Majupat Love Enterprise only.*
*Version 2.0 — May 2026*
