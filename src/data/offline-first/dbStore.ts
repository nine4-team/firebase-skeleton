/**
 * Database initialization state management
 * Part of Milestone A: Local DB Foundation
 */

import { useState, useEffect, useCallback } from 'react';
import { initializeDatabase, isDatabaseInitialized } from './db';

export interface DatabaseState {
  isInitialized: boolean;
  isInitializing: boolean;
  error: Error | null;
}

/**
 * Hook to manage database initialization
 * Call this at app startup
 */
export function useDatabaseInit(): DatabaseState & {
  retry: () => Promise<void>;
} {
  const [state, setState] = useState<DatabaseState>({
    isInitialized: false,
    isInitializing: true,
    error: null,
  });

  const init = useCallback(async () => {
    setState((prev) => ({ ...prev, isInitializing: true, error: null }));

    try {
      // Check if already initialized
      if (isDatabaseInitialized()) {
        setState({
          isInitialized: true,
          isInitializing: false,
          error: null,
        });
        return;
      }

      await initializeDatabase();

      setState({
        isInitialized: true,
        isInitializing: false,
        error: null,
      });
    } catch (error) {
      const dbError = error instanceof Error ? error : new Error(String(error));
      setState({
        isInitialized: false,
        isInitializing: false,
        error: dbError,
      });
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  return {
    ...state,
    retry: init,
  };
}
