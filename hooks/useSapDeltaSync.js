import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

const DEFAULT_TOAST_STYLES = {
  BASE: {
    borderRadius: '12px',
    padding: '12px 16px',
    fontSize: '14px',
    maxWidth: '400px',
  },
  SUCCESS: {
    background: '#f0fdf4',
    color: '#166534',
    border: '1px solid #bbf7d0',
  },
  ERROR: {
    background: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
  },
  LOADING: {
    background: '#eff6ff',
    color: '#1e40af',
    border: '1px solid #bfdbfe',
  },
};

/**
 * Two-step SAP delta sync: preview modal → confirm → POST sync-delta.
 *
 * @param {{
 *   toastStyles?: typeof DEFAULT_TOAST_STYLES,
 *   onSyncSuccess?: (payload: { summary: object, normalizedCode: string }) => Promise<void> | void,
 * }} options
 */
export function useSapDeltaSync({ toastStyles = DEFAULT_TOAST_STYLES, onSyncSuccess } = {}) {
  const [syncCode, setSyncCode] = useState('');
  const [isSyncingDelta, setIsSyncingDelta] = useState(false);
  const [syncDeltaError, setSyncDeltaError] = useState('');
  const [syncDeltaSummary, setSyncDeltaSummary] = useState(null);
  const [previewModal, setPreviewModal] = useState({
    show: false,
    loading: false,
    preview: null,
    error: null,
    pendingCode: '',
  });

  const closePreviewModal = useCallback(() => {
    setPreviewModal((prev) => ({
      ...prev,
      show: false,
      loading: false,
      preview: null,
      error: null,
      pendingCode: '',
    }));
  }, []);

  const runActualSync = useCallback(
    async (normalizedCode) => {
      setIsSyncingDelta(true);
      setSyncDeltaError('');
      setSyncDeltaSummary(null);

      const loadingMessage = normalizedCode
        ? `Syncing SAP delta for ${normalizedCode}...`
        : 'Syncing SAP delta...';
      const loadingToastId = toast.loading(loadingMessage, {
        style: {
          ...toastStyles.BASE,
          ...toastStyles.LOADING,
        },
      });

      const SYNC_TIMEOUT_MS = normalizedCode ? 120_000 : 300_000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

      const requestBody = {};
      if (normalizedCode) requestBody.customerCode = normalizedCode;

      try {
        const response = await fetch('/api/customers/sync-delta', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || `Sync failed with HTTP ${response.status}`);
        }

        const summary = payload.summary || {};
        setSyncDeltaSummary(summary);
        closePreviewModal();

        if (onSyncSuccess) {
          await onSyncSuccess({ summary, normalizedCode, loadingToastId });
        }

        return { summary, payload };
      } catch (error) {
        const message =
          error?.name === 'AbortError'
            ? 'Sync timed out. Retry in a moment; if SAP is slow, check SAP_B1_* env and Service Layer connectivity.'
            : error?.message || 'Failed to sync from SAP';
        setSyncDeltaError(message);
        toast.error(message, {
          id: loadingToastId,
          style: {
            ...toastStyles.BASE,
            ...toastStyles.ERROR,
          },
        });
        throw error;
      } finally {
        clearTimeout(timeoutId);
        setIsSyncingDelta(false);
      }
    },
    [closePreviewModal, onSyncSuccess, toastStyles]
  );

  const fetchPreview = useCallback(async (normalizedCode) => {
    const requestBody = { preview: true };
    if (normalizedCode) requestBody.customerCode = normalizedCode;

    const response = await fetch('/api/customers/sync-delta', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `Preview failed with HTTP ${response.status}`);
    }

    return payload.preview || payload.summary;
  }, []);

  const openSyncPreview = useCallback(async () => {
    if (isSyncingDelta) return;

    const normalizedCode = String(syncCode || '').trim().toUpperCase();
    setSyncDeltaError('');
    setPreviewModal({
      show: true,
      loading: true,
      preview: null,
      error: null,
      pendingCode: normalizedCode,
    });

    try {
      const preview = await fetchPreview(normalizedCode);
      setPreviewModal((prev) => ({
        ...prev,
        loading: false,
        preview,
        error: null,
      }));
    } catch (error) {
      setPreviewModal((prev) => ({
        ...prev,
        loading: false,
        preview: null,
        error: error?.message || 'Failed to load SAP preview',
      }));
    }
  }, [fetchPreview, isSyncingDelta, syncCode]);

  const confirmSyncFromPreview = useCallback(async () => {
    const normalizedCode = previewModal.pendingCode || String(syncCode || '').trim().toUpperCase();
    await runActualSync(normalizedCode);
  }, [previewModal.pendingCode, runActualSync, syncCode]);

  return {
    syncCode,
    setSyncCode,
    isSyncingDelta,
    syncDeltaError,
    syncDeltaSummary,
    previewModal,
    openSyncPreview,
    closePreviewModal,
    confirmSyncFromPreview,
  };
}
