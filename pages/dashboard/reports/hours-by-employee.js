import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import { Row, Col, Card, Button, Form, Table, Spinner, Alert, Badge } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaClock, FaSearch } from "react-icons/fa";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/light.css";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import { formatHours } from "../../../lib/supabase/reports";

const PERIOD_OPTIONS = [
  { label: "Last Two Weeks", value: "last-two-weeks" },
  { label: "Last Week", value: "last-week" },
  { label: "This Week", value: "this-week" },
  { label: "Custom", value: "custom" },
];

function getPeriodDates(period) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  switch (period) {
    case "this-week":
      return [weekStart, weekEnd];
    case "last-week":
      return [subWeeks(weekStart, 1), subWeeks(weekEnd, 1)];
    case "last-two-weeks":
      return [subWeeks(weekStart, 2), weekEnd];
    default:
      return [];
  }
}

function escapeCsvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** UTF-8 BOM helps Excel open special characters correctly */
function downloadCsv(filename, lines) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const HoursByEmployeePage = () => {
  const router = useRouter();
  const initialPeriod = typeof router.query.period === "string" ? router.query.period : "this-week";
  const [period, setPeriod] = useState(initialPeriod);
  const [customRange, setCustomRange] = useState([]);

  useEffect(() => {
    if (router.isReady && typeof router.query.period === "string") {
      setPeriod(router.query.period);
    }
  }, [router.isReady, router.query.period]);

  // Must not depend on raw getPeriodDates() each render (new Date refs) or load()/useEffect re-run forever.
  const periodBounds = useMemo(() => {
    if (period === "custom") {
      return Array.isArray(customRange) && customRange.length === 2 ? customRange : [];
    }
    const d = getPeriodDates(period);
    return d.length === 2 ? d : [];
  }, [period, customRange]);

  const dateLabel = useMemo(
    () =>
      periodBounds.length === 2
        ? `${format(periodBounds[0], "MMM d, yyyy")} – ${format(periodBounds[1], "MMM d, yyyy")}`
        : "Select a date range",
    [periodBounds]
  );

  const rangeIso = useMemo(() => {
    if (periodBounds.length !== 2) return null;
    const start = new Date(periodBounds[0]);
    start.setHours(0, 0, 0, 0);
    const end = new Date(periodBounds[1]);
    end.setHours(23, 59, 59, 999);
    return { startIso: start.toISOString(), endIso: end.toISOString(), startMs: start.getTime(), endMs: end.getTime() };
  }, [periodBounds]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [tableSearch, setTableSearch] = useState("");

  const load = useCallback(async () => {
    if (!rangeIso) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start: rangeIso.startIso,
        end: rangeIso.endIso,
      });
      const response = await fetch(`/api/reports/hours-by-employee?${params.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Failed to load attendance (${response.status})`);

      const merged = (body.rows || []).map((r) => ({
        id: r.id,
        name: r.name,
        totalMinutes: r.totalMinutes,
        punches: r.punches,
        totalHours: (r.totalMinutes || 0) / 60,
        jobsCompleted: r.completedJobs || 0,
      }));
      merged.sort((a, b) => b.totalHours - a.totalHours);
      setRows(merged);
    } catch (e) {
      setError(e?.message || "Failed to load attendance");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [rangeIso]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const totalHours = rows.reduce((s, r) => s + r.totalHours, 0);
    return { employees: rows.length, totalHours, punches: rows.reduce((s, r) => s + r.punches, 0) };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.name || "").toLowerCase();
      const hrs = formatHours(r.totalHours).toLowerCase();
      const jobs = String(r.jobsCompleted ?? "");
      return name.includes(q) || hrs.includes(q) || jobs.includes(q);
    });
  }, [rows, tableSearch]);

  /** Matches the table when search has hits; if search filters everything out, export full loaded rows */
  const rowsToExport = useMemo(() => {
    const q = tableSearch.trim();
    if (!q) return rows;
    if (filteredRows.length > 0) return filteredRows;
    return rows;
  }, [rows, filteredRows, tableSearch]);

  const handleExportCsv = useCallback(() => {
    if (!rowsToExport.length || periodBounds.length !== 2) return;
    const headers = ["Employee", "Role", "Total Hrs", "Total hours (decimal)", "Jobs completed", "Clock events"];
    const csvLines = [
      headers.map(escapeCsvCell).join(","),
      ...rowsToExport.map((r) =>
        [
          r.name,
          "Technician",
          formatHours(r.totalHours),
          typeof r.totalHours === "number" ? r.totalHours.toFixed(2) : "",
          r.jobsCompleted ?? 0,
          r.punches ?? 0,
        ]
          .map(escapeCsvCell)
          .join(",")
      ),
    ];
    const d0 = format(periodBounds[0], "yyyy-MM-dd");
    const d1 = format(periodBounds[1], "yyyy-MM-dd");
    downloadCsv(`hours-by-employee_${d0}_${d1}.csv`, csvLines);
  }, [rowsToExport, periodBounds]);

  const canExport = !loading && rowsToExport.length > 0 && periodBounds.length === 2;

  return (
    <ReportPageShell
      title="Hours Worked by Employee"
      subtitle="Clock in/out duration from the attendance table (Supabase)"
      headerRight={
        <Button
          size="sm"
          variant="light"
          className="d-flex align-items-center gap-2"
          style={{ fontSize: 13, borderRadius: 8 }}
          onClick={handleExportCsv}
          disabled={!canExport}
          title={canExport ? "Download CSV (opens in Excel)" : "Load data first, then export"}
        >
          <FaDownload style={{ fontSize: 12 }} />
          Export
        </Button>
      }
    >
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="mb-4" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Body className="py-3 px-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <FaClock style={{ color: "#8b5cf6", fontSize: 14 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Period</span>
            <div className="d-flex gap-2 flex-wrap">
              {PERIOD_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={period === opt.value ? "primary" : "outline-secondary"}
                  onClick={() => setPeriod(opt.value)}
                  style={{ borderRadius: 8, fontSize: 12 }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {period === "custom" && (
              <div style={{ minWidth: 240 }}>
                <Flatpickr
                  options={{ mode: "range", dateFormat: "M j, Y" }}
                  value={customRange}
                  onChange={setCustomRange}
                  placeholder="Select custom range"
                  className="form-control form-control-sm"
                  style={{ fontSize: 13, borderRadius: 8 }}
                />
              </div>
            )}
            <Button size="sm" variant="outline-primary" onClick={load} disabled={loading || !rangeIso}>
              Refresh
            </Button>
          </div>
          {periodBounds.length === 2 && (
            <div className="mt-2" style={{ fontSize: 12, color: "#8b5cf6", fontWeight: 500 }}>
              Showing: {dateLabel}
            </div>
          )}
        </Card.Body>
      </Card>

      <Row className="g-3 mb-4">
        {[
          { label: "Employees (with punches)", value: String(totals.employees), color: "#4171F5" },
          { label: "Total hours", value: formatHours(totals.totalHours), color: "#8b5cf6" },
          { label: "Clock events", value: String(totals.punches), color: "#10b981" },
        ].map((c) => (
          <Col xl={4} md={6} key={c.label}>
            <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <Card.Body className="p-4">
                <p
                  style={{
                    fontSize: 12,
                    color: "#94a3b8",
                    marginBottom: 4,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {c.label}
                </p>
                <h3 style={{ fontWeight: 700, color: c.color, margin: 0, fontSize: 26 }}>{c.value}</h3>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>
              Employee hours — {dateLabel}
              {rows.length > 0 && tableSearch.trim() ? (
                <span className="text-muted fw-normal ms-2" style={{ fontSize: 13 }}>
                  ({filteredRows.length} of {rows.length})
                </span>
              ) : null}
            </h6>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {loading || !rangeIso
                ? "…"
                : `${filteredRows.length} row${filteredRows.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </Card.Header>
        {rows.length > 0 && !loading && rangeIso ? (
          <div
            className="px-4 py-3 d-flex align-items-center gap-2 flex-wrap"
            style={{ borderBottom: "1px solid #e2e8f0", background: "#fafbfc" }}
          >
            <div className="position-relative flex-grow-1" style={{ minWidth: 200, maxWidth: 360 }}>
              <FaSearch
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                  fontSize: 13,
                  pointerEvents: "none",
                }}
              />
              <Form.Control
                size="sm"
                type="search"
                placeholder="Search by employee name, hours, or jobs completed…"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                style={{ fontSize: 13, borderRadius: 8, paddingLeft: 36 }}
                aria-label="Filter employee hours table"
              />
            </div>
            {tableSearch.trim() ? (
              <Button size="sm" variant="link" className="text-decoration-none p-0" onClick={() => setTableSearch("")}>
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0 align-middle" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Employee
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Role
                  </th>
                  <th
                    className="py-3 text-end"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
                    Total Hrs
                  </th>
                  <th
                    className="py-3 pe-4 text-end"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
                    Jobs completed
                  </th>
                </tr>
              </thead>
              <tbody>
                {!rangeIso ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center" style={{ color: "#94a3b8", fontSize: 14 }}>
                      Choose a period (custom needs a full date range).
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center">
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center" style={{ color: "#94a3b8", fontSize: 14 }}>
                      No attendance rows in this period. (If you expect data, confirm technicians are clocking in/out.)
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center" style={{ color: "#94a3b8", fontSize: 14 }}>
                      No employees match “{tableSearch.trim()}”. Try another search or clear the filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.id}>
                      <td
                        className="px-4 py-3"
                        style={{ fontWeight: 600, color: "#1e293b", verticalAlign: "middle" }}
                      >
                        {r.name}
                      </td>
                      <td className="py-3" style={{ verticalAlign: "middle" }}>
                        <Badge bg="light" text="dark" className="fw-semibold" style={{ fontSize: 12, padding: "0.35em 0.65em" }}>
                          Technician
                        </Badge>
                      </td>
                      <td
                        className="py-3 text-end"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color: (Number(r.totalHours) || 0) > 0 ? "#4171F5" : "#94a3b8",
                          verticalAlign: "middle",
                        }}
                      >
                        {formatHours(r.totalHours)}
                      </td>
                      <td
                        className="py-3 pe-4 text-end"
                        style={{ fontVariantNumeric: "tabular-nums", color: "#475569", verticalAlign: "middle" }}
                      >
                        {r.jobsCompleted}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>
    </ReportPageShell>
  );
};

export default HoursByEmployeePage;
