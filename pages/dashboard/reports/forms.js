import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Row, Col, Card, Button, Form, Table, Badge, Spinner, Alert } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaFilter } from "react-icons/fa";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/light.css";
import { format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

const FormsReportPage = () => {
  const [dateRange, setDateRange] = useState([]);
  const [formType, setFormType] = useState("");
  const [techFilter, setTechFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [googleForms, setGoogleForms] = useState([]);
  const [signatureRows, setSignatureRows] = useState([]);
  const [mediaRows, setMediaRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const from = dateRange?.[0] || null;
      const to = dateRange?.[1] || dateRange?.[0] || null;
      if (from) params.set("dateFrom", from.toISOString().slice(0, 10));
      if (to) params.set("dateTo", to.toISOString().slice(0, 10));
      if (formType) params.set("formType", formType);
      if (techFilter.trim()) params.set("techFilter", techFilter.trim());

      const response = await fetch(`/api/reports/forms?${params.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Failed to load forms data (${response.status})`);

      setGoogleForms(body.googleForms || []);
      setSignatureRows(body.signatureRows || []);
      setMediaRows(body.mediaRows || []);
    } catch (e) {
      setError(e?.message || "Failed to load forms data");
    } finally {
      setLoading(false);
    }
  }, [dateRange, formType, techFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const mergedRows = useMemo(() => {
    const sig = (signatureRows || []).map((r) => ({
      key: `sig-${r.id}`,
      kind: "Customer sign-off",
      at: r.signed_at,
      jobNumber: r.jobNumber,
      customerName: r.customerName,
      technicianName: r.technicianName,
      detail: r.customer_name || "—",
      status: "Signed",
    }));
    const med = (mediaRows || []).map((r) => ({
      key: `med-${r.id}`,
      kind: r.media_type === "image" ? "Photo / image" : "Document / file",
      at: r.created_at,
      jobNumber: r.jobNumber,
      customerName: r.customerName,
      technicianName: r.technicianName,
      detail: r.filename || r.media_type || "—",
      status: "Uploaded",
    }));
    return [...sig, ...med].sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [signatureRows, mediaRows]);

  const totalSubmissions = signatureRows.length + mediaRows.length;
  const thisWeekCount = useMemo(() => {
    const sigN = signatureRows.filter((r) =>
      r.signed_at ? isWithinInterval(new Date(r.signed_at), { start: weekStart, end: weekEnd }) : false
    ).length;
    const medN = mediaRows.filter((r) =>
      r.created_at ? isWithinInterval(new Date(r.created_at), { start: weekStart, end: weekEnd }) : false
    ).length;
    return sigN + medN;
  }, [signatureRows, mediaRows, weekStart, weekEnd]);

  return (
    <ReportPageShell
      title="Forms Report"
      subtitle="Google Form definitions, customer sign-offs, and job media from Supabase"
      headerRight={
        <Button size="sm" variant="light" className="d-flex align-items-center gap-2" style={{ fontSize: 13, borderRadius: 8 }}>
          <FaDownload style={{ fontSize: 12 }} />
          Export
        </Button>
      }
    >
      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}

      <Card className="mb-4" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Body className="py-3 px-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <FaFilter style={{ color: "#94a3b8", fontSize: 14 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Filters</span>
            <div style={{ minWidth: 220 }}>
              <Flatpickr
                options={{ mode: "range", dateFormat: "M j, Y" }}
                value={dateRange}
                onChange={setDateRange}
                placeholder="Select date range"
                className="form-control form-control-sm"
                style={{ fontSize: 13, borderRadius: 8 }}
              />
            </div>
            <Form.Select
              size="sm"
              style={{ maxWidth: 200, fontSize: 13, borderRadius: 8 }}
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
            >
              <option value="">All activity types</option>
              <option value="signoff">Customer sign-offs only</option>
              <option value="media">Photos & documents only</option>
            </Form.Select>
            <Form.Control
              size="sm"
              placeholder="Technician name…"
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              style={{ maxWidth: 180, fontSize: 13, borderRadius: 8 }}
            />
            <Button size="sm" variant="outline-primary" style={{ borderRadius: 8, fontSize: 13 }} onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Row className="g-3 mb-4">
        {[
          { label: "Configured Google Forms", value: String(googleForms.length), color: "#4171F5" },
          { label: "Sign-offs & uploads (total)", value: String(totalSubmissions), color: "#10b981" },
          { label: "This week", value: String(thisWeekCount), color: "#f59e0b" },
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

      {googleForms.length > 0 && (
        <Card className="mb-4" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0" }}>
            <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Active Google Forms</h6>
          </Card.Header>
          <Card.Body className="py-2 px-3">
            <ul className="mb-0 ps-3" style={{ fontSize: 13 }}>
              {googleForms.map((g) => (
                <li key={g.id}>
                  <a href={g.url} target="_blank" rel="noopener noreferrer">
                    {g.name}
                  </a>
                  {!g.is_active ? <Badge bg="secondary" className="ms-2">Inactive</Badge> : null}
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Field activity (sign-offs & files)</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Date
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Type
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Job #
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Customer
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Technician
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Detail
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-5 text-center">
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading…
                    </td>
                  </tr>
                ) : mergedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-5 text-center" style={{ color: "#94a3b8", fontSize: 14 }}>
                      No sign-offs or media found (or none match filters).
                    </td>
                  </tr>
                ) : (
                  mergedRows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-4 py-2">{r.at ? format(new Date(r.at), "MMM d, yyyy HH:mm") : "—"}</td>
                      <td>{r.kind}</td>
                      <td>{r.jobNumber}</td>
                      <td>{r.customerName}</td>
                      <td>{r.technicianName}</td>
                      <td style={{ maxWidth: 220 }} className="text-truncate" title={r.detail}>
                        {r.detail}
                      </td>
                      <td>
                        <Badge bg="light" text="dark">
                          {r.status}
                        </Badge>
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

export default FormsReportPage;
