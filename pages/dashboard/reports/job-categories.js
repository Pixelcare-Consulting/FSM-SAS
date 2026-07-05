import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, Button, Form, Table, Spinner, Alert } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaSearch } from "react-icons/fa";

/** Build id/code → display name from SAP U_API_JOB_CATEGORY (same shape as CreateJobs). */
function buildJobCategoryLookup(categories) {
  const map = new Map();
  if (!Array.isArray(categories)) return map;
  for (const item of categories) {
    const name = (item.U_JobCat || item.name || "").toString().trim();
    if (!name) continue;
    if (item.U_JobCatID != null && String(item.U_JobCatID).trim() !== "") {
      map.set(String(item.U_JobCatID).trim(), name);
    }
    const code = item.code ?? item.Code;
    if (code != null && String(code).trim() !== "") {
      map.set(String(code).trim(), name);
    }
  }
  return map;
}

const JobCategoriesPage = () => {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/reports/job-categories");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Failed to load (${response.status})`);

      const base = body.rows || [];
      let lookup = new Map();
      try {
        const res = await fetch("/api/getJobCategory", { method: "GET" });
        if (res.ok) {
          const categories = await res.json();
          lookup = buildJobCategoryLookup(categories);
        }
      } catch {
        /* SAP session may be absent; keep numeric/raw descriptions */
      }
      const enriched = base.map((r) => {
        const id = (r.description || "").trim();
        const label = lookup.get(id) ?? lookup.get(String(Number(id))) ?? null;
        return { ...r, categoryLabel: label || r.description };
      });
      setRows(enriched);
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
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const id = (r.description || "").toLowerCase();
      const label = (r.categoryLabel || "").toLowerCase();
      return id.includes(q) || label.includes(q);
    });
  }, [rows, search]);

  return (
    <ReportPageShell
      title="Job Categories"
      subtitle="Aggregated from job_category rows linked to active jobs"
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
                placeholder="Search category…"
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
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Job categories</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Category
                  </th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    Jobs
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-5 text-center">
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-5 text-center text-muted">
                      No job categories found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.description}>
                      <td className="px-4 py-2">{r.categoryLabel || r.description}</td>
                      <td>{r.jobCount}</td>
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

export default JobCategoriesPage;
