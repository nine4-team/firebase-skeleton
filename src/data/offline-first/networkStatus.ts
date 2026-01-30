/**
 * Network status tracking
 * Part of Milestone B: Outbox MVP
 */

import { useEffect, useState } from 'react';

/**
 * Simple network status tracker
 * Uses navigator.onLine as a fallback
 * In a real app, you might want to use @react-native-community/netinfo
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true; // Assume online if we can't detect
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}

/**
 * Subscribe to network status changes
 */
export function subscribeNetworkStatus(callback: (isOnline: boolean) => void): () => void {
  callback(getNetworkStatus());

  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Get current network status (synchronous)
 */
export function getNetworkStatus(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true; // Assume online if we can't detect
}
