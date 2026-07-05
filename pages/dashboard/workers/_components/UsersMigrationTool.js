import React, { useMemo, useState } from "react";
import { Card, Button, Form, Row, Col, Alert, Table, Spinner, Badge, Modal } from "react-bootstrap";
import toast from "react-hot-toast";

export default function UsersMigrationTool() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  const [applyLimit, setApplyLimit] = useState(50);
  const [dryRun, setDryRun] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [skipExisting, setSkipExisting] = useState(true);

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
      const r = await fetch("/api/users/migration/upload", { method: "POST", body: fd });
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

  const onPreview = async () => {
    const uploadId = uploadResult?.upload?.id;
    if (!uploadId) {
      toast.error("Upload a file first.");
      return;
    }
    setPreviewLoading(true);
    setPreviewData(null);
    setPreviewOpen(true);
    try {
      const r = await fetch("/api/users/migration/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
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
        dryRun,
        skipExisting,
      };

      const r = await fetch("/api/users/migration/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Apply failed");
      setApplyResult(j);
      if (j.counts?.failed > 0) {
        toast(
          j.counts.failed === j.counts.total
            ? `All ${j.counts.total} rows failed. Check errors below.`
            : `${j.counts.created} created, ${j.counts.failed} failed.`,
          { icon: "⚠️" }
        );
      } else {
        toast.success(
          dryRun
            ? `Dry run OK. Checked: ${j.counts.total}`
            : `Applied. Created: ${j.counts.created}, Skipped: ${j.counts.skipped}`
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
              <div className="fw-semibold">User Accounts Migration (Excel)</div>
              <div className="small">
                Upload <strong>FSM User ID &amp; Password.xlsx</strong> from <code>public/sample-migration/</code> to
                create technician and admin accounts. Passwords from the Excel are used as-is. Start with{" "}
                <b>Dry run</b>, then apply in batches. Run{" "}
                <code>lib/supabase/migrations/create_user_migration_upload_table.sql</code> in Supabase first.
              </div>
            </div>
            <Badge bg="secondary">Staging: user_migration_upload</Badge>
          </div>
        </Alert>

        <Row className="g-3 align-items-end">
          <Col md={8}>
            <Form.Group>
              <Form.Label>Excel file (.xlsx) — FSM User ID &amp; Password</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
              <Form.Text>
                Expected columns: <code>Login</code>, <code>Password</code>, <code>User Name</code>,{" "}
                <code>Optional</code> (FW = Technician, FW &amp; Admin = Admin)
              </Form.Text>
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
                <Button variant="outline-primary" size="sm" onClick={onPreview} disabled={previewLoading || applying}>
                  {previewLoading ? <Spinner size="sm" className="me-1" /> : null} Preview
                </Button>
              </div>
            </Alert>

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
                    label="Skip existing users"
                    checked={skipExisting}
                    onChange={(e) => setSkipExisting(e.target.checked)}
                    disabled={applying}
                  />
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
                  "Apply (creates user accounts)"
                )}
              </Button>
            </div>

            {!!headers.length && (
              <div className="mt-4">
                <div className="fw-semibold mb-2">Detected headers</div>
                <div style={{ maxHeight: 100, overflow: "auto" }} className="border rounded p-2 bg-light">
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
                        {["Optional", "User Name", "Login", "Password", "Primary Phone Number"].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.sampleRows.map((r, idx) => (
                        <tr key={idx}>
                          <td>{String(r?.Optional ?? "")}</td>
                          <td>{String(r?.["User Name"] ?? "")}</td>
                          <td>{String(r?.Login ?? "")}</td>
                          <td className="text-muted">••••••</td>
                          <td>{String(r?.["Primary Phone Number"] ?? "")}</td>
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
                  <div className="fw-semibold">Apply result</div>
                  <div className="small">
                    Created: <code>{applyResult.counts.created}</code> · Skipped:{" "}
                    <code>{applyResult.counts.skipped}</code> · Failed: <code>{applyResult.counts.failed}</code> · Total:{" "}
                    <code>{applyResult.counts.total}</code>
                  </div>
                </Alert>
                {applyResult.counts.failed > 0 && applyResult.results?.length > 0 ? (
                  <div className="mt-3">
                    <div className="fw-semibold mb-2">Failed rows (first 15)</div>
                    <ul className="small mb-0" style={{ maxHeight: 220, overflowY: "auto" }}>
                      {applyResult.results
                        .filter((r) => r.status === "FAILED" && r.error)
                        .slice(0, 15)
                        .map((r, idx) => (
                          <li key={idx}>
                            <strong>Row {r.rowIndex + 1}</strong> ({r.email || r.rowId}): {r.error}
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
            <Modal.Title>User migration preview</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {previewLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" />
                <p className="mt-2 mb-0 small text-muted">Loading…</p>
              </div>
            ) : previewData?.error ? (
              <Alert variant="danger">{previewData.error}</Alert>
            ) : previewData ? (
              <>
                <Alert variant="success">
                  <div className="fw-semibold">Total rows: {previewData.totalCount}</div>
                </Alert>
                {previewData.totalCount > 0 ? (
                  <div className="table-responsive" style={{ maxHeight: 320, overflow: "auto" }}>
                    <Table size="sm" bordered hover>
                      <thead className="table-light sticky-top">
                        <tr>
                          {(previewData.headers || []).slice(0, 6).map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(previewData.sampleRows || []).map((r, idx) => (
                          <tr key={idx}>
                            {(previewData.headers || []).slice(0, 6).map((h) => (
                              <td key={h}>
                                {h === "Password" ? "••••••" : String(r?.[h] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                ) : null}
              </>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </Modal.Footer>
        </Modal>
      </Card.Body>
    </Card>
  );
}
