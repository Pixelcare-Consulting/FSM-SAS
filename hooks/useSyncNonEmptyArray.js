import { useEffect } from 'react';

/**
 * Sync a non-empty array from a query result into local state.
 * Skips empty arrays so prior local state is preserved.
 */
const useSyncNonEmptyArray = (data, setState) => {
  useEffect(() => {
    if (Array.isArray(data) && data.length > 0) {
      setState(data);
    }
  }, [data, setState]);
};

export default useSyncNonEmptyArray;
