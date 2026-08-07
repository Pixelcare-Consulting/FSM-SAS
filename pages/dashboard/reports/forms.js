import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Row,
  Col,
  Card,
  Button,
  Form,
  Table,
  Badge,
  Spinner,
  Alert,
  Pagination,
} from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaFilter } from "react-icons/fa";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/light.css";
import { format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import toast from "react-hot-toast";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function escapeCsvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** UTF-8 BOM helps Excel open special characters correctly */
function downloadCsv(filename, lines) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
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

const FormsReportPage = () => {
  const [dateRange, setDateRange] = useState([]);
  const [formType, setFormType] = useState("");
  const [techFilter, setTechFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [googleForms, setGoogleForms] = useState([]);
  const [signatureRows, setSignatureRows] = useState([]);
  const [mediaRows, setMediaRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
      if (!response.ok)
        throw new Error(body.error || `Failed to load forms data (${response.status})`);

      setGoogleForms(body.googleForms || []);
      setSignatureRows(body.signatureRows || []);
      setMediaRows(body.mediaRows || []);
      setPage(1);
    } catch (e) {
      setError(e?.message || "Failed to load forms data");
    } finally {
      setLoading(false);
    }
  }, [dateRange, formType, techFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 100);
    return () => clearTimeout(timer);
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
      r.signed_at
        ? isWithinInterval(new Date(r.signed_at), { start: weekStart, end: weekEnd })
        : false
    ).length;
    const medN = mediaRows.filter((r) =>
      r.created_at
        ? isWithinInterval(new Date(r.created_at), { start: weekStart, end: weekEnd })
        : false
    ).length;
    return sigN + medN;
  }, [signatureRows, mediaRows, weekStart, weekEnd]);

  const totalPages = Math.max(1, Math.ceil(mergedRows.length / pageSize) || 1);
  const safePage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return mergedRows.slice(start, start + pageSize);
  }, [mergedRows, safePage, pageSize]);

  const rangeLabel = useMemo(() => {
    if (!mergedRows.length) return "0 of 0";
    const start = (safePage - 1) * pageSize + 1;
    const end = Math.min(safePage * pageSize, mergedRows.length);
    return `${start}–${end} of ${mergedRows.length}`;
  }, [mergedRows.length, safePage, pageSize]);

  const handleExportCsv = useCallback(() => {
    if (!mergedRows.length) {
      toast.error("Nothing to export yet — load activity first.");
      return;
    }
    const headers = [
      "Date",
      "Type",
      "Job #",
      "Customer",
      "Technician",
      "Detail",
      "Status",
    ];
    const csvLines = [
      headers.map(escapeCsvCell).join(","),
      ...mergedRows.map((r) =>
        [
          r.at ? format(new Date(r.at), "yyyy-MM-dd HH:mm") : "",
          r.kind,
          r.jobNumber,
          r.customerName,
          r.technicianName,
          r.detail,
          r.status,
        ]
          .map(escapeCsvCell)
          .join(",")
      ),
    ];
    const stamp = format(new Date(), "yyyy-MM-dd");
    downloadCsv(`forms-report_${stamp}.csv`, csvLines);
    toast.success(`Exported ${mergedRows.length} row${mergedRows.length === 1 ? "" : "s"}`);
  }, [mergedRows]);

  const canExport = !loading && mergedRows.length > 0;

  const goToPage = (next) => {
    setPage(Math.min(Math.max(1, next), totalPages));
  };

  return (
    <ReportPageShell
      title="Forms Report"
      subtitle="Google Form definitions, customer sign-offs, and job media from Supabase"
      headerRight={
        <Button
          size="sm"
          variant="light"
          className="d-flex align-items-center gap-2"
          style={{ fontSize: 13, borderRadius: 8 }}
          onClick={handleExportCsv}
          disabled={!canExport}
          title={
            canExport
              ? "Download CSV of the current filtered activity list"
              : "Load activity first, then export"
          }
        >
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
              onChange={(e) => {
                setFormType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All activity types</option>
              <option value="signoff">Customer sign-offs only</option>
              <option value="media">Photos & documents only</option>
            </Form.Select>
            <Form.Control
              size="sm"
              placeholder="Technician name…"
              value={techFilter}
              onChange={(e) => {
                setTechFilter(e.target.value);
                setPage(1);
              }}
              style={{ maxWidth: 180, fontSize: 13, borderRadius: 8 }}
            />
            <Button
              size="sm"
              variant="outline-primary"
              style={{ borderRadius: 8, fontSize: 13 }}
              onClick={load}
              disabled={loading}
            >
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
                <h3 style={{ fontWeight: 700, color: c.color, margin: 0, fontSize: 26 }}>
                  {c.value}
                </h3>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {googleForms.length > 0 && (
        <Card className="mb-4" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <Card.Header
            className="bg-white py-3 px-4"
            style={{ borderBottom: "1px solid #e2e8f0" }}
          >
            <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Active Google Forms</h6>
          </Card.Header>
          <Card.Body className="py-2 px-3">
            <ul className="mb-0 ps-3" style={{ fontSize: 13 }}>
              {googleForms.map((g) => (
                <li key={g.id}>
                  <a href={g.url} target="_blank" rel="noopener noreferrer">
                    {g.name}
                  </a>
                  {!g.is_active ? (
                    <Badge bg="secondary" className="ms-2">
                      Inactive
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header
          className="bg-white py-3 px-4 d-flex align-items-center justify-content-between flex-wrap gap-2"
          style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}
        >
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>
            Field activity (sign-offs & files)
          </h6>
          {!loading && mergedRows.length > 0 && (
            <span style={{ fontSize: 12, color: "#64748b" }}>Showing {rangeLabel}</span>
          )}
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th
                    className="px-4 py-3"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
                    Date
                  </th>
                  <th
                    className="py-3"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
                    Type
                  </th>
                  <th
                    className="py-3"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
                    Job #
                  </th>
                  <th
                    className="py-3"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
                    Customer
                  </th>
                  <th
                    className="py-3"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
                    Technician
                  </th>
                  <th
                    className="py-3"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
                    Detail
                  </th>
                  <th
                    className="py-3"
                    style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}
                  >
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
                    <td
                      colSpan={7}
                      className="px-4 py-5 text-center"
                      style={{ color: "#94a3b8", fontSize: 14 }}
                    >
                      No sign-offs or media found (or none match filters).
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-4 py-2">
                        {r.at ? format(new Date(r.at), "MMM d, yyyy HH:mm") : "—"}
                      </td>
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
        {!loading && mergedRows.length > 0 && (
          <Card.Footer
            className="bg-white d-flex align-items-center justify-content-between flex-wrap gap-3 py-3 px-4"
            style={{ borderTop: "1px solid #e2e8f0", borderRadius: "0 0 12px 12px" }}
          >
            <div className="d-flex align-items-center gap-2" style={{ fontSize: 13 }}>
              <span style={{ color: "#64748b" }}>Rows per page</span>
              <Form.Select
                size="sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) || 25);
                  setPage(1);
                }}
                style={{ width: 88, borderRadius: 8, fontSize: 13 }}
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Form.Select>
            </div>
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <span style={{ fontSize: 13, color: "#64748b" }}>
                Page {safePage} of {totalPages}
              </span>
              <Pagination className="mb-0" size="sm">
                <Pagination.First
                  disabled={safePage <= 1}
                  onClick={() => goToPage(1)}
                  aria-label="First page"
                />
                <Pagination.Prev
                  disabled={safePage <= 1}
                  onClick={() => goToPage(safePage - 1)}
                  aria-label="Previous page"
                />
                <Pagination.Next
                  disabled={safePage >= totalPages}
                  onClick={() => goToPage(safePage + 1)}
                  aria-label="Next page"
                />
                <Pagination.Last
                  disabled={safePage >= totalPages}
                  onClick={() => goToPage(totalPages)}
                  aria-label="Last page"
                />
              </Pagination>
            </div>
          </Card.Footer>
        )}
      </Card>
    </ReportPageShell>
  );
};

export default FormsReportPage;
