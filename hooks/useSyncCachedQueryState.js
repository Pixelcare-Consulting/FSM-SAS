import { useEffect } from 'react';

/**
 * Sync React Query cached data + loading into local state.
 * @param {'falsy' | 'nullish'} missing - how to treat "no data yet" for loading
 *   - 'falsy': empty array / null / undefined still counts as missing (images/chat)
 *   - 'nullish': only null/undefined counts as missing (signatures; [] is loaded)
 */
const useSyncCachedQueryState = ({
  data,
  isLoading,
  setData,
  setIsLoading,
  missing = 'falsy',
}) => {
  useEffect(() => {
    if (data) {
      setData(data);
    }
    const isMissing = missing === 'nullish' ? data == null : !data;
    setIsLoading(isLoading && isMissing);
  }, [data, isLoading, setData, setIsLoading, missing]);
};

export default useSyncCachedQueryState;
