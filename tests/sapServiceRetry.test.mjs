import assert from 'node:assert/strict';
import sapService from '../lib/services/sapService.js';

assert.equal(sapService.isRetryableSapError(new Error('SAP Service Layer request timeout')), true);
assert.equal(sapService.isRetryableSapError(new Error('SAP API Error: 503 Service Unavailable - busy')), true);
assert.equal(sapService.isRetryableSapError({ name: 'TimeoutError', message: 'The operation was aborted' }), true);
assert.equal(sapService.isRetryableSapError(new Error('SAP API Error: 400 Bad Request - invalid CardCode')), false);
assert.equal(sapService.isRetryableSapError(new Error('SAP API Error: 401 Unauthorized')), false);

assert.ok(sapService.defaultTimeout >= 90000, 'read timeout should be at least 90s');
assert.ok(sapService.writeTimeout >= 120000, 'write timeout should be at least 120s');

console.log('sapServiceRetry.test.mjs: ok');
