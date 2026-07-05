import assert from 'node:assert/strict';
import {
  extractAifmIdFromDescription,
  extractAifmPoFromDescription,
} from '../lib/integrations/aifmSapIdentifiers.js';

assert.equal(extractAifmIdFromDescription('[AIFM:219376]\nPO: 3004286'), '219376');
assert.equal(extractAifmPoFromDescription('[AIFM:219376]\nPO: 3004286\nNotes'), '3004286');
assert.equal(extractAifmPoFromDescription('no po here'), null);

console.log('aifmSapIdentifiers.test.mjs: ok');
