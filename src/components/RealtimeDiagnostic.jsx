import React, { useState, useEffect } from 'react';
import { supabase } from '../core/supabase';
import { Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

/**
 * Realtime Diagnostic Component
 * 
 * Add this to your Dashboard or any page to test if Supabase Realtime is working.
 * 
 * Usage:
 * import RealtimeDiagnostic from '../components/RealtimeDiagnostic';
 * 
 * Then add <RealtimeDiagnostic /> anywhere in your component
 */
export default function RealtimeDiagnostic() {
  const [status, setStatus] = useState('connecting');
  const [events, setEvents] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const channel = supabase.channel('diagnostic-' + Date.now());

    // Subscribe to transactions table changes
    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions'
      }, (payload) => {
        const event = {
          time: new Date().toLocaleTimeString(),
          type: payload.eventType,
          table: 'transactions',
          id: payload.new?.id || payload.old?.id,
        };
        setEvents(prev => [event, ...prev].slice(0, 10));
        setLastUpdate(new Date());
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'accounts'
      }, (payload) => {
        const event = {
          time: new Date().toLocaleTimeString(),
          type: payload.eventType,
          table: 'accounts',
          id: payload.new?.id || payload.old?.id,
        };
        setEvents(prev => [event, ...prev].slice(0, 10));
        setLastUpdate(new Date());
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'collections'
      }, (payload) => {
        const event = {
          time: new Date().toLocaleTimeString(),
          type: payload.eventType,
          table: 'collections',
          id: payload.new?.id || payload.old?.id,
        };
        setEvents(prev => [event, ...prev].slice(0, 10));
        setLastUpdate(new Date());
      })
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        setStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'SUBSCRIBED':
        return <CheckCircle size={16} style={{ color: 'var(--green)' }} />;
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
      case 'CLOSED':
        return <XCircle size={16} style={{ color: 'var(--red)' }} />;
      default:
        return <Activity size={16} style={{ color: 'var(--yellow)' }} />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'SUBSCRIBED':
        return 'var(--green)';
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
      case 'CLOSED':
        return 'var(--red)';
      default:
        return 'var(--yellow)';
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${getStatusColor()}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {getStatusIcon()}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Realtime Status</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {status === 'SUBSCRIBED' ? '✅ Connected' : `⚠️ ${status}`}
            </div>
          </div>
        </div>
        {lastUpdate && (
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Last event: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </div>

      {status !== 'SUBSCRIBED' && (
        <div className="alert alert-warning" style={{ fontSize: 12, marginBottom: 12 }}>
          <AlertCircle size={13} />
          <div>
            <strong>Realtime not connected.</strong> Changes from collector app may take up to 5 seconds to appear (polling fallback).
            <br />
            Check: 1) Run supabase/enable_realtime.sql, 2) Verify anon key, 3) Check browser console for errors
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>
            Recent Events ({events.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {events.map((event, i) => (
              <div key={i} style={{
                fontSize: 11,
                padding: '6px 10px',
                background: 'var(--surface-2)',
                borderRadius: 6,
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'monospace'
              }}>
                <span style={{ color: 'var(--text-3)' }}>{event.time}</span>
                <span style={{ color: 'var(--brand)', fontWeight: 600 }}>{event.table}</span>
                <span style={{ color: event.type === 'INSERT' ? 'var(--green)' : event.type === 'UPDATE' ? 'var(--yellow)' : 'var(--red)' }}>
                  {event.type}
                </span>
                <span style={{ color: 'var(--text-2)' }}>ID: {event.id?.slice(0, 8)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {events.length === 0 && status === 'SUBSCRIBED' && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: 12 }}>
          Listening for changes... Make a transaction in the collector app to test.
        </div>
      )}
    </div>
  );
}
