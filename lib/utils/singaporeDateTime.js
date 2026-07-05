export const APP_TIMEZONE = 'Asia/Singapore';

const SINGAPORE_UTC_OFFSET_HOURS = 8;

function parseDateParts(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error('A valid YYYY-MM-DD date string is required');
  }

  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date format: ${dateString}`);
  }

  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
  };
}

export function buildSingaporeDateTimeUtc(dateString, hour = 0, minute = 0) {
  const { year, month, day } = parseDateParts(dateString);

  return new Date(
    Date.UTC(year, month - 1, day, hour - SINGAPORE_UTC_OFFSET_HOURS, minute, 0, 0)
  );
}

export function getSingaporeUtcDayRange(dateString) {
  return {
    start: buildSingaporeDateTimeUtc(dateString, 0, 0),
    end: buildSingaporeDateTimeUtc(dateString, 23, 59),
  };
}

export function parseSingaporeTimeHm(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    throw new Error('A valid HH:MM time string is required');
  }

  const normalized = timeStr.trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time values: ${timeStr}`);
  }

  return { hour, minute };
}

export function buildSingaporeDateTimeFromForm(dateYmd, timeHm) {
  if (!dateYmd || !timeHm) return null;
  try {
    const { hour, minute } = parseSingaporeTimeHm(timeHm);
    return buildSingaporeDateTimeUtc(dateYmd, hour, minute);
  } catch (error) {
    console.warn(error.message);
    return null;
  }
}

function toValidDate(iso) {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function toSingaporeYmd(iso) {
  const date = toValidDate(iso);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(date);
}

export function toSingaporeTimeHm(iso) {
  const date = toValidDate(iso);
  if (!date) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/** Alias used by UI formatters */
export const formatSingaporeTimeHm = toSingaporeTimeHm;

export function getSingaporeCalendarParts(iso) {
  const date = toValidDate(iso);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(date);

  return {
    monthShort: parts.find((part) => part.type === 'month')?.value ?? '',
    day: parts.find((part) => part.type === 'day')?.value ?? '',
    year: parts.find((part) => part.type === 'year')?.value ?? '',
  };
}

export function formatSingaporeDate(iso) {
  const date = toValidDate(iso);
  if (!date) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);

  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  return `${day}/${month}/${year}`;
}

export function formatSingaporeTime(iso, { hour12 = false } = {}) {
  const date = toValidDate(iso);
  if (!date) return '';

  return date.toLocaleTimeString('en-US', {
    timeZone: APP_TIMEZONE,
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  });
}

export function formatSingaporeDateWithTime(iso) {
  const dateStr = formatSingaporeDate(iso);
  if (!dateStr) return '';
  const timeStr = formatSingaporeTime(iso, { hour12: true }).toLowerCase();
  return `${dateStr} - ${timeStr}`;
}

export function formatSingaporeDateRange(startIso, endIso, { hour12 = false } = {}) {
  if (!startIso && !endIso) return 'N/A';

  const startDate = formatSingaporeDate(startIso);
  const endDate = formatSingaporeDate(endIso);
  const startTime = formatSingaporeTime(startIso, { hour12 });
  const endTime = formatSingaporeTime(endIso, { hour12 });

  if (startDate === endDate && startTime && endTime) {
    return `${startDate} ${startTime}-${endTime}`;
  }
  if (startDate === endDate) {
    return startDate || 'N/A';
  }
  if (startTime && endTime) {
    return `${startDate} ${startTime}-${endDate} ${endTime}`;
  }
  return `${startDate || 'N/A'} - ${endDate || 'N/A'}`;
}

export function formatSingaporeScheduledRange(startIso, endIso) {
  if (!startIso) return '';

  const start = toValidDate(startIso);
  if (!start) return '';

  const day = start.toLocaleDateString('en-US', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = formatSingaporeTime(startIso, { hour12: true });

  if (endIso) {
    const end = toValidDate(endIso);
    if (end) {
      const endTime = formatSingaporeTime(endIso, { hour12: true });
      return `${day} ${startTime} – ${endTime}`;
    }
  }

  return `${day} ${startTime}`;
}

export function formatSingaporeCompletedAt(date) {
  const validDate = toValidDate(date);
  if (!validDate) return '';

  const day = validDate.toLocaleDateString('en-US', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = formatSingaporeTime(validDate, { hour12: true });
  return `${day} at ${time}`;
}

export function formatSingaporeDatePart(date, pattern) {
  const validDate = toValidDate(date);
  if (!validDate) return null;

  if (pattern === 'yyyy-MM-dd') {
    return toSingaporeYmd(validDate);
  }

  if (pattern === 'HH:mm:ss') {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(validDate);

    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const second = parts.find((part) => part.type === 'second')?.value ?? '00';
    return `${hour}:${minute}:${second}`;
  }

  return null;
}
