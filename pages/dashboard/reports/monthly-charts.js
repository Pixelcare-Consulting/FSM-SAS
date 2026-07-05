import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Row, Col, Card, Button, Form, Spinner, Alert, Table } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload } from "react-icons/fa";

const CHART_TYPES = [
  { id: "jobs", label: "Jobs by month" },
  { id: "technicians", label: "Technician workload" },
  { id: "job-types", label: "Status distribution" },
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MonthBars({ byMonth, valueKey = "jobs", color = "#4171F5" }) {
  const max = Math.max(1, ...byMonth.map((b) => b[valueKey] || 0));
  return (
    <div className="d-flex align-items-end justify-content-between gap-1 px-2" style={{ height: 220 }}>
      {byMonth.map((b, i) => {
        const v = b[valueKey] || 0;
        const h = Math.round((v / max) * 180);
        return (
          <div key={i} className="d-flex flex-column align-items-center flex-grow-1" style={{ maxWidth: 40 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{v}</span>
            <div
              style={{
                width: "100%",
                maxWidth: 28,
                height: Math.max(v ? 6 : 0, h),
                background: color,
                borderRadius: 6,
                transition: "height 0.2s ease",
              }}
              title={`${MONTH_LABELS[i]}: ${v}`}
            />
            <span style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>{MONTH_LABELS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

const MonthlyChartsPage = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeChart, setActiveChart] = useState("jobs");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [byMonth, setByMonth] = useState([]);
  const [techList, setTechList] = useState([]);
  const [statusDist, setStatusDist] = useState([]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/monthly-charts?year=${encodeURIComponent(year)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Failed to load chart data (${response.status})`);

      setByMonth(body.byMonth || []);
      setStatusDist(
        (body.statusDist || []).map(({ status, count }) => [status, count])
      );
      setTechList(body.techList || []);
    } catch (e) {
      setError(e?.message || "Failed to load chart data");
      setByMonth([]);
      setTechList([]);
      setStatusDist([]);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const techMax = useMemo(() => Math.max(1, ...techList.map((t) => t.jobs)), [techList]);

  const renderMain = () => {
    if (loading) {
      return (
        <div className="py-5 text-center">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading {year} data…
        </div>
      );
    }

    if (activeChart === "jobs") {
      const total = byMonth.reduce((s, b) => s + b.jobs, 0);
      return (
        <>
          <p className="text-muted small mb-3">Total jobs in {year} (by scheduled date, else created date): {total}</p>
          <MonthBars byMonth={byMonth} valueKey="jobs" color="#4171F5" />
        </>
      );
    }

    if (activeChart === "technicians") {
      if (!techList.length) {
        return <p className="text-muted text-center py-4">No technician assignments in this year.</p>;
      }
      return (
        <div className="d-flex flex-column gap-2">
          {techList.slice(0, 20).map((t) => (
            <div key={t.name} className="d-flex align-items-center gap-2">
              <span style={{ width: 160, fontSize: 13 }} className="text-truncate" title={t.name}>
                {t.name}
              </span>
              <div className="flex-grow-1" style={{ height: 10, background: "#f1f5f9", borderRadius: 5 }}>
                <div
                  style={{
                    width: `${(t.jobs / techMax) * 100}%`,
                    height: 10,
                    background: "#3DAAF5",
                    borderRadius: 5,
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: "#64748b", width: 36 }}>{t.jobs}</span>
            </div>
          ))}
        </div>
      );
    }

    if (activeChart === "job-types") {
      if (!statusDist.length) {
        return <p className="text-muted text-center py-4">No status data for this year.</p>;
      }
      return (
        <Table size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Status</th>
              <th className="text-end">Jobs</th>
            </tr>
          </thead>
          <tbody>
            {statusDist.map(([label, count]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="text-end">{count}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      );
    }

    return null;
  };

  return (
    <ReportPageShell
      title="Monthly Charts"
      subtitle="Aggregated from Supabase jobs and technician assignments"
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
            <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Year</span>
            <Form.Select
              size="sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ maxWidth: 120, fontSize: 13, borderRadius: 8 }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Form.Select>
            <div className="d-flex gap-2 ms-md-3 flex-wrap">
              {CHART_TYPES.map((chart) => (
                <Button
                  key={chart.id}
                  size="sm"
                  variant={activeChart === chart.id ? "primary" : "outline-secondary"}
                  onClick={() => setActiveChart(chart.id)}
                  style={{ borderRadius: 8, fontSize: 12 }}
                >
                  {chart.label}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline-primary" className="ms-auto" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>
            {CHART_TYPES.find((c) => c.id === activeChart)?.label} — {year}
          </h6>
        </Card.Header>
        <Card.Body>{renderMain()}</Card.Body>
      </Card>

      <Row className="g-4 mt-1">
        {CHART_TYPES.filter((c) => c.id !== activeChart).map((chart) => (
          <Col xl={4} md={6} key={chart.id}>
            <Card
              style={{ borderRadius: 12, border: "1px solid #e2e8f0", cursor: "pointer" }}
              onClick={() => setActiveChart(chart.id)}
            >
              <Card.Body>
                <h6 style={{ fontWeight: 600, fontSize: 13, color: "#475569", marginBottom: 12 }}>{chart.label}</h6>
                <div style={{ height: 100, background: "#f8fafc", borderRadius: 6, border: "1px dashed #e2e8f0" }} className="small text-muted p-2">
                  {chart.id === "jobs" && !loading && byMonth.length > 0 && (
                    <span>
                      Peak month:{" "}
                      {(() => {
                        const maxJ = Math.max(...byMonth.map((b) => b.jobs));
                        const idx = byMonth.findIndex((b) => b.jobs === maxJ);
                        return `${MONTH_LABELS[idx >= 0 ? idx : 0]} (${maxJ} jobs)`;
                      })()}
                    </span>
                  )}
                  {chart.id === "technicians" && !loading && <span>{techList.length} technicians with jobs</span>}
                  {chart.id === "job-types" && !loading && <span>{statusDist.length} distinct statuses</span>}
                  {loading && <span>Loading…</span>}
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </ReportPageShell>
  );
};

export default MonthlyChartsPage;
