import React, { useEffect, useMemo, useState } from "react";
import { Button, Form, Row, Col, Alert, Spinner } from "react-bootstrap";
import Select from "react-select";
import {
  CALENDAR_EVENT_COLORS,
  CALENDAR_EVENT_TYPE_LABELS,
  CALENDAR_SCOPES,
} from "../../../../../lib/calendar/calendarEvents";
import PortalModal from "../../../../../components/portal/PortalModal";

const COMPANY_TYPES = [
  { value: "holiday", label: "Holiday" },
  { value: "company_day_off", label: "Company day off" },
];

const TECHNICIAN_TYPES = [
  { value: "leave", label: "Leave" },
  { value: "medical", label: "Medical" },
  { value: "other", label: "Other" },
];

const TECHNICIAN_SELECT_STYLES = {
  control: (base, state) => ({
    ...base,
    borderColor: state.isFocused ? "#93c5fd" : "#e2e8f0",
    borderRadius: 8,
    minHeight: 40,
    boxShadow: state.isFocused ? "0 0 0 3px rgba(59, 130, 246, 0.15)" : "none",
    fontSize: "0.875rem",
    backgroundColor: state.isDisabled ? "#f8fafc" : "#fff",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, state) => ({
    ...base,
    fontSize: "0.875rem",
    backgroundColor: state.isSelected ? "#3b82f6" : state.isFocused ? "#eff6ff" : "#fff",
    color: state.isSelected ? "#fff" : "#1e293b",
  }),
  placeholder: (base) => ({ ...base, color: "#94a3b8" }),
  singleValue: (base) => ({ ...base, color: "#1e293b" }),
};

const EMPTY_FORM = {
  scope: CALENDAR_SCOPES.COMPANY,
  eventType: "holiday",
  title: "",
  startDate: "",
  endDate: "",
  technicianId: "",
  notes: "",
};

export default function CalendarEventForm({
  show,
  onHide,
  onSaved,
  initialEvent = null,
  technicians = [],
  presetTechnicianId = null,
  presetScope = null,
  presetDate = null,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = Boolean(initialEvent?.id);
  const typeOptions =
    form.scope === CALENDAR_SCOPES.TECHNICIAN ? TECHNICIAN_TYPES : COMPANY_TYPES;
  const typeColor = CALENDAR_EVENT_COLORS[form.eventType] || "#64748b";
  const typeLabel = CALENDAR_EVENT_TYPE_LABELS[form.eventType] || "Event";

  useEffect(() => {
    if (!show) return;
    setError(null);
    if (initialEvent) {
      setForm({
        scope: initialEvent.scope || CALENDAR_SCOPES.COMPANY,
        eventType: initialEvent.eventType || "holiday",
        title: initialEvent.title || "",
        startDate: initialEvent.startDate || "",
        endDate: initialEvent.endDate || initialEvent.startDate || "",
        technicianId: initialEvent.technicianId || "",
        notes: initialEvent.notes || "",
      });
      return;
    }

    const scope = presetScope || (presetTechnicianId ? CALENDAR_SCOPES.TECHNICIAN : CALENDAR_SCOPES.COMPANY);
    const startYmd = presetDate || "";
    setForm({
      ...EMPTY_FORM,
      scope,
      eventType: scope === CALENDAR_SCOPES.TECHNICIAN ? "leave" : "holiday",
      technicianId: presetTechnicianId || "",
      startDate: startYmd,
      endDate: startYmd,
    });
  }, [show, initialEvent, presetTechnicianId, presetScope, presetDate]);

  const handleScopeChange = (scope) => {
    setForm((prev) => ({
      ...prev,
      scope,
      eventType: scope === CALENDAR_SCOPES.TECHNICIAN ? "leave" : "holiday",
      technicianId: scope === CALENDAR_SCOPES.TECHNICIAN ? prev.technicianId : "",
    }));
  };

  const handleStartDateChange = (event) => {
    const startDate = event.target.value;
    setForm((prev) => {
      let endDate = prev.endDate;
      if (startDate && (!endDate || endDate < startDate)) {
        endDate = startDate;
      }
      return { ...prev, startDate, endDate };
    });
  };

  const handleEndDateChange = (event) => {
    const endDate = event.target.value;
    setForm((prev) => {
      let startDate = prev.startDate;
      if (endDate && startDate && endDate < startDate) {
        startDate = endDate;
      }
      return { ...prev, startDate, endDate };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.scope === CALENDAR_SCOPES.TECHNICIAN && !form.technicianId) {
      setError("Please select a technician");
      return;
    }
    if (!form.startDate) {
      setError("Please select a start date");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        scope: form.scope,
        eventType: form.eventType,
        title: form.title.trim(),
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        technicianId: form.scope === CALENDAR_SCOPES.TECHNICIAN ? form.technicianId : null,
        notes: form.notes?.trim() || null,
        allDay: true,
      };

      const url = isEdit
        ? `/api/calendar/events?id=${encodeURIComponent(initialEvent.id)}`
        : "/api/calendar/events";
      const response = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || body.message || "Failed to save event");
      }
      onSaved?.(body);
      onHide?.();
    } catch (err) {
      setError(err.message || "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialEvent?.id) return;
    if (!window.confirm(`Delete "${initialEvent.title}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/calendar/events?id=${encodeURIComponent(initialEvent.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || body.message || "Failed to delete event");
      }
      onSaved?.(null);
      onHide?.();
    } catch (err) {
      setError(err.message || "Failed to delete event");
    } finally {
      setSaving(false);
    }
  };

  const technicianOptions = useMemo(
    () =>
      [...technicians]
        .filter((t) => t.id)
        .sort((a, b) => (a.text || a.full_name || "").localeCompare(b.text || b.full_name || "")),
    [technicians]
  );

  const technicianSelectOptions = useMemo(
    () =>
      technicianOptions.map((tech) => ({
        value: tech.id,
        label: tech.text || tech.full_name || tech.name || "Technician",
      })),
    [technicianOptions]
  );

  const selectedTechnicianOption = useMemo(
    () => technicianSelectOptions.find((opt) => opt.value === form.technicianId) || null,
    [technicianSelectOptions, form.technicianId]
  );

  const selectedTechnicianName = useMemo(() => {
    if (!form.technicianId) return null;
    const match = technicianOptions.find((tech) => tech.id === form.technicianId);
    return match?.text || match?.full_name || match?.name || null;
  }, [form.technicianId, technicianOptions]);

  const scopeLocked = Boolean(presetTechnicianId);
  const isSingleDay =
    form.startDate && form.endDate && form.startDate === form.endDate;

  const subtitle =
    isEdit || form.title ? (
      <>
        <span className="portal-modal-type-pill">
          <span
            className="portal-modal-type-swatch"
            style={{ backgroundColor: typeColor }}
            aria-hidden
          />
          {typeLabel}
        </span>
        {form.scope === CALENDAR_SCOPES.TECHNICIAN && selectedTechnicianName && (
          <span>{selectedTechnicianName}</span>
        )}
        {form.scope === CALENDAR_SCOPES.COMPANY && <span>Company-wide</span>}
      </>
    ) : null;

  return (
    <PortalModal
      show={show}
      onHide={onHide}
      title={isEdit ? "Edit calendar event" : "Add calendar event"}
      subtitle={subtitle}
      size="md"
      onSubmit={handleSubmit}
      footerLeft={
        isEdit ? (
          <Button variant="outline-danger" onClick={handleDelete} disabled={saving}>
            Delete
          </Button>
        ) : null
      }
      footer={
        <>
          <Button variant="secondary" onClick={onHide} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </>
      }
    >
      {error && <Alert variant="danger" className="portal-modal-alert">{error}</Alert>}

      <Row className="g-3">
        <Col md={6}>
          <Form.Label>Scope</Form.Label>
          <Form.Select
            value={form.scope}
            onChange={(e) => handleScopeChange(e.target.value)}
            disabled={scopeLocked || saving}
          >
            <option value={CALENDAR_SCOPES.COMPANY}>Company event</option>
            <option value={CALENDAR_SCOPES.TECHNICIAN}>Technician leave</option>
          </Form.Select>
        </Col>
        <Col md={6}>
          <Form.Label>Type</Form.Label>
          <Form.Select
            value={form.eventType}
            onChange={(e) => setForm((prev) => ({ ...prev, eventType: e.target.value }))}
            disabled={saving}
          >
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Form.Select>
        </Col>

        {form.scope === CALENDAR_SCOPES.TECHNICIAN && (
          <Col md={12}>
            <Form.Label htmlFor="calendar-event-technician">Technician</Form.Label>
            <Select
              inputId="calendar-event-technician"
              options={technicianSelectOptions}
              value={selectedTechnicianOption}
              onChange={(option) =>
                setForm((prev) => ({ ...prev, technicianId: option?.value || "" }))
              }
              isClearable={!presetTechnicianId}
              isDisabled={Boolean(presetTechnicianId) || saving}
              isSearchable
              placeholder="Search technician…"
              noOptionsMessage={() => "No technicians found"}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
              styles={TECHNICIAN_SELECT_STYLES}
              classNamePrefix="calendar-event-tech-select"
            />
          </Col>
        )}

        <Col md={12}>
          <Form.Label>Title</Form.Label>
          <Form.Control
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={
              form.scope === CALENDAR_SCOPES.COMPANY ? "National Day" : "Annual leave"
            }
            required
            disabled={saving}
          />
        </Col>

        <Col md={6}>
          <Form.Label htmlFor="calendar-event-start-date">Start date</Form.Label>
          <Form.Control
            id="calendar-event-start-date"
            type="date"
            value={form.startDate}
            onChange={handleStartDateChange}
            disabled={saving}
            required
          />
        </Col>
        <Col md={6}>
          <Form.Label htmlFor="calendar-event-end-date">End date</Form.Label>
          <Form.Control
            id="calendar-event-end-date"
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={handleEndDateChange}
            disabled={saving || !form.startDate}
          />
        </Col>
        {isSingleDay && (
          <Col md={12}>
            <Form.Text>Single day event</Form.Text>
          </Col>
        )}

        <Col md={12}>
          <Form.Label>Notes (optional)</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            disabled={saving}
            placeholder="Additional details…"
          />
        </Col>
      </Row>
    </PortalModal>
  );
}

export { CALENDAR_EVENT_TYPE_LABELS };
