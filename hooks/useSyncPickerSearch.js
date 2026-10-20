import { useEffect, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 300;
const IDLE = Object.freeze({ loading: false, jobs: null, total: 0, truncated: false, error: null });

/**
 * Server-side search for one Sync-to-SAP picker list ('synced' | 'unsynced').
 * Searching in the browser only covered the newest picker-limit rows, so older
 * jobs in range could never be found. `jobs` stays null while the search box
 * is empty, so the caller falls back to the preview list.
 */
export function useSyncPickerSearch({ list, search, dateFrom, dateTo, enabled }) {
  const term = String(search ?? '').trim();
  const active = Boolean(enabled && term);
  // Identifies the request a stored result belongs to, so a stale result is
  // never shown for the current search / range.
  const requestKey = active ? JSON.stringify([list, term, dateFrom ?? null, dateTo ?? null]) : null;
  const [result, setResult] = useState({ key: null, ...IDLE });

  useEffect(() => {
    if (!requestKey) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const payload = { picker: list, search: term };
        if (dateFrom) payload.dateFrom = dateFrom;
        if (dateTo) payload.dateTo = dateTo;

        const res = await fetch('/api/jobs/sync-hourly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Job search failed');

        setResult({
          key: requestKey,
          loading: false,
          jobs: Array.isArray(data.jobs) ? data.jobs : [],
          total: data.total ?? 0,
          truncated: data.truncated === true,
          error: null,
        });
      } catch (e) {
        if (e?.name === 'AbortError') return;
        setResult({ key: requestKey, ...IDLE, jobs: [], error: e?.message || 'Job search failed' });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, list, term, dateFrom, dateTo]);

  if (!active) return IDLE;
  if (result.key !== requestKey) return { ...IDLE, jobs: [], loading: true };
  return result;
}
