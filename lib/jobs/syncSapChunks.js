/**
 * Client helpers for the chunked Sync to SAP run (jobs list modal).
 * The run is planned once, then sent as small batches so no single request
 * reaches the serverless function time limit.
 */

/** Jobs per request. ~25 × 4.5s / 2 workers ≈ 1 min; server cap is MAX_SYNC_CHUNK_SIZE (50). */
export const SYNC_CHUNK_SIZE = 25;

export function chunkArray(items, size = SYNC_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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
