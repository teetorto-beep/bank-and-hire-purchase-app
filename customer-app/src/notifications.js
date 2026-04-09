/**
 * Notifications — gracefully degrades if expo-notifications is not available.
 * In Expo Go or when the native module isn't built, all push functions are no-ops.
 * In-app alerts still work via Supabase Realtime regardless.
 */
import { Platform } from "react-native";
import { supabase } from "./supabase";

// ── Lazy-load expo-notifications so a missing native module never crashes ─────
let Notifications = null;
let Device = null;
try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");
} catch (_) {
  // expo-notifications not available (Expo Go, missing native build, etc.)
}

// Set foreground handler only if the module loaded
if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (_) {}
}

// ── Request permission + get Expo push token ──────────────────────────────────
export async function registerPushToken(customerId) {
  if (!Notifications || !Device) return null;
  if (!Device.isDevice) return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Account Alerts",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#2563eb",
        sound: true,
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (token && customerId) {
      await supabase.from("customers").update({ push_token: token }).eq("id", customerId);
    }
    return token;
  } catch (_) {
    return null;
  }
}

// ── Show a local OS notification immediately ──────────────────────────────────
export async function showLocalNotification(title, body, data = {}) {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null,
    });
  } catch (_) {}
}

// ── Subscribe to Supabase realtime → fire OS notification ────────────────────
export function subscribeToNotifications(customerId, onNew) {
  const channel = supabase
    .channel(`cust-notifs-${customerId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => {
        const n = payload.new;
        if (!n || n.user_id !== customerId) return;
        showLocalNotification(n.title, n.message, { notificationId: n.id });
        onNew?.(n);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ── Other subscriptions ───────────────────────────────────────────────────────
export function subscribeToTransactions(accountIds, onNew) {
  if (!accountIds || accountIds.length === 0) return () => {};
  const channel = supabase
    .channel(`cust-txns-${accountIds[0]}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" },
      (payload) => {
        const t = payload.new;
        if (!t || !accountIds.includes(t.account_id)) return;
        onNew?.(t);
      })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToLoanUpdates(customerId, onUpdate) {
  const channel = supabase
    .channel(`cust-loans-${customerId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "loans" },
      (payload) => {
        if (payload.new?.customer_id === customerId) onUpdate?.(payload.new);
      })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToCollections(customerId, onNew) {
  const channel = supabase
    .channel(`cust-collections-${customerId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "collections" },
      (payload) => {
        if (payload.new?.customer_id === customerId) onNew?.(payload.new);
      })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Insert a notification row ─────────────────────────────────────────────────
export async function sendNotification(customerId, title, message, type = "info") {
  await supabase.from("notifications").insert({
    user_id: customerId, title, message, type, read: false,
  });
}

// ── Loan due alerts on app open ───────────────────────────────────────────────
export async function checkAndNotifyLoansDue(customerId) {
  const { data: loans } = await supabase
    .from("loans")
    .select("id, type, monthly_payment, status, next_due_date")
    .eq("customer_id", customerId)
    .in("status", ["active", "overdue"]);

  if (!loans || loans.length === 0) return;

  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  for (const loan of loans) {
    const name = (loan.type || "Loan").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const amt  = `GH₵ ${Number(loan.monthly_payment || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;

    if (loan.status === "overdue") {
      await sendNotification(customerId, "⚠️ Overdue Loan Payment",
        `Your ${name} payment of ${amt} is overdue. Please pay immediately.`, "error");
      continue;
    }
    if (!loan.next_due_date) continue;
    const due = new Date(loan.next_due_date); due.setHours(0, 0, 0, 0);
    if (due.getTime() === today.getTime()) {
      await sendNotification(customerId, "🔴 Loan Payment Due Today",
        `Your ${name} payment of ${amt} is due today.`, "warning");
    } else if (due.getTime() === tomorrow.getTime()) {
      await sendNotification(customerId, "⏰ Loan Payment Due Tomorrow",
        `Your ${name} payment of ${amt} is due tomorrow.`, "info");
    }
  }
}
