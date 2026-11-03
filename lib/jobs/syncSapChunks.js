/**
 * Client helpers for the Sync to SAP modal (jobs list).
 * The run is planned once, then sent as small batches. The server stops each
 * batch on a time budget and hands back the jobs it didn't start, which go
 * back on the queue.
 */

/**
 * Ticks in the "Already in SAP" picker. `ids` are the ticked jobs, or after
 * "Select all" (allInRange) the unticked ones. The picker lists only the newest
 * 1,000, so "Select all" has to mean every synced job in the range, not the
 * listed ids.
 */
export const EMPTY_SYNCED_SELECTION = Object.freeze({ allInRange: false, ids: [] });

export function isSyncedJobSelected({ allInRange, ids }, id) {
  return allInRange ? !ids.includes(id) : ids.includes(id);
}

/** Tick (checked) or untick these jobs. */
export function setSyncedJobsSelected(selection, jobIds, checked) {
  const addToIds = selection.allInRange ? !checked : checked;
  const ids = addToIds
    ? [...new Set([...selection.ids, ...jobIds])]
    : selection.ids.filter((id) => !jobIds.includes(id));
  return { allInRange: selection.allInRange, ids };
}

/** "Select all" without a search: every synced job in the range, or nothing. */
export function selectAllSyncedInRange(checked) {
  return checked ? { allInRange: true, ids: [] } : EMPTY_SYNCED_SELECTION;
}

export function syncedSelectionCount({ allInRange, ids }, syncedInRange) {
  return allInRange ? Math.max(0, syncedInRange - ids.length) : ids.length;
}

/** Request fields for the plan: ticked ids, or the unticked ids to exclude from the range. */
export function syncedSelectionPayload({ allInRange, ids }) {
  return allInRange ? { excludedSyncedJobIds: ids } : { syncedJobIds: ids };
}

/** Jobs per request; the server's time budget decides how many actually run. Cap: MAX_SYNC_CHUNK_SIZE (50). */
export const SYNC_CHUNK_SIZE = 25;

/** Consecutive batches that finish no job before the run gives up (SAP down or session expired). */
export const MAX_STALLED_SYNC_BATCHES = 2;

/**
 * What to resend after one batch's stream ends. `done` and `error` are sent
 * once the server has finished with the batch, so jobs it never finished are
 * safe to queue again. A stream that ends with neither was cut off: the server
 * may still be syncing those jobs, and resending them could create a job's
 * SAP Activity twice.
 * @param {{ ids: string[], settledIds: Set<string>, done?: Object|null, error?: string|null }} batch
 * @returns {{ requeueIds: string[] } | { cutOff: true }}
 */
export function chunkOutcome({ ids, settledIds, done = null, error = null }) {
  if (done) return { requeueIds: Array.isArray(done.unprocessedIds) ? done.unprocessedIds : [] };
  if (error) return { requeueIds: ids.filter((id) => !settledIds.has(id)) };
  return { cutOff: true };
}

/**
 * Read a `text/event-stream` response, calling onEvent for each `data:` JSON
 * line. Resolves when the stream ends; malformed lines are skipped.
 */
export async function readSseEvents(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      onEvent(event);
    }
  }
}
