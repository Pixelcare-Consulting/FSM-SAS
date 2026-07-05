import React, { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import PortalModal from "../../../../components/portal/PortalModal";
import {
  buildRecurrenceDateList,
  buildRecurrenceSummary,
  getDefaultRecurrenceRule,
  normalizeRecurrenceRule,
  validateRecurrenceRule,
} from "../../../../lib/jobs/recurrence";

const MAX_END_COUNT = 52;

const FREQUENCY_TABS = [
  { value: "daily", label: "DAILY" },
  { value: "weekly", label: "WEEKLY" },
  { value: "monthly", label: "MONTHLY" },
  { value: "yearly", label: "YEARLY" },
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const ORDINAL_OPTIONS = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: 5, label: "Fifth" },
];

function unitLabel(frequency, interval) {
  const count = Math.max(1, parseInt(interval, 10) || 1);
  const plural = count === 1 ? "" : "s";
  switch (frequency) {
    case "daily":
      return `day${plural} from`;
    case "weekly":
      return `week${plural} from`;
    case "monthly":
      return `month${plural} from`;
    case "yearly":
      return `year${plural} from`;
    default:
      return "interval from";
  }
}

export default function JobRecurrenceModal({
  show,
  onHide,
  initialRule,
  onSave,
  mode = "configure",
}) {
  const fallbackStartDate = initialRule?.startDate || "";
  const [rule, setRule] = useState(() =>
    normalizeRecurrenceRule(
      initialRule || getDefaultRecurrenceRule(fallbackStartDate),
      fallbackStartDate
    )
  );
  const [summary, setSummary] = useState("");
  const [dateList, setDateList] = useState([]);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!show) {
      return;
    }
    const normalized = normalizeRecurrenceRule(
      initialRule || getDefaultRecurrenceRule(fallbackStartDate),
      fallbackStartDate
    );
    setRule({
      ...normalized,
      isRepeat: mode === "reschedule" ? false : normalized.isRepeat ?? true,
    });
    setSummary("");
    setDateList([]);
    setValidationError("");
  }, [show, initialRule, fallbackStartDate, mode]);

  const resetSummary = () => {
    setSummary("");
    setDateList([]);
  };

  const handleFrequencyChange = (frequency) => {
    setRule((prev) => ({ ...prev, frequency }));
    resetSummary();
    setValidationError("");
  };

  const handleIntervalChange = (value) => {
    setRule((prev) => ({ ...prev, interval: value }));
    resetSummary();
  };

  const handleStartDateChange = (value) => {
    setRule((prev) => ({ ...prev, startDate: value }));
    resetSummary();
  };

  const handleEndCountChange = (value) => {
    setRule((prev) => ({ ...prev, endCount: value }));
    resetSummary();
  };

  const handleEndCountBlur = (value) => {
    const parsed = parseInt(value, 10);
    const clamped = Number.isFinite(parsed)
      ? Math.min(MAX_END_COUNT, Math.max(1, parsed))
      : MAX_END_COUNT;
    setRule((prev) => ({ ...prev, endCount: clamped }));
    resetSummary();
  };

  const toggleWeekDay = (day) => {
    setRule((prev) => ({
      ...prev,
      weekDays: prev.weekDays.includes(day)
        ? prev.weekDays.filter((d) => d !== day)
        : [...prev.weekDays, day],
    }));
    resetSummary();
  };

  const handleGetSummary = () => {
    const candidate = {
      ...rule,
      isRepeat: mode === "reschedule" ? false : true,
    };
    const validation = validateRecurrenceRule(candidate);
    if (!validation.valid) {
      setValidationError(validation.errors.join(" "));
      setSummary("");
      setDateList([]);
      return;
    }
    setValidationError("");
    setSummary(buildRecurrenceSummary(candidate));
    setDateList(buildRecurrenceDateList(candidate));
  };

  const handleSave = () => {
    if (mode === "reschedule") {
      if (!rule.startDate) {
        setValidationError("A valid start date is required.");
        return;
      }
      onSave?.({
        ...rule,
        isRepeat: false,
      });
      return;
    }

    const candidate = { ...rule, isRepeat: true };
    const validation = validateRecurrenceRule(candidate);
    if (!validation.valid) {
      setValidationError(validation.errors.join(" "));
      return;
    }
    setValidationError("");
    onSave?.(candidate);
  };

  return (
    <PortalModal
      show={show}
      onHide={onHide}
      title="Change Job Start Date"
      size="md"
      bodyClassName="portal-form-body"
      footer={
        <>
          <Button variant="outline-secondary" onClick={onHide}>
            CLOSE
          </Button>
          <Button variant="primary" onClick={handleSave}>
            SAVE
          </Button>
        </>
      }
    >
      {mode !== "reschedule" && (
        <div className="portal-recurrence-tabs" role="tablist" aria-label="Repeat frequency">
          {FREQUENCY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`portal-recurrence-tab${rule.frequency === tab.value ? " is-active" : ""}`}
              onClick={() => handleFrequencyChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="portal-recurrence-row">
        {mode !== "reschedule" && <span>Repeat every</span>}
        {mode !== "reschedule" && (
          <Form.Control
            type="number"
            min="1"
            value={rule.interval}
            onChange={(e) => handleIntervalChange(e.target.value)}
            aria-label="Repeat interval"
            style={{ width: "4.5rem" }}
          />
        )}
        {mode !== "reschedule" && <span>{unitLabel(rule.frequency, rule.interval)}</span>}
        {mode === "reschedule" && <span>Start date</span>}
        <Form.Control
          type="date"
          value={rule.startDate || ""}
          onChange={(e) => handleStartDateChange(e.target.value)}
          aria-label="Start date"
        />
      </div>

      {mode !== "reschedule" && rule.frequency === "weekly" && (
        <div className="portal-recurrence-section">
          <div className="portal-recurrence-section-title">Repeat on</div>
          <div className="portal-recurrence-chip-row">
            {WEEKDAY_OPTIONS.map((day) => (
              <label
                key={day.value}
                className={`portal-recurrence-chip${rule.weekDays.includes(day.value) ? " is-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={rule.weekDays.includes(day.value)}
                  onChange={() => toggleWeekDay(day.value)}
                  style={{ display: "none" }}
                />
                {day.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {mode !== "reschedule" && rule.frequency === "monthly" && (
        <>
          <div className="portal-recurrence-section">
            <Form.Check
              type="checkbox"
              id="monthly-day-of-week"
              label="Day of the Week"
              checked={rule.monthlyMode === "dayOfWeek"}
              onChange={(e) =>
                setRule((prev) => ({
                  ...prev,
                  monthlyMode: e.target.checked ? "dayOfWeek" : "dayOfMonth",
                }))
              }
            />
          </div>

          {rule.monthlyMode === "dayOfMonth" ? (
            <div className="portal-recurrence-row">
              <span>Day of month</span>
              <Form.Control
                type="number"
                min="1"
                max="31"
                value={rule.monthDay}
                onChange={(e) =>
                  setRule((prev) => ({ ...prev, monthDay: e.target.value }))
                }
                style={{ width: "5rem" }}
              />
            </div>
          ) : (
            <>
              <div className="portal-recurrence-section">
                <div className="portal-recurrence-section-title">Occurrence</div>
                <div className="portal-recurrence-chip-row">
                  {ORDINAL_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`portal-recurrence-chip${rule.monthOrdinal === option.value ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="monthOrdinal"
                        checked={rule.monthOrdinal === option.value}
                        onChange={() =>
                          setRule((prev) => ({ ...prev, monthOrdinal: option.value }))
                        }
                        style={{ display: "none" }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="portal-recurrence-section">
                <div className="portal-recurrence-section-title">Weekday</div>
                <div className="portal-recurrence-chip-row">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <label
                      key={day.value}
                      className={`portal-recurrence-chip${rule.monthWeekday === day.value ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="monthWeekday"
                        checked={rule.monthWeekday === day.value}
                        onChange={() =>
                          setRule((prev) => ({ ...prev, monthWeekday: day.value }))
                        }
                        style={{ display: "none" }}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {mode !== "reschedule" && (
        <div className="portal-recurrence-section">
          <div className="portal-recurrence-section-title">This Job Stops Repeating</div>
          <div className="portal-recurrence-row">
            <span>After</span>
            <Form.Control
              type="number"
              min="1"
              max={MAX_END_COUNT}
              value={rule.endCount}
              onChange={(e) => handleEndCountChange(e.target.value)}
              onBlur={(e) => handleEndCountBlur(e.target.value)}
              aria-label="Stop repeating after occurrences"
              style={{ width: "4.5rem" }}
            />
            <span>occurrences</span>
          </div>
        </div>
      )}

      {mode !== "reschedule" && (
        <div className="portal-recurrence-section">
          <div className="portal-recurrence-summary-actions">
            <span className="portal-recurrence-section-title mb-0">Summary</span>
            <Button variant="outline-primary" size="sm" onClick={handleGetSummary}>
              GET SUMMARY
            </Button>
          </div>
          {summary ? (
            <div className="portal-recurrence-summary-text small text-muted mb-2">
              {summary}
            </div>
          ) : null}
          <div
            className="portal-recurrence-summary-panel"
            style={{ maxHeight: "12rem", overflowY: "auto" }}
          >
            {dateList.length ? (
              <ol className="portal-recurrence-date-list list-unstyled mb-0">
                {dateList.map((label, index) => (
                  <li key={`${label}-${index}`}>
                    {index + 1}. {label}
                  </li>
                ))}
              </ol>
            ) : (
              "Click GET SUMMARY to preview the repeat schedule."
            )}
          </div>
        </div>
      )}

      {validationError ? (
        <div className="text-danger small mt-2">{validationError}</div>
      ) : null}
    </PortalModal>
  );
}
