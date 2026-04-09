import React, { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * Shows a small indicator when data is being auto-refreshed
 * Helps users know the app is actively syncing
 */
export default function AutoRefreshIndicator({ lastRefresh }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (lastRefresh) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [lastRefresh]);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      background: 'var(--brand)',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 9999,
      animation: 'fadeIn 0.2s',
    }}>
      <RotateCcw size={14} style={{ animation: 'spin 0.6s linear' }} />
      Syncing...
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
