/**
 * Client helpers for the chunked Sync to SAP run (jobs list modal).
 * The run is planned once, then sent as small batches. The server stops each
 * batch on a time budget and hands back the jobs it didn't start, which go
 * back on the queue.
 */

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
