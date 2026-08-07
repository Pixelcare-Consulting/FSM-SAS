import { useEffect } from 'react';
import toast from 'react-hot-toast';

/**
 * Show a toast once when a query error becomes truthy.
 * Pass a stable getMessage (module-level or useCallback) so the effect
 * only re-runs when `error` changes.
 * @param {unknown} error
 * @param {(error: unknown) => string} getMessage
 */
const useToastOnQueryError = (error, getMessage) => {
  useEffect(() => {
    if (error) {
      toast.error(getMessage(error));
    }
  }, [error, getMessage]);
};

export default useToastOnQueryError;
