const { RRule } = require("rrule");

const MAX_OCCURRENCES = 52;

const RRULE_WEEKDAYS = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
];

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ORDINAL_LABELS = ["first", "second", "third", "fourth", "fifth"];

const FREQUENCY_UNITS = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

function parseRecurrenceStartDate(startDate) {
  if (!startDate || typeof startDate !== "string") {
    return null;
  }
  const match = startDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRecurrenceStartDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDefaultRecurrenceRule(startDate) {
  const anchor =
    startDate && parseRecurrenceStartDate(startDate)
      ? startDate.split("T")[0]
      : formatRecurrenceStartDate(new Date());
  const anchorDate = parseRecurrenceStartDate(anchor);

  return {
    isRepeat: true,
    frequency: "weekly",
    interval: 1,
    startDate: anchor,
    weekDays: anchorDate ? [anchorDate.getDay()] : [0],
    monthlyMode: "dayOfMonth",
    monthDay: anchorDate ? anchorDate.getDate() : 1,
    monthOrdinal: 1,
    monthWeekday: anchorDate ? anchorDate.getDay() : 0,
    endCount: MAX_OCCURRENCES,
  };
}

function normalizeRecurrenceRule(rule, fallbackStartDate) {
  if (!rule || typeof rule !== "object") {
    return getDefaultRecurrenceRule(fallbackStartDate);
  }

  const startDate =
    rule.startDate && parseRecurrenceStartDate(rule.startDate)
      ? rule.startDate.split("T")[0]
      : fallbackStartDate || formatRecurrenceStartDate(new Date());

  const anchorDate = parseRecurrenceStartDate(startDate);
  const monthlyMode =
    rule.monthlyMode === "dayOfWeek" ? "dayOfWeek" : "dayOfMonth";

  return {
    isRepeat: Boolean(rule.isRepeat),
    frequency: ["daily", "weekly", "monthly", "yearly"].includes(rule.frequency)
      ? rule.frequency
      : "weekly",
    interval: Math.max(1, parseInt(rule.interval, 10) || 1),
    startDate,
    weekDays: Array.isArray(rule.weekDays)
      ? [...new Set(rule.weekDays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))]
      : anchorDate
        ? [anchorDate.getDay()]
        : [],
    monthlyMode,
    monthDay: Math.min(
      31,
      Math.max(1, parseInt(rule.monthDay, 10) || (anchorDate ? anchorDate.getDate() : 1))
    ),
    monthOrdinal: Math.min(
      5,
      Math.max(1, parseInt(rule.monthOrdinal, 10) || 1)
    ),
    monthWeekday:
      rule.monthWeekday >= 0 && rule.monthWeekday <= 6
        ? Number(rule.monthWeekday)
        : anchorDate
          ? anchorDate.getDay()
          : 0,
    endCount: Math.min(
      MAX_OCCURRENCES,
      Math.max(1, parseInt(rule.endCount, 10) || MAX_OCCURRENCES)
    ),
  };
}

function validateRecurrenceRule(rule) {
  const errors = [];

  if (!rule?.isRepeat) {
    return { valid: true, errors };
  }

  if (!parseRecurrenceStartDate(rule.startDate)) {
    errors.push("A valid start date is required.");
  }

  const interval = parseInt(rule.interval, 10);
  if (!interval || interval < 1) {
    errors.push("Repeat interval must be at least 1.");
  }

  if (!["daily", "weekly", "monthly", "yearly"].includes(rule.frequency)) {
    errors.push("Select a valid repeat frequency.");
  }

  if (rule.endCount !== undefined && rule.endCount !== null) {
    const endCount = parseInt(rule.endCount, 10);
    if (!endCount || endCount < 1 || endCount > MAX_OCCURRENCES) {
      errors.push(`Occurrences must be between 1 and ${MAX_OCCURRENCES}.`);
    }
  }

  if (rule.frequency === "weekly" && (!rule.weekDays || rule.weekDays.length === 0)) {
    errors.push("Select at least one weekday for weekly repeats.");
  }

  if (rule.frequency === "monthly") {
    if (rule.monthlyMode === "dayOfWeek") {
      if (!rule.monthOrdinal || rule.monthOrdinal < 1 || rule.monthOrdinal > 5) {
        errors.push("Select a valid monthly ordinal (First through Fifth).");
      }
      if (rule.monthWeekday === undefined || rule.monthWeekday < 0 || rule.monthWeekday > 6) {
        errors.push("Select a valid weekday for monthly repeats.");
      }
    } else if (!rule.monthDay || rule.monthDay < 1 || rule.monthDay > 31) {
      errors.push("Day of month must be between 1 and 31.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function buildRRuleOptions(rule, maxOccurrences) {
  const dtstart = parseRecurrenceStartDate(rule.startDate);
  const interval = Math.max(1, parseInt(rule.interval, 10) || 1);

  const options = {
    dtstart,
    interval,
    count: maxOccurrences,
  };

  switch (rule.frequency) {
    case "daily":
      options.freq = RRule.DAILY;
      break;
    case "weekly":
      options.freq = RRule.WEEKLY;
      if (rule.weekDays?.length) {
        options.byweekday = rule.weekDays.map((day) => RRULE_WEEKDAYS[day]);
      }
      break;
    case "monthly":
      options.freq = RRule.MONTHLY;
      if (rule.monthlyMode === "dayOfWeek") {
        options.byweekday = [
          RRULE_WEEKDAYS[rule.monthWeekday].nth(rule.monthOrdinal),
        ];
      } else {
        options.bymonthday = rule.monthDay;
      }
      break;
    case "yearly":
      options.freq = RRule.YEARLY;
      break;
    default:
      break;
  }

  return options;
}

function generateOccurrenceDates(rule, { maxOccurrences = MAX_OCCURRENCES } = {}) {
  if (!rule?.isRepeat) {
    const single = parseRecurrenceStartDate(rule?.startDate);
    return single ? [single] : [];
  }

  const requested = Math.min(
    MAX_OCCURRENCES,
    Math.max(1, parseInt(rule.endCount, 10) || MAX_OCCURRENCES)
  );
  const candidate = { ...rule, endCount: requested };

  const validation = validateRecurrenceRule(candidate);
  if (!validation.valid) {
    return [];
  }

  const cappedMax = Math.min(maxOccurrences, MAX_OCCURRENCES, requested);
  const options = buildRRuleOptions(candidate, cappedMax);
  const rrule = new RRule(options);
  return rrule.all().slice(0, cappedMax);
}

function generateOccurrenceDateRanges(
  rule,
  durationMs,
  { maxOccurrences = MAX_OCCURRENCES, skipFirst = false } = {}
) {
  const dates = generateOccurrenceDates(rule, { maxOccurrences });
  const slice = skipFirst ? dates.slice(1) : dates;
  const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;

  return slice.map((startDate) => {
    const endDate = new Date(startDate.getTime() + safeDuration);
    return [new Date(startDate), endDate];
  });
}

function buildRecurrenceDateList(rule) {
  return generateOccurrenceDates(rule).map((d) =>
    d.toLocaleDateString("en-SG", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  );
}

function formatSummaryDate(startDate) {
  const date = parseRecurrenceStartDate(startDate);
  if (!date) {
    return startDate || "the selected date";
  }
  return date.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildRecurrenceSummary(rule) {
  if (!rule?.isRepeat) {
    return "Does not repeat.";
  }

  const validation = validateRecurrenceRule(rule);
  if (!validation.valid) {
    return validation.errors.join(" ");
  }

  const interval = Math.max(1, parseInt(rule.interval, 10) || 1);
  const unit = FREQUENCY_UNITS[rule.frequency] || "interval";
  const unitLabel = interval === 1 ? unit : `${unit}s`;
  const startLabel = formatSummaryDate(rule.startDate);
  let pattern = `Every ${interval} ${unitLabel}`;

  switch (rule.frequency) {
    case "weekly": {
      const dayNames = (rule.weekDays || [])
        .slice()
        .sort((a, b) => a - b)
        .map((day) => WEEKDAY_LABELS[day])
        .join(", ");
      pattern += dayNames ? ` on ${dayNames}` : "";
      break;
    }
    case "monthly":
      if (rule.monthlyMode === "dayOfWeek") {
        const ordinal = ORDINAL_LABELS[(rule.monthOrdinal || 1) - 1] || "first";
        const weekday = WEEKDAY_LABELS[rule.monthWeekday] || "Sunday";
        pattern += ` on the ${ordinal} ${weekday}`;
      } else {
        pattern += ` on day ${rule.monthDay}`;
      }
      break;
    default:
      break;
  }

  const count = Math.min(
    MAX_OCCURRENCES,
    Math.max(1, parseInt(rule.endCount, 10) || MAX_OCCURRENCES)
  );
  return `${pattern} starting ${startLabel} for ${count} occurrences (incl. the first, max ${MAX_OCCURRENCES})`;
}

module.exports = {
  MAX_OCCURRENCES,
  parseRecurrenceStartDate,
  formatRecurrenceStartDate,
  getDefaultRecurrenceRule,
  normalizeRecurrenceRule,
  validateRecurrenceRule,
  generateOccurrenceDates,
  generateOccurrenceDateRanges,
  buildRecurrenceDateList,
  buildRecurrenceSummary,
};
