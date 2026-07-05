import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import { Row, Col, Card, Button, Form, Table, Spinner, Alert } from "react-bootstrap";
import ReportPageShell from "../_components/ReportPageShell";
import { FaDownload, FaCar, FaHammer } from "react-icons/fa";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/light.css";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import { formatHours, formatIncentiveAmount } from "../../../../lib/supabase/reports";

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

const DriveLaborTimePage = () => {
  const router = useRouter();
  const initialPeriod = typeof router.query.period === "string" ? router.query.period : "this-week";
  const [period, setPeriod] = useState(initialPeriod);
  const [customRange, setCustomRange] = useState([]);

  useEffect(() => {
    if (router.isReady && typeof router.query.period === "string") {
      setPeriod(router.query.period);
    }
  }, [router.isReady, router.query.period]);

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

  const rangeMs = useMemo(() => {
    if (periodBounds.length !== 2) return null;
    const start = new Date(periodBounds[0]);
    start.setHours(0, 0, 0, 0);
    const end = new Date(periodBounds[1]);
    end.setHours(23, 59, 59, 999);
    return { startMs: start.getTime(), endMs: end.getTime() };
  }, [periodBounds]);

  const [employeeFilter, setEmployeeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    if (!rangeMs) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startMs: String(rangeMs.startMs),
        endMs: String(rangeMs.endMs),
        limit: "500",
      });
      const response = await fetch(`/api/reports/drive-labor-time?${params.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Failed to load labor data (${response.status})`);
      setRows(body.rows || []);
    } catch (err) {
      setError(err?.message || "Failed to load labor data");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [rangeMs]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let r = rows;
    if (employeeFilter.trim()) {
      r = r.filter((row) => (row.technician?.full_name || "") === employeeFilter);
    }
    return r;
  }, [rows, employeeFilter]);

  const totals = useMemo(() => {
    let laborH = 0;
    let incentiveAmount = 0;
    for (const row of filtered) laborH += row.laborHours || 0;
    for (const row of filtered) incentiveAmount += row.incentiveAmount || 0;
    return {
      laborH,
      driveH: 0,
      incentiveAmount,
      avgLaborMin: filtered.length ? (laborH * 60) / filtered.length : 0,
    };
  }, [filtered]);

  return (
    <ReportPageShell
      title="Drive and Labor Time by Employee (Per Job)"
      subtitle="Labor time from technician job start/end. Drive time is not stored in Supabase yet — shown as N/A."
      headerRight={
        <Button size="sm" variant="light" className="d-flex align-items-center gap-2" style={{ fontSize: 13, borderRadius: 8 }}>
          <FaDownload style={{ fontSize: 12 }} />
          Export
        </Button>
      }
    >
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="mb-4" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Body className="py-3 px-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
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
            <Button size="sm" variant="outline-primary" onClick={load} disabled={loading || !rangeMs}>
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
          { label: "Total labor time", value: formatHours(totals.laborH), color: "#10b981", icon: FaHammer },
          { label: "Total drive time", value: "N/A", color: "#4171F5", icon: FaCar },
          { label: "Total incentives", value: formatIncentiveAmount(totals.incentiveAmount), color: "#8b5cf6" },
          { label: "Avg labor / job", value: `${Math.round(totals.avgLaborMin)}m`, color: "#f59e0b" },
        ].map((c) => (
          <Col xl={3} md={6} key={c.label}>
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
                  {c.icon ? (
                    <>
                      <c.icon className="me-1" style={{ fontSize: 11 }} />
                      {c.label}
                    </>
                  ) : (
                    c.label
                  )}
                </p>
                <h3 style={{ fontWeight: 700, color: c.color, margin: 0, fontSize: 26 }}>{c.value}</h3>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="mb-4" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Body className="py-3 px-4">
          <Form.Select
            size="sm"
            style={{ maxWidth: 280, fontSize: 13, borderRadius: 8 }}
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
          >
            <option value="">All employees</option>
            {[...new Set(rows.map((r) => r.technician?.full_name).filter(Boolean))]
              .sort()
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </Form.Select>
        </Card.Body>
      </Card>

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Drive & labor time — {dateLabel}</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Employee
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Job #
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Customer
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Job date
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    <FaCar className="me-1" style={{ fontSize: 11, color: "#4171F5" }} />
                    Drive
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    <FaHammer className="me-1" style={{ fontSize: 11, color: "#10b981" }} />
                    Labor
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Incentive Rate
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Incentive
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {!rangeMs ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-5 text-center text-muted">
                      Choose a period.
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-5 text-center">
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-5 text-center text-muted">
                      No technician job visits with a start time in this period.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2">{row.technician?.full_name || "—"}</td>
                      <td>{row.job?.job_number || "—"}</td>
                      <td>{row.job?.customer?.customer_name || "—"}</td>
                      <td>{row.jobDate ? format(new Date(row.jobDate), "MMM d, yyyy") : "—"}</td>
                      <td className="text-muted">N/A</td>
                      <td>{formatHours(row.laborHours)}</td>
                      <td>{formatIncentiveAmount(row.incentiveRate)}</td>
                      <td>{formatIncentiveAmount(row.incentiveAmount)}</td>
                      <td>{formatHours(row.laborHours)}</td>
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

export default DriveLaborTimePage;
