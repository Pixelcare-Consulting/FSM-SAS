const dateFnsFormat = require('date-fns/format');

const format =
  dateFnsFormat?.default ||
  dateFnsFormat?.format ||
  dateFnsFormat;

function parseNotificationDate(timestamp) {
  if (!timestamp) return null;

  if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
    try {
      return timestamp.toDate();
    } catch (error) {
      console.error('Error converting Firestore timestamp:', error);
      return null;
    }
  }

  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    return new Date(timestamp);
  }

  if (timestamp instanceof Date) {
    return timestamp;
  }

  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }

  return null;
}

function formatNotificationTime(timestamp) {
  try {
    const dateToFormat = parseNotificationDate(timestamp);

    if (!dateToFormat) {
      return 'Date unavailable';
    }

    if (Number.isNaN(dateToFormat.getTime())) {
      console.error('Invalid notification timestamp:', timestamp);
      return 'Invalid date';
    }

    return format(dateToFormat, 'MMM d, yyyy h:mm a');
  } catch (error) {
    console.error('Error in formatNotificationTime:', error);
    console.error('Problematic timestamp:', timestamp);
    return 'Date error';
  }
}

module.exports = {
  formatNotificationTime,
  parseNotificationDate,
};
