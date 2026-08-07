import { useEffect } from 'react';

/**
 * Sync customer address detail maps from a query payload into local state.
 * Clears both maps when customerCode is absent.
 */
const useSyncCustomerAddressDetails = ({
  customerCode,
  payload,
  setByCode,
  setByLocationId,
}) => {
  useEffect(() => {
    if (!customerCode) {
      setByCode({});
      setByLocationId({});
      return;
    }
    if (payload) {
      setByCode(payload.data || {});
      setByLocationId(payload.dataByCustomerLocationId || {});
    }
  }, [customerCode, payload, setByCode, setByLocationId]);
};

export default useSyncCustomerAddressDetails;
