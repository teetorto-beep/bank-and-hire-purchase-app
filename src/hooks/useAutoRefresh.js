import { useEffect, useRef } from 'react';

/**
 * Custom hook for aggressive auto-refresh
 * Refreshes data every 2 seconds and when tab becomes visible
 */
export function useAutoRefresh(refreshFn, interval = 2000) {
  const refreshFnRef = useRef(refreshFn);

  // Keep ref updated
  useEffect(() => {
    refreshFnRef.current = refreshFn;
  }, [refreshFn]);

  // Polling interval
  useEffect(() => {
    const id = setInterval(() => {
      refreshFnRef.current();
    }, interval);
    return () => clearInterval(id);
  }, [interval]);

  // Refresh when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshFnRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Refresh when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      refreshFnRef.current();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);
}
