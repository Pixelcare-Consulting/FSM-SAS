import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { getWorkerViewPath } from '../utils/workerRoutes.js';

assert.equal(
  getWorkerViewPath('953b855e-fdda-40d4-b0d1-728ca4d4aca5'),
  '/dashboard/workers/view/953b855e-fdda-40d4-b0d1-728ca4d4aca5'
);

assert.equal(
  getWorkerViewPath('953b855e-fdda-40d4-b0d1-728ca4d4aca5', { tab: 'schedule' }),
  '/dashboard/workers/view/953b855e-fdda-40d4-b0d1-728ca4d4aca5?tab=schedule'
);

assert.equal(
  getWorkerViewPath('953b855e-fdda-40d4-b0d1-728ca4d4aca5', { tab: 'schedule' }),
  '/dashboard/workers/view/953b855e-fdda-40d4-b0d1-728ca4d4aca5?tab=schedule'
);

const legacyWorkerViewPage = new URL('../pages/workers/view/[id].js', import.meta.url);
assert.equal(existsSync(legacyWorkerViewPage), true);

console.log('workerRoutes tests passed');
