import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, Button, Form, Table, Badge, Spinner, Alert } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaSearch } from "react-icons/fa";

const TYPES = ["All", "Product", "Service"];

function inferType(equipmentType) {
  const t = (equipmentType || "").toLowerCase();
  if (t.includes("service")) return "Service";
  return "Product";
}

const ProductsServicesPage = () => {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", limit: "200" });
      const response = await fetch(`/api/reports/products-services?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load catalog (${response.status})`);
      }
      const payload = await response.json();
      setRows(payload.equipments || []);
    } catch (err) {
      setError(err?.message || "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let r = rows;
    if (type !== "All") {
      r = r.filter((row) => inferType(row.equipment_type) === type);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(
        (row) =>
          (row.item_code || "").toLowerCase().includes(q) ||
          (row.item_name || "").toLowerCase().includes(q) ||
          (row.item_group || "").toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, type, search]);

  return (
    <ReportPageShell
      title="Products & Services Catalog"
      subtitle="Equipment / item records stored in Supabase (linked to customers)"
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
            <div className="d-flex gap-2">
              {TYPES.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={type === t ? "primary" : "outline-secondary"}
                  onClick={() => setType(t)}
                  style={{ borderRadius: 20, fontSize: 12, padding: "5px 14px" }}
                >
                  {t}
                </Button>
              ))}
            </div>
            <div className="position-relative" style={{ minWidth: 240 }}>
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
                placeholder="Search code or name…"
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

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Catalog ({filtered.length})</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Code
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Name
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Type
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Category
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Customer
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Brand / model
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-5 text-center">
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-5 text-center text-muted">
                      No equipment rows match.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2">{row.item_code}</td>
                      <td>{row.item_name}</td>
                      <td>
                        <Badge bg="light" text="dark">
                          {inferType(row.equipment_type)}
                        </Badge>
                      </td>
                      <td>{row.item_group || "—"}</td>
                      <td>{row.customer?.customer_name || "—"}</td>
                      <td>
                        {[row.brand, row.model_series].filter(Boolean).join(" · ") || "—"}
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

export default ProductsServicesPage;
