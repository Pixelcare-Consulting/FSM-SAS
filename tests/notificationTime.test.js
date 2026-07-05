const assert = require('assert');

const { formatNotificationTime } = require('../utils/notificationTime');

const isoTimestamp = '2025-01-15T02:30:00.000Z';
const formattedIsoTimestamp = formatNotificationTime(isoTimestamp);

assert.notStrictEqual(formattedIsoTimestamp, 'Date unavailable');
assert.notStrictEqual(formattedIsoTimestamp, 'Invalid date');
assert.match(formattedIsoTimestamp, /2025/);

const unsupportedTimestamp = { unexpected: 'shape' };

assert.strictEqual(formatNotificationTime(unsupportedTimestamp), 'Date unavailable');

console.log('notificationTime tests passed');
