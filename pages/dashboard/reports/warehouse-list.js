import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Card, Button, Form, Table, Spinner, Alert } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaSearch } from "react-icons/fa";

const WarehouseListPage = () => {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "200",
        search,
      });
      const response = await fetch(`/api/reports/warehouse-list?${params.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Failed to load (${response.status})`);
      setRows(body.rows || []);
    } catch (err) {
      setError(err?.message || "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const filtered = rows;

  return (
    <ReportPageShell
      title="Site / location list"
      subtitle="Customer service locations from the locations table (warehouses are not modeled separately in Supabase)"
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
          <div className="d-flex align-items-center gap-3">
            <div className="position-relative" style={{ minWidth: 260 }}>
              <FaSearch
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                  fontSize: 12,
                  zIndex: 1,
                }}
              />
              <Form.Control
                size="sm"
                placeholder="Search site or customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ fontSize: 13, borderRadius: 8, paddingLeft: 30 }}
              />
            </div>
            <Button size="sm" variant="outline-primary" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Row className="g-3 mb-4">
        <Col xl={4} md={6}>
          <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
            <Card.Body className="p-4">
              <p className="text-muted small text-uppercase fw-bold mb-1">Locations</p>
              <h3 className="mb-0" style={{ color: "#4171F5" }}>
                {loading ? "…" : filtered.length}
              </h3>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Locations</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    ID
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Site name
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Customer
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Coordinates
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center">
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center text-muted">
                      No locations found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-muted" style={{ fontSize: 12 }}>
                        {String(r.id).slice(0, 8)}…
                      </td>
                      <td>{r.location_name || "—"}</td>
                      <td>
                        {r.customer?.customer_name || "—"}{" "}
                        {r.customer?.customer_code ? <span className="text-muted">({r.customer.customer_code})</span> : null}
                      </td>
                      <td>
                        {r.current_latitude && r.current_longitude
                          ? `${r.current_latitude}, ${r.current_longitude}`
                          : "—"}
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

export default WarehouseListPage;
