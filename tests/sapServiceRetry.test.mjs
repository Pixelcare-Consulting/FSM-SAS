import assert from 'node:assert/strict';
import sapService from '../lib/services/sapService.js';

assert.equal(sapService.isRetryableSapError(new Error('SAP Service Layer request timeout')), true);
assert.equal(sapService.isRetryableSapError(new Error('SAP API Error: 503 Service Unavailable - busy')), true);
assert.equal(sapService.isRetryableSapError({ name: 'TimeoutError', message: 'The operation was aborted' }), true);
assert.equal(sapService.isRetryableSapError(new Error('SAP API Error: 400 Bad Request - invalid CardCode')), false);
assert.equal(sapService.isRetryableSapError(new Error('SAP API Error: 401 Unauthorized')), false);

assert.ok(sapService.defaultTimeout >= 90000, 'read timeout should be at least 90s');
assert.ok(sapService.writeTimeout >= 120000, 'write timeout should be at least 120s');

// withDeadline: every SAP request in the call chain ends by the deadline.
{
  const cookies = { b1session: 's', routeid: 'r' };
  const original = sapService._makeRequestOnce;
  const originalDelay = sapService.sapRetryDelayMs;
  const seen = [];
  let fail = false;
  sapService._makeRequestOnce = async (endpoint, options) => {
    seen.push({ endpoint, timeout: options.timeout });
    if (fail) throw new Error('SAP Service Layer request timeout');
    return { ok: true };
  };

  try {
    // Timeout is clamped to the time left, through nested awaits.
    await sapService.withDeadline(Date.now() + 10_000, async () => {
      await Promise.resolve();
      await sapService.makeRequest('A', {}, cookies);
    });
    assert.ok(seen[0].timeout <= 10_000 && seen[0].timeout > 9_000, `clamped timeout, got ${seen[0].timeout}`);

    // A shorter explicit timeout is kept.
    seen.length = 0;
    await sapService.withDeadline(Date.now() + 60_000, () => sapService.makeRequest('B', { timeout: 5_000 }, cookies));
    assert.equal(seen[0].timeout, 5_000);

    // Nothing is sent once the deadline has passed.
    seen.length = 0;
    await assert.rejects(
      sapService.withDeadline(Date.now() - 1, () => sapService.makeRequest('C', {}, cookies)),
      /time limit/
    );
    assert.equal(seen.length, 0);

    // No retry when the backoff would run past the deadline...
    fail = true;
    seen.length = 0;
    sapService.sapRetryDelayMs = () => 5_000;
    await assert.rejects(
      sapService.withDeadline(Date.now() + 1_000, () => sapService.makeRequest('D', {}, cookies)),
      /request timeout/
    );
    assert.equal(seen.length, 1);

    // ...but retries still run when there is time (GET: 1 + 3 retries).
    seen.length = 0;
    sapService.sapRetryDelayMs = () => 0;
    await assert.rejects(sapService.withDeadline(Date.now() + 10_000, () => sapService.makeRequest('E', {}, cookies)));
    assert.equal(seen.length, 4);
    fail = false;

    // Concurrent scopes keep their own deadline (Fluid Compute shares this singleton).
    seen.length = 0;
    await Promise.all([
      sapService.withDeadline(Date.now() + 20_000, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await sapService.makeRequest('LONG', {}, cookies);
      }),
      sapService.withDeadline(Date.now() + 2_000, () => sapService.makeRequest('SHORT', {}, cookies)),
    ]);
    const byEndpoint = Object.fromEntries(seen.map((c) => [c.endpoint, c.timeout]));
    assert.ok(byEndpoint.LONG > 19_000, `LONG kept its own deadline, got ${byEndpoint.LONG}`);
    assert.ok(byEndpoint.SHORT <= 2_000, `SHORT kept its own deadline, got ${byEndpoint.SHORT}`);

    // No deadline outside a scope.
    seen.length = 0;
    await sapService.makeRequest('F', {}, cookies);
    assert.equal(seen[0].timeout, sapService.defaultTimeout);
  } finally {
    sapService._makeRequestOnce = original;
    sapService.sapRetryDelayMs = originalDelay;
  }
}

console.log('sapServiceRetry.test.mjs: ok');
