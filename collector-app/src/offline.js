/**
 * Offline queue for the collector app.
 * When offline, operations are saved to AsyncStorage.
 * When back online, they are replayed against Supabase.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "./supabase";

const QUEUE_KEY = "offline_queue";
const GHS = n => `GH₵ ${Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;

// ── Network state ─────────────────────────────────────────────────────────────
let _isOnline = true;
export function getIsOnline() { return _isOnline; }

export function subscribeToNetwork(onChange) {
  try {
    return NetInfo.addEventListener(state => {
      _isOnline = !!(state.isConnected && state.isInternetReachable);
      onChange(_isOnline);
    });
  } catch (e) {
    console.warn('NetInfo subscribe failed:', e.message);
    return () => {};
  }
}

// ── Queue helpers ─────────────────────────────────────────────────────────────
export async function getQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueue(operation) {
  const queue = await getQueue();
  queue.push({ ...operation, id: Date.now() + Math.random(), createdAt: new Date().toISOString() });
  await saveQueue(queue);
}

async function dequeue(id) {
  const queue = await getQueue();
  await saveQueue(queue.filter(op => op.id !== id));
}

// ── Sync pending operations ───────────────────────────────────────────────────
export async function syncQueue(onProgress) {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0, failed = 0;

  for (const op of queue) {
    try {
      await replayOperation(op);
      await dequeue(op.id);
      synced++;
      onProgress?.({ synced, failed, total: queue.length, current: op });
    } catch (e) {
      console.warn("Sync failed for op", op.type, e.message);
      failed++;
    }
  }

  return { synced, failed };
}

// ── Replay a queued operation ─────────────────────────────────────────────────
async function replayOperation(op) {
  switch (op.type) {
    case "collection": {
      const { collectorId, collectorName, customerId, customerName,
              accountId, amount, notes, paymentType, loanId, hpAgreementId } = op.data;

      // 1. Fetch current balance
      const { data: acc } = await supabase.from("accounts").select("balance, customer_id").eq("id", accountId).single();
      if (!acc) throw new Error("Account not found");

      // Only savings deposits increase account balance — loan/HP payments do NOT
      const isSavings = paymentType === "savings";
      const newBalance = isSavings ? Number(acc.balance) + Number(amount) : Number(acc.balance);
      const ref = `TXN${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;

      // 2. Post transaction
      await supabase.from("transactions").insert({
        account_id: accountId,
        type: isSavings ? "credit" : "debit",
        amount: Number(amount),
        narration: notes || `${paymentType} collection via ${collectorName}`,
        reference: ref, balance_after: newBalance,
        channel: "collection", status: "completed",
        poster_name: collectorName,
        created_by: null,
      });

      // 3. Update account balance ONLY for savings
      if (isSavings) {
        await supabase.from("accounts").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", accountId);
      }

      // 4. Loan outstanding
      if (paymentType === "loan" && loanId) {
        const { data: loan } = await supabase.from("loans").select("outstanding, status").eq("id", loanId).single();
        if (loan) {
          const newOut = Math.max(0, Number(loan.outstanding) - Number(amount));
          await supabase.from("loans").update({ outstanding: newOut, status: newOut <= 0 ? "completed" : loan.status, last_payment_date: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", loanId);
        }
      }

      // 5. HP agreement
      if (paymentType === "hp" && hpAgreementId) {
        const { data: agr } = await supabase.from("hp_agreements").select("total_paid, total_price, loan_id").eq("id", hpAgreementId).single();
        if (agr) {
          const newPaid = Number(agr.total_paid) + Number(amount);
          const remaining = Math.max(0, Number(agr.total_price) - newPaid);
          await supabase.from("hp_agreements").update({ total_paid: newPaid, remaining, status: remaining <= 0 ? "completed" : "active", last_payment_date: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", hpAgreementId);
          await supabase.from("hp_payments").insert({ agreement_id: hpAgreementId, amount: Number(amount), remaining, note: notes || "Collection payment", collected_by: collectorName });

          // Find linked loan — try loan_id first, then search by hp_agreement_id
          let linkedLoanId = agr.loan_id;
          if (!linkedLoanId) {
            const { data: foundLoan } = await supabase.from("loans").select("id").eq("hp_agreement_id", hpAgreementId).in("status", ["active", "overdue"]).limit(1).single();
            linkedLoanId = foundLoan?.id || null;
            if (linkedLoanId) await supabase.from("hp_agreements").update({ loan_id: linkedLoanId }).eq("id", hpAgreementId);
          }
          if (linkedLoanId) {
            const { data: hpLoan } = await supabase.from("loans").select("outstanding, status").eq("id", linkedLoanId).single();
            if (hpLoan) {
              const newOut = Math.max(0, Number(hpLoan.outstanding) - Number(amount));
              await supabase.from("loans").update({ outstanding: newOut, status: newOut <= 0 ? "completed" : hpLoan.status, last_payment_date: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", linkedLoanId);
            }
          }
        }
      }

      // 6. Record collection
      await supabase.from("collections").insert({
        collector_id: collectorId, collector_name: collectorName,
        customer_id: customerId, customer_name: customerName,
        account_id: accountId, amount: Number(amount),
        notes: notes || null, payment_type: paymentType,
        loan_id: paymentType === "loan" ? loanId : null,
        hp_agreement_id: paymentType === "hp" ? hpAgreementId : null,
        status: "completed",
      });

      // 7. Update collector total
      const { data: col } = await supabase.from("collectors").select("total_collected").eq("id", collectorId).single();
      if (col) await supabase.from("collectors").update({ total_collected: Number(col.total_collected || 0) + Number(amount), updated_at: new Date().toISOString() }).eq("id", collectorId);

      // 8. Notify customer
      if (acc.customer_id) {
        await supabase.from("notifications").insert({
          user_id: acc.customer_id,
          title: `💰 ${paymentType === "savings" ? "Savings Deposit" : paymentType === "loan" ? "Loan Repayment" : "HP Repayment"} – ${GHS(amount)}`,
          message: `${notes || "Collection payment"} on account. New balance: ${GHS(newBalance)}.`,
          type: "success", entity: "transaction", read: false,
        });
      }
      break;
    }

    case "account_request": {
      await supabase.from("pending_approvals").insert(op.data);
      break;
    }

    default:
      throw new Error(`Unknown operation type: ${op.type}`);
  }
}
