import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Spinner } from "react-bootstrap";
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
} from "date-fns";
import { toast } from "react-toastify";
import { getSupabaseClient } from "../../../../../lib/supabase/client";
import {
  CALENDAR_EVENT_COLORS,
  CALENDAR_EVENT_TYPE_LABELS,
  eventCoversDate,
} from "../../../../../lib/calendar/calendarEvents";
import { companyEventsCoverDate } from "../../../../../lib/calendar/availability";
import CalendarEventForm from "./CalendarEventForm";
import CompanyCalendarWelcomeModal, {
  shouldAutoOpenWelcome,
} from "./CompanyCalendarWelcomeModal";
import styles from "../../workers/scheduler.module.css";

const LEGEND = [
  { type: "holiday", label: "Holiday", color: CALENDAR_EVENT_COLORS.holiday },
  { type: "company_day_off", label: "Company day off", color: CALENDAR_EVENT_COLORS.company_day_off },
  { type: "leave", label: "Leave", color: CALENDAR_EVENT_COLORS.leave },
  { type: "medical", label: "Medical", color: CALENDAR_EVENT_COLORS.medical },
];

export default function CompanyCalendarView() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [monthInputValue, setMonthInputValue] = useState(() => format(new Date(), "yyyy-MM"));
  const [events, setEvents] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState("all");
  const [filterTechnicianId, setFilterTechnicianId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [presetDate, setPresetDate] = useState(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const welcomeAutoOpenRef = useRef(false);

  const range = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    };
  }, [currentMonth]);

  const loadTechnicians = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("technicians")
      .select("id, full_name, status")
      .is("deleted_at", null)
      .order("full_name", { ascending: true });
    setTechnicians(
      (data || []).map((row) => ({
        id: row.id,
        text: row.full_name,
        full_name: row.full_name,
      }))
    );
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const response = await fetch(`/api/calendar/events?${params}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        let message = "Failed to load calendar events";
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      const payload = await response.json();
      setEvents(payload.events || []);
    } catch (err) {
      toast.error(err.message || "Failed to load calendar events");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadTechnicians();
  }, [loadTechnicians]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (welcomeAutoOpenRef.current || !shouldAutoOpenWelcome()) return;
    welcomeAutoOpenRef.current = true;
    const timer = window.setTimeout(() => setShowWelcomeModal(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setMonthInputValue(format(currentMonth, "yyyy-MM"));
  }, [currentMonth]);

  useEffect(() => {
    const dateParam = typeof router.query.date === "string" ? router.query.date : null;
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    const parsed = new Date(`${dateParam}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setCurrentMonth(parsed);
  }, [router.query.date]);

  const commitMonthFromInput = useCallback(() => {
    if (!/^\d{4}-\d{2}$/.test(monthInputValue)) {
      setMonthInputValue(format(currentMonth, "yyyy-MM"));
      return;
    }
    const parsed = new Date(`${monthInputValue}-01T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      setMonthInputValue(format(currentMonth, "yyyy-MM"));
      return;
    }
    setCurrentMonth(parsed);
  }, [monthInputValue, currentMonth]);

  const filteredEvents = useMemo(() => {
    if (filterMode === "company") {
      return events.filter((event) => event.scope === "company");
    }
    if (filterMode === "technician" && filterTechnicianId) {
      return events.filter(
        (event) =>
          event.scope === "company" ||
          (event.scope === "technician" && event.technicianId === filterTechnicianId)
      );
    }
    return events;
  }, [events, filterMode, filterTechnicianId]);

  const technicianNameById = useMemo(() => {
    const map = new Map();
    for (const tech of technicians) {
      if (tech.id) {
        map.set(tech.id, tech.text || tech.full_name || tech.name || "Technician");
      }
    }
    return map;
  }, [technicians]);

  const openCreate = (dateStr = null) => {
    setEditingEvent(null);
    setPresetDate(dateStr);
    setShowForm(true);
  };

  const openEdit = (event) => {
    if (!event?.id) return;
    setEditingEvent(event);
    setPresetDate(null);
    setShowForm(true);
  };

  const handleSaved = () => {
    toast.success("Calendar saved");
    loadEvents();
  };

  const renderMonthCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <>
        <div className={styles.calendarHeader}>
          <div className={styles.dayName}>Sun</div>
          <div className={styles.dayName}>Mon</div>
          <div className={styles.dayName}>Tue</div>
          <div className={styles.dayName}>Wed</div>
          <div className={styles.dayName}>Thu</div>
          <div className={styles.dayName}>Fri</div>
          <div className={styles.dayName}>Sat</div>
        </div>
        <div className={styles.calendarGrid}>
          {calendarDays.map((day) => {
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const isToday = isSameDay(day, new Date());
            const dayYmd = format(day, "yyyy-MM-dd");
            const hasCompanyEvent = companyEventsCoverDate(filteredEvents, dayYmd);
            const dayEvents = filteredEvents.filter((event) => eventCoversDate(event, dayYmd));

            return (
              <div
                key={day.toISOString()}
                className={`${styles.calendarDay} ${!isCurrentMonth ? styles.otherMonth : ""} ${
                  hasCompanyEvent ? styles.companyCalendarMonthDay : ""
                }`}
                style={
                  isToday
                    ? { borderColor: "#3b82f6", boxShadow: "0 0 0 1px rgba(59, 130, 246, 0.35)" }
                    : undefined
                }
                onClick={() => openCreate(dayYmd)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openCreate(dayYmd);
                  }
                }}
              >
                <div
                  className={styles.dayNumber}
                  style={isToday ? { color: "#1e40af" } : undefined}
                >
                  {format(day, "d")}
                  {hasCompanyEvent && (
                    <span className={styles.companyCalendarMonthDot} title="Company Event" />
                  )}
                </div>
                <div className={styles.dayJobs}>
                  {dayEvents.map((event) => {
                    const eventType = event.eventType;
                    const color = CALENDAR_EVENT_COLORS[eventType] || "#64748b";
                    const typeLabel = CALENDAR_EVENT_TYPE_LABELS[eventType] || "Event";
                    const technicianName =
                      event.scope === "technician" && event.technicianId
                        ? technicianNameById.get(event.technicianId)
                        : null;
                    const tooltipParts = [typeLabel, event.title];
                    if (technicianName) tooltipParts.push(technicianName);
                    return (
                      <div
                        key={`${event.id}-${dayYmd}`}
                        className={styles.calendarEventBadge}
                        style={{ backgroundColor: color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(event);
                        }}
                        title={tooltipParts.join(" · ")}
                      >
                        <div className={styles.calendarEventBadgeMeta}>
                          <span className={styles.calendarEventBadgeType}>{typeLabel}</span>
                          {technicianName && (
                            <span className={styles.calendarEventBadgeTech}>{technicianName}</span>
                          )}
                        </div>
                        <div className={styles.calendarEventBadgeTitle}>{event.title}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className={styles.schedulerContainer}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button
            type="button"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className={styles.btnOutline}
            title="Previous month"
          >
            ←
          </button>
          <input
            type="month"
            value={monthInputValue}
            onChange={(e) => setMonthInputValue(e.target.value)}
            onBlur={commitMonthFromInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitMonthFromInput();
                e.currentTarget.blur();
              }
            }}
            className={styles.dateInput}
          />
          <button
            type="button"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className={styles.btnOutline}
            title="Next month"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date())}
            className={styles.btnOutline}
          >
            Today
          </button>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="company-calendar-filter">
              Filter:
            </label>
            <select
              id="company-calendar-filter"
              value={filterMode}
              onChange={(e) => {
                setFilterMode(e.target.value);
                if (e.target.value !== "technician") setFilterTechnicianId("");
              }}
              className={styles.searchInput}
              style={{ minWidth: 160 }}
            >
              <option value="all">All events</option>
              <option value="company">Company only</option>
              <option value="technician">Single technician</option>
            </select>
          </div>

          {filterMode === "technician" && (
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel} htmlFor="company-calendar-technician">
                Technician:
              </label>
              <select
                id="company-calendar-technician"
                value={filterTechnicianId}
                onChange={(e) => setFilterTechnicianId(e.target.value)}
                className={styles.searchInput}
                style={{ minWidth: 200 }}
              >
                <option value="">Select technician…</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.text}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className={styles.toolbarRight}>
          <button type="button" onClick={loadEvents} className={styles.btnOutline}>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowWelcomeModal(true)}
            className={styles.btnOutline}
          >
            How it works
          </button>
          <button type="button" onClick={() => openCreate()} className={styles.btnPrimary}>
            Add event
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px 20px",
          marginBottom: 12,
          fontSize: 12,
          color: "#6b7280",
        }}
      >
        {LEGEND.map((item) => (
          <span key={item.type} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: item.color,
                flexShrink: 0,
              }}
              aria-hidden
            />
            {item.label}
          </span>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.6)",
              zIndex: 2,
            }}
          >
            <Spinner animation="border" />
          </div>
        )}
        {renderMonthCalendar()}
      </div>

      <CompanyCalendarWelcomeModal
        show={showWelcomeModal}
        onHide={() => setShowWelcomeModal(false)}
      />

      <CalendarEventForm
        show={showForm}
        onHide={() => {
          setShowForm(false);
          setEditingEvent(null);
          setPresetDate(null);
        }}
        onSaved={handleSaved}
        initialEvent={editingEvent}
        technicians={technicians}
        presetDate={presetDate}
        presetScope={
          editingEvent ? null : filterMode === "technician" && filterTechnicianId ? "technician" : null
        }
        presetTechnicianId={
          editingEvent
            ? null
            : filterMode === "technician"
              ? filterTechnicianId || null
              : null
        }
      />
    </div>
  );
}
