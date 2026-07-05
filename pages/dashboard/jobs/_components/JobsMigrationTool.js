import React, { useMemo, useState } from "react";
import { Card, Button, Form, Row, Col, Alert, Table, Spinner, Badge, Modal } from "react-bootstrap";
import toast from "react-hot-toast";

export default function JobsMigrationTool() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  const [applyLimit, setApplyLimit] = useState(50);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [addressMappingOpen, setAddressMappingOpen] = useState(false);
  const [createMissingCustomers, setCreateMissingCustomers] = useState(false);
  const [createMissingLocations, setCreateMissingLocations] = useState(true);
  const [createMissingTechnicians, setCreateMissingTechnicians] = useState(true);

  const headers = useMemo(() => uploadResult?.headers || [], [uploadResult]);

  const onUpload = async () => {
    if (!file) {
      toast.error("Please select an Excel file first.");
      return;
    }
    setApplyResult(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/jobs/migration/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Upload failed");
      setUploadResult(j);
      toast.success(`Uploaded. Rows: ${j.rowCount}`);
    } catch (e) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onPreviewFilter = async () => {
    const uploadId = uploadResult?.upload?.id;
    if (!uploadId) {
      toast.error("Upload a file first.");
      return;
    }
    setPreviewLoading(true);
    setPreviewData(null);
    setPreviewOpen(true);
    try {
      const r = await fetch("/api/jobs/migration/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          dateStart: dateStart || null,
          dateEnd: dateEnd || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Preview failed");
      setPreviewData(j);
    } catch (e) {
      toast.error(e?.message || "Preview failed");
      setPreviewData({ error: e?.message });
    } finally {
      setPreviewLoading(false);
    }
  };

  const onApply = async () => {
    const uploadId = uploadResult?.upload?.id;
    if (!uploadId) {
      toast.error("Upload a file first.");
      return;
    }

    setApplying(true);
    try {
      const payload = {
        uploadId,
        limit: applyLimit ? Number(applyLimit) : null,
        dateStart: dateStart || null,
        dateEnd: dateEnd || null,
        dryRun,
        createMissingCustomers,
        createMissingLocations,
        createMissingTechnicians,
      };

      const r = await fetch("/api/jobs/migration/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include", // Send SAP session cookies for location fetch
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Apply failed");
      setApplyResult(j);
      if (j.counts?.failed > 0) {
        toast(j.counts.failed === j.counts.total ? `All ${j.counts.total} rows failed. Check errors below.` : `${j.counts.created} created, ${j.counts.failed} failed.`, { icon: "⚠️" });
      } else {
        toast.success(
          dryRun
            ? `Dry run OK. Checked: ${j.counts.total}`
            : `Applied. Created: ${j.counts.created}`
        );
      }
    } catch (e) {
      toast.error(e?.message || "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Alert variant="warning" className="mb-4">
          <div className="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div className="fw-semibold">Jobs Migration (Excel)</div>
              <div className="small">
                This tool uploads an Excel file to a staging table and can apply rows into the existing jobs tables.
                Start with <b>Dry run</b>, then apply small batches.
              </div>
            </div>
            <Badge bg="secondary">Staging: job_migration_upload</Badge>
          </div>
        </Alert>

        <Row className="g-3 align-items-end">
          <Col md={8}>
            <Form.Group>
              <Form.Label>Excel file (.xlsx)</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
            </Form.Group>
          </Col>
          <Col md={4} className="d-grid">
            <Button onClick={onUpload} disabled={!file || uploading} variant="primary">
              {uploading ? (
                <>
                  <Spinner size="sm" className="me-2" /> Uploading…
                </>
              ) : (
                "Upload to staging"
              )}
            </Button>
          </Col>
        </Row>

        {uploadResult?.upload?.id && (
          <div className="mt-4">
            {uploadResult.formatWarning ? (
              <Alert variant="warning" className="mb-2">
                <div className="fw-semibold">Format warning</div>
                <div className="small mb-0">{uploadResult.formatWarning}</div>
              </Alert>
            ) : null}
            <Alert variant="success">
              <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
                <div>
                  <div className="fw-semibold">Upload ready</div>
                  <div className="small">
                    Upload ID: <code>{uploadResult.upload.id}</code> · Sheet: <code>{uploadResult.sheet}</code> · Rows:{" "}
                    <code>{uploadResult.rowCount}</code>
                  </div>
                </div>
              </div>
            </Alert>

            <Row className="g-3 mb-2 align-items-end">
              <Col md={5}>
                <Form.Group>
                  <Form.Label>Date range (Job Start DateTime)</Form.Label>
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    <Form.Control
                      type="date"
                      value={dateStart}
                      onChange={(e) => setDateStart(e.target.value)}
                      disabled={applying}
                      style={{ maxWidth: 160 }}
                    />
                    <span className="text-muted small">to</span>
                    <Form.Control
                      type="date"
                      value={dateEnd}
                      onChange={(e) => setDateEnd(e.target.value)}
                      disabled={applying}
                      style={{ maxWidth: 160 }}
                    />
                  </div>
                  <Form.Text>Optional. Migrate only jobs within this range (e.g. Mar 20 – Apr 30).</Form.Text>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={onPreviewFilter}
                  disabled={previewLoading || applying}
                >
                  {previewLoading ? (
                    <>
                      <Spinner size="sm" className="me-1" /> Checking…
                    </>
                  ) : (
                    "Preview filter"
                  )}
                </Button>
              </Col>
            </Row>

            <Row className="g-3">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Apply limit</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    value={applyLimit}
                    onChange={(e) => setApplyLimit(e.target.value)}
                    disabled={applying}
                  />
                  <Form.Text>Recommended: start with 10–50.</Form.Text>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>&nbsp;</Form.Label>
                  <Form.Check
                    type="switch"
                    label="Dry run"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    disabled={applying}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>&nbsp;</Form.Label>
                  <Form.Check
                    type="switch"
                    label="Create missing customers"
                    checked={createMissingCustomers}
                    onChange={(e) => setCreateMissingCustomers(e.target.checked)}
                    disabled={applying}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>&nbsp;</Form.Label>
                  <Form.Check
                    type="switch"
                    label="Create missing locations"
                    checked={createMissingLocations}
                    onChange={(e) => setCreateMissingLocations(e.target.checked)}
                    disabled={applying}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>&nbsp;</Form.Label>
                  <Form.Check
                    type="switch"
                    label="Create missing technicians"
                    checked={createMissingTechnicians}
                    onChange={(e) => setCreateMissingTechnicians(e.target.checked)}
                    disabled={applying}
                  />
                  <Form.Text className="d-block">Default password: sasme123</Form.Text>
                </Form.Group>
              </Col>
            </Row>

            <div className="d-grid mt-3">
              <Button onClick={onApply} disabled={applying} variant={dryRun ? "outline-primary" : "danger"}>
                {applying ? (
                  <>
                    <Spinner size="sm" className="me-2" /> {dryRun ? "Running…" : "Applying…"}
                  </>
                ) : dryRun ? (
                  "Dry run apply"
                ) : (
                  "Apply (creates jobs)"
                )}
              </Button>
            </div>

            {!!headers.length && (
              <div className="mt-4">
                <div className="fw-semibold mb-2">Detected headers</div>
                <div className="small text-muted mb-2">
                  These are the Excel columns we will use for mapping (e.g. <code>SAP ID</code>, <code>Job Start DateTime</code>).
                </div>
                <div style={{ maxHeight: 140, overflow: "auto" }} className="border rounded p-2 bg-light">
                  {headers.map((h) => (
                    <Badge bg="light" text="dark" className="me-2 mb-2 border" key={h}>
                      {h}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {uploadResult?.sampleRows?.length ? (
              <div className="mt-4">
                <div className="fw-semibold mb-2">Sample rows</div>
                <div className="table-responsive">
                  <Table size="sm" bordered hover>
                    <thead>
                      <tr>
                        {headers.slice(0, 8).map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.sampleRows.map((r, idx) => (
                        <tr key={idx}>
                          {headers.slice(0, 8).map((h) => (
                            <td key={h}>{String(r?.[h] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            ) : null}

            {applyResult?.counts ? (
              <div className="mt-4">
                <Alert variant={applyResult.counts.failed ? "warning" : "success"}>
                  <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
                    <div>
                      <div className="fw-semibold">Apply result</div>
                      <div className="small">
                        Created: <code>{applyResult.counts.created}</code> · Failed: <code>{applyResult.counts.failed}</code> · Total:{" "}
                        <code>{applyResult.counts.total}</code>
                      </div>
                    </div>
                    {applyResult.counts.skipped > 0 && applyResult.results?.some((r) => r.address != null) ? (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => setAddressMappingOpen(true)}
                      >
                        View address mapping
                      </Button>
                    ) : null}
                  </div>
                </Alert>
                {applyResult.counts.failed > 0 && applyResult.results?.length > 0 ? (
                  <div className="mt-3">
                    <div className="fw-semibold mb-2">Why rows failed (first 15)</div>
                    <p className="small text-muted mb-2">
                      The Excel must have a <strong>header row</strong> with columns: <code>SAP ID</code>, <code>Job Start DateTime</code>, <code>Job Description</code>, <code>Customer FirstName</code>, <code>Customer LastName</code>, <code>Customer Service Location ID</code>, etc. If your file uses different column names or no header row, all rows will fail.
                    </p>
                    <ul className="small mb-0" style={{ maxHeight: 220, overflowY: "auto" }}>
                      {applyResult.results
                        .filter((r) => r.status === "FAILED" && r.error)
                        .slice(0, 15)
                        .map((r, idx) => (
                          <li key={idx}>
                            <strong>Row {r.rowIndex + 1}</strong> (ID: {r.rowId}): {r.error}
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <Modal show={previewOpen} onHide={() => setPreviewOpen(false)} size="lg" centered>
          <Modal.Header closeButton>
            <Modal.Title>Date filter preview</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {previewLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" />
                <p className="mt-2 mb-0 small text-muted">Checking filter…</p>
              </div>
            ) : previewData?.error ? (
              <Alert variant="danger">{previewData.error}</Alert>
            ) : previewData ? (
              <>
                <Alert variant={previewData.filteredCount > 0 ? "success" : "warning"}>
                  <div className="fw-semibold">Filter result</div>
                  <div className="small">
                    Date range: <code>{previewData.dateStart || "—"}</code> to <code>{previewData.dateEnd || "—"}</code>
                    <br />
                    Total rows in file: <code>{previewData.totalBeforeFilter}</code>
                    <br />
                    Rows matching filter: <code>{previewData.filteredCount}</code>
                    {previewData.excludedCount > 0 && (
                      <> · Excluded: <code>{previewData.excludedCount}</code></>
                    )}
                  </div>
                </Alert>
                {previewData.filteredCount > 0 ? (
                  <div>
                    <div className="fw-semibold mb-2">Sample rows (first 20)</div>
                    <div className="table-responsive" style={{ maxHeight: 320, overflow: "auto" }}>
                      <Table size="sm" bordered hover>
                        <thead className="table-light sticky-top">
                          <tr>
                            {(previewData.headers || []).slice(0, 8).map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(previewData.sampleRows || []).map((r, idx) => (
                            <tr key={idx}>
                              {(previewData.headers || []).slice(0, 8).map((h) => (
                                <td key={h}>{String(r?.[h] ?? "")}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted small mb-0">
                    No rows match the selected date range. Try adjusting the start or end date.
                  </p>
                )}
              </>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </Modal.Footer>
        </Modal>

        <Modal show={addressMappingOpen} onHide={() => setAddressMappingOpen(false)} size="xl" centered scrollable>
          <Modal.Header closeButton>
            <Modal.Title>Address mapping (dry run)</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="small text-muted mb-3">
              Verify that addresses are mapped correctly from SAP before running the actual migration.
            </p>
            <div className="table-responsive" style={{ maxHeight: 400, overflow: "auto" }}>
              <Table size="sm" bordered hover>
                <thead className="table-light sticky-top">
                  <tr>
                    <th>#</th>
                    <th>SAP ID</th>
                    <th>Row ID</th>
                    <th>Mapped address</th>
                  </tr>
                </thead>
                <tbody>
                  {(applyResult?.results || [])
                    .filter((r) => r.status === "DRY_RUN")
                    .map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.rowIndex + 1}</td>
                        <td><code>{r.sapId ?? "—"}</code></td>
                        <td>{r.rowId}</td>
                        <td className={r.address === "—" ? "text-muted" : ""} title={r.address}>
                          {r.address === "—" ? (
                            <span className="fst-italic">No address</span>
                          ) : (
                            <span style={{ maxWidth: 400 }} className="text-break d-inline-block">
                              {r.address}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setAddressMappingOpen(false)}>
              Close
            </Button>
          </Modal.Footer>
        </Modal>
      </Card.Body>
    </Card>
  );
}

