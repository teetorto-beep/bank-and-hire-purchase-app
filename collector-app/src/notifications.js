import { supabase } from './supabase';

// Subscribe to notifications — filter client-side (server filter needs auth session)
export function subscribeToNotifications(collectorId, onNew) {
  const channel = supabase
    .channel(`notifs-${collectorId}-${Date.now()}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
    }, (payload) => {
      const n = payload.new;
      if (n && n.user_id === collectorId) onNew(n);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Subscribe to pending_approvals status changes — filter client-side
export function subscribeToApprovals(collectorId, onUpdate) {
  const channel = supabase
    .channel(`approvals-${collectorId}-${Date.now()}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'pending_approvals',
    }, (payload) => {
      const row = payload.new;
      if (!row || row.submitted_by !== collectorId) return;
      if (row.status === 'approved' || row.status === 'rejected') onUpdate(row);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Subscribe to new collections — filter client-side
export function subscribeToCollections(collectorId, onNew) {
  const channel = supabase
    .channel(`cols-${collectorId}-${Date.now()}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'collections',
    }, (payload) => {
      const c = payload.new;
      if (c && c.collector_id === collectorId) onNew(c);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}
