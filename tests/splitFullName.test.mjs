import assert from 'node:assert/strict';

import { splitFullName } from '../utils/technicianDisplayName.js';

const empty = { firstName: '', middleName: '', lastName: '' };

// SAP-imported technicians only have full_name.
assert.deepEqual(splitFullName('C6 Kumar .'), { firstName: 'C6', middleName: 'Kumar', lastName: '.' });
assert.deepEqual(splitFullName('Y3 Teik Leong Lian'), { firstName: 'Y3', middleName: 'Teik Leong', lastName: 'Lian' });
assert.deepEqual(splitFullName('A2 Mazlan'), { firstName: 'A2', middleName: '', lastName: 'Mazlan' });
assert.deepEqual(splitFullName('  C6 MV  SANTHOSH . '), { firstName: 'C6', middleName: 'MV SANTHOSH', lastName: '.' });
// One word: no last name to guess.
assert.deepEqual(splitFullName('Unassign1'), { firstName: 'Unassign1', middleName: '', lastName: '' });
assert.deepEqual(splitFullName(''), empty);
assert.deepEqual(splitFullName(null), empty);
assert.deepEqual(splitFullName(undefined), empty);

console.log('splitFullName tests passed');
