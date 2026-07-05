import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Form, Row, Table } from "react-bootstrap";
import { uploadFile } from "../../../lib/supabase/storage";
import { cloneDefaultWorkerSchedule, WEEK_DAYS } from "../../../lib/technicians/employeeProfile";

const fieldValue = (values, key, fallback = "") => values?.[key] ?? fallback;

export const EmploymentTab = ({ initialValues, onSubmit, disabled = false }) => {
  const [formData, setFormData] = useState({
    employee_type: "",
    job_title: "",
    department: "",
    hire_date: "",
    original_hire_date: "",
    adjusted_service_date: "",
    industry_start_date: "",
    manager_supervisor: "",
    group_assignment: "",
    release_date: "",
  });

  useEffect(() => {
    setFormData({
      employee_type: fieldValue(initialValues, "employee_type"),
      job_title: fieldValue(initialValues, "job_title"),
      department: fieldValue(initialValues, "department"),
      hire_date: fieldValue(initialValues, "hire_date"),
      original_hire_date: fieldValue(initialValues, "original_hire_date"),
      adjusted_service_date: fieldValue(initialValues, "adjusted_service_date"),
      industry_start_date: fieldValue(initialValues, "industry_start_date"),
      manager_supervisor: fieldValue(initialValues, "manager_supervisor"),
      group_assignment: fieldValue(initialValues, "group_assignment"),
      release_date: fieldValue(initialValues, "release_date"),
    });
  }, [initialValues]);

  const updateField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  return (
    <Form onSubmit={(event) => { event.preventDefault(); onSubmit(formData); }}>
      <Row className="g-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Employee Type</Form.Label>
            <Form.Select value={formData.employee_type} onChange={(event) => updateField("employee_type", event.target.value)} disabled={disabled}>
              <option value="">Select type</option>
              <option value="Full Time">Full Time</option>
              <option value="Part Time">Part Time</option>
              <option value="Contract">Contract</option>
              <option value="Subcontractor">Subcontractor</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Job Title</Form.Label>
            <Form.Control value={formData.job_title} onChange={(event) => updateField("job_title", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Department</Form.Label>
            <Form.Control value={formData.department} onChange={(event) => updateField("department", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Manager/Supervisor</Form.Label>
            <Form.Control value={formData.manager_supervisor} onChange={(event) => updateField("manager_supervisor", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Group Assignment</Form.Label>
            <Form.Control value={formData.group_assignment} onChange={(event) => updateField("group_assignment", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Hire Date</Form.Label>
            <Form.Control type="date" value={formData.hire_date || ""} onChange={(event) => updateField("hire_date", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Original Hire Date</Form.Label>
            <Form.Control type="date" value={formData.original_hire_date || ""} onChange={(event) => updateField("original_hire_date", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Adjusted Service Date</Form.Label>
            <Form.Control type="date" value={formData.adjusted_service_date || ""} onChange={(event) => updateField("adjusted_service_date", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Industry Start Date</Form.Label>
            <Form.Control type="date" value={formData.industry_start_date || ""} onChange={(event) => updateField("industry_start_date", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Release Date</Form.Label>
            <Form.Control type="date" value={formData.release_date || ""} onChange={(event) => updateField("release_date", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
      </Row>
      <div className="d-flex justify-content-end mt-4">
        <Button type="submit" disabled={disabled}>Save Worker</Button>
      </div>
    </Form>
  );
};

export const AccessTab = ({ initialValues, onSubmit, disabled = false }) => {
  const [formData, setFormData] = useState({
    is_active: true,
    is_admin: false,
    is_field_worker: true,
    access_notes: "",
  });

  useEffect(() => {
    setFormData({
      is_active: fieldValue(initialValues, "is_active", true),
      is_admin: fieldValue(initialValues, "is_admin", false),
      is_field_worker: fieldValue(initialValues, "is_field_worker", true),
      access_notes: fieldValue(initialValues, "access_notes"),
    });
  }, [initialValues]);

  const updateField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  return (
    <Form onSubmit={(event) => { event.preventDefault(); onSubmit(formData); }}>
      <Alert variant="info">Account role and active status still sync from the Personal tab. These toggles store extra access metadata for the technician profile.</Alert>
      <Row className="g-3">
        <Col md={4}>
          <Form.Check type="switch" id="technician-access-active" label="Active" checked={formData.is_active} onChange={(event) => updateField("is_active", event.target.checked)} disabled={disabled} />
        </Col>
        <Col md={4}>
          <Form.Check type="switch" id="technician-access-admin" label="Admin Access" checked={formData.is_admin} onChange={(event) => updateField("is_admin", event.target.checked)} disabled={disabled} />
        </Col>
        <Col md={4}>
          <Form.Check type="switch" id="technician-access-field" label="Field Worker" checked={formData.is_field_worker} onChange={(event) => updateField("is_field_worker", event.target.checked)} disabled={disabled} />
        </Col>
        <Col md={12}>
          <Form.Group>
            <Form.Label>Access Notes</Form.Label>
            <Form.Control as="textarea" rows={4} value={formData.access_notes} onChange={(event) => updateField("access_notes", event.target.value)} disabled={disabled} />
          </Form.Group>
        </Col>
      </Row>
      <div className="d-flex justify-content-end mt-4">
        <Button type="submit" disabled={disabled}>Save Worker</Button>
      </div>
    </Form>
  );
};

export const PayrollTab = ({ initialValues, onSubmit, disabled = false, userId = "" }) => {
  const [formData, setFormData] = useState({
    nickname: "",
    regular_rate_hour: "",
    regular_rate_job: "",
    commission_rate: "",
    calculate_overtime: "",
    overtime1_starts_after: "",
    overtime1_rate: "",
    overtime2_starts_after: "",
    overtime2_rate: "",
  });

  useEffect(() => {
    setFormData({
      nickname: fieldValue(initialValues, "nickname"),
      regular_rate_hour: String(fieldValue(initialValues, "regular_rate_hour")),
      regular_rate_job: String(fieldValue(initialValues, "regular_rate_job")),
      commission_rate: String(fieldValue(initialValues, "commission_rate")),
      calculate_overtime: fieldValue(initialValues, "calculate_overtime"),
      overtime1_starts_after: String(fieldValue(initialValues, "overtime1_starts_after")),
      overtime1_rate: String(fieldValue(initialValues, "overtime1_rate")),
      overtime2_starts_after: String(fieldValue(initialValues, "overtime2_starts_after")),
      overtime2_rate: String(fieldValue(initialValues, "overtime2_rate")),
    });
  }, [initialValues]);

  const updateField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));
  const submitData = {
    ...formData,
    employee_id: userId || fieldValue(initialValues, "employee_id"),
    regular_rate_hour: Number(formData.regular_rate_hour) || 0,
    regular_rate_job: Number(formData.regular_rate_job) || 0,
    commission_rate: Number(formData.commission_rate) || 0,
    overtime1_starts_after: formData.overtime1_starts_after === "" ? null : Number(formData.overtime1_starts_after),
    overtime1_rate: Number(formData.overtime1_rate) || 0,
    overtime2_starts_after: formData.overtime2_starts_after === "" ? null : Number(formData.overtime2_starts_after),
    overtime2_rate: Number(formData.overtime2_rate) || 0,
  };

  return (
    <Form onSubmit={(event) => { event.preventDefault(); onSubmit(submitData); }}>
      <Row className="g-3">
        <Col md={6}><Form.Group><Form.Label>Nickname</Form.Label><Form.Control value={formData.nickname} onChange={(event) => updateField("nickname", event.target.value)} disabled={disabled} /></Form.Group></Col>
        <Col md={4}><Form.Group><Form.Label>Regular Rate / Hour</Form.Label><Form.Control type="number" step="0.01" value={formData.regular_rate_hour} onChange={(event) => updateField("regular_rate_hour", event.target.value)} disabled={disabled} /></Form.Group></Col>
        <Col md={4}><Form.Group><Form.Label>Regular Rate / Job</Form.Label><Form.Control type="number" step="0.01" value={formData.regular_rate_job} onChange={(event) => updateField("regular_rate_job", event.target.value)} disabled={disabled} /></Form.Group></Col>
        <Col md={4}><Form.Group><Form.Label>Commission Rate</Form.Label><Form.Control type="number" step="0.0001" value={formData.commission_rate} onChange={(event) => updateField("commission_rate", event.target.value)} disabled={disabled} /></Form.Group></Col>
        <Col md={4}>
          <Form.Group>
            <Form.Label>Calculate Overtime</Form.Label>
            <Form.Select value={formData.calculate_overtime} onChange={(event) => updateField("calculate_overtime", event.target.value)} disabled={disabled}>
              <option value="">No overtime rule</option>
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={4}><Form.Group><Form.Label>Overtime 1 Starts After</Form.Label><Form.Control type="number" step="0.01" value={formData.overtime1_starts_after} onChange={(event) => updateField("overtime1_starts_after", event.target.value)} disabled={disabled} /></Form.Group></Col>
        <Col md={4}><Form.Group><Form.Label>Overtime 1 Rate</Form.Label><Form.Control type="number" step="0.01" value={formData.overtime1_rate} onChange={(event) => updateField("overtime1_rate", event.target.value)} disabled={disabled} /></Form.Group></Col>
        <Col md={6}><Form.Group><Form.Label>Overtime 2 Starts After</Form.Label><Form.Control type="number" step="0.01" value={formData.overtime2_starts_after} onChange={(event) => updateField("overtime2_starts_after", event.target.value)} disabled={disabled} /></Form.Group></Col>
        <Col md={6}><Form.Group><Form.Label>Overtime 2 Rate</Form.Label><Form.Control type="number" step="0.01" value={formData.overtime2_rate} onChange={(event) => updateField("overtime2_rate", event.target.value)} disabled={disabled} /></Form.Group></Col>
      </Row>
      <div className="d-flex justify-content-end mt-4">
        <Button type="submit" disabled={disabled}>Save Worker</Button>
      </div>
    </Form>
  );
};

export const EmployeeScheduleTab = ({ initialValues, onSubmit, disabled = false }) => {
  const [schedule, setSchedule] = useState(cloneDefaultWorkerSchedule());

  useEffect(() => {
    setSchedule(initialValues && Object.keys(initialValues).length > 0 ? initialValues : cloneDefaultWorkerSchedule());
  }, [initialValues]);

  const updateDay = (dayKey, field, value) => {
    setSchedule((prev) => ({
      ...prev,
      [dayKey]: {
        ...(prev[dayKey] || cloneDefaultWorkerSchedule()[dayKey]),
        [field]: value,
      },
    }));
  };

  return (
    <Form onSubmit={(event) => { event.preventDefault(); onSubmit(schedule); }}>
      <Table responsive bordered hover className="align-middle">
        <thead>
          <tr>
            <th>Day</th>
            <th>Working</th>
            <th>First Shift Start</th>
            <th>First Shift End</th>
            <th>Second Shift Start</th>
            <th>Second Shift End</th>
          </tr>
        </thead>
        <tbody>
          {WEEK_DAYS.map((day) => {
            const daySchedule = schedule[day.key] || {};
            return (
              <tr key={day.key}>
                <td className="fw-semibold">{day.label}</td>
                <td><Form.Check type="switch" checked={Boolean(daySchedule.isWorking)} onChange={(event) => updateDay(day.key, "isWorking", event.target.checked)} disabled={disabled} /></td>
                <td><Form.Control type="time" value={daySchedule.firstStart || ""} onChange={(event) => updateDay(day.key, "firstStart", event.target.value)} disabled={disabled || !daySchedule.isWorking} /></td>
                <td><Form.Control type="time" value={daySchedule.firstEnd || ""} onChange={(event) => updateDay(day.key, "firstEnd", event.target.value)} disabled={disabled || !daySchedule.isWorking} /></td>
                <td><Form.Control type="time" value={daySchedule.secondStart || ""} onChange={(event) => updateDay(day.key, "secondStart", event.target.value)} disabled={disabled || !daySchedule.isWorking} /></td>
                <td><Form.Control type="time" value={daySchedule.secondEnd || ""} onChange={(event) => updateDay(day.key, "secondEnd", event.target.value)} disabled={disabled || !daySchedule.isWorking} /></td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <div className="d-flex justify-content-end mt-4">
        <Button type="submit" disabled={disabled}>Save Worker</Button>
      </div>
    </Form>
  );
};

export const DocumentsTab = ({ documents = [], onUpload, onDelete, technicianId, disabled = false }) => {
  const [file, setFile] = useState(null);
  const [formData, setFormData] = useState({
    document_type: "",
    name: "",
    document_number: "",
    expiration_date: "",
    notify_before_expiry: false,
    description: "",
  });
  const [isUploading, setIsUploading] = useState(false);

  const documentRows = useMemo(() => documents || [], [documents]);
  const updateField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.name.trim()) return;

    setIsUploading(true);
    try {
      let uploadResult = {};
      if (file) {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const storagePath = `technicians/${technicianId}/${timestamp}-${safeName}`;
        uploadResult = await uploadFile("documents", storagePath, file, { upsert: false });
      }

      await onUpload({
        ...formData,
        file_name: file?.name || null,
        file_type: file?.type || null,
        file_size: file?.size || null,
        storage_bucket: "documents",
        storage_path: uploadResult.path || null,
        file_url: uploadResult.url || null,
      });

      setFile(null);
      setFormData({
        document_type: "",
        name: "",
        document_number: "",
        expiration_date: "",
        notify_before_expiry: false,
        description: "",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <Form onSubmit={handleSubmit}>
        <Row className="g-3">
          <Col md={4}><Form.Group><Form.Label>Document Type</Form.Label><Form.Control value={formData.document_type} onChange={(event) => updateField("document_type", event.target.value)} disabled={disabled} /></Form.Group></Col>
          <Col md={4}><Form.Group><Form.Label>Name</Form.Label><Form.Control value={formData.name} onChange={(event) => updateField("name", event.target.value)} disabled={disabled} required /></Form.Group></Col>
          <Col md={4}><Form.Group><Form.Label>Document Number</Form.Label><Form.Control value={formData.document_number} onChange={(event) => updateField("document_number", event.target.value)} disabled={disabled} /></Form.Group></Col>
          <Col md={4}><Form.Group><Form.Label>Expiration Date</Form.Label><Form.Control type="date" value={formData.expiration_date || ""} onChange={(event) => updateField("expiration_date", event.target.value)} disabled={disabled} /></Form.Group></Col>
          <Col md={4}><Form.Group><Form.Label>File</Form.Label><Form.Control type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={disabled || !technicianId} /></Form.Group></Col>
          <Col md={4} className="d-flex align-items-end"><Form.Check type="switch" id="notify-before-expiry" label="Notify before expiry" checked={formData.notify_before_expiry} onChange={(event) => updateField("notify_before_expiry", event.target.checked)} disabled={disabled} /></Col>
          <Col md={12}><Form.Group><Form.Label>Description</Form.Label><Form.Control as="textarea" rows={3} value={formData.description} onChange={(event) => updateField("description", event.target.value)} disabled={disabled} /></Form.Group></Col>
        </Row>
        <div className="d-flex justify-content-end mt-4">
          <Button type="submit" disabled={disabled || isUploading || !technicianId}>{isUploading ? "Uploading..." : "Save Document"}</Button>
        </div>
      </Form>

      <Table responsive hover className="mt-4 align-middle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Expiration</th>
            <th>File</th>
            <th className="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documentRows.length === 0 ? (
            <tr><td colSpan={5} className="text-muted text-center">No documents saved yet.</td></tr>
          ) : documentRows.map((document) => (
            <tr key={document.id}>
              <td>{document.name}</td>
              <td>{document.document_type || "-"}</td>
              <td>{document.expiration_date || "-"}</td>
              <td>{document.file_url ? <a href={document.file_url} target="_blank" rel="noreferrer">Open</a> : "-"}</td>
              <td className="text-end">
                <Button variant="outline-danger" size="sm" onClick={() => onDelete(document.id)} disabled={disabled}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

export const OtherDetailsTab = ({ initialValues, onSubmit, disabled = false }) => {
  const [formData, setFormData] = useState({
    language_preference: "English (US)",
    notes: "",
  });

  useEffect(() => {
    setFormData({
      language_preference: fieldValue(initialValues, "language_preference", "English (US)"),
      notes: fieldValue(initialValues, "notes"),
    });
  }, [initialValues]);

  return (
    <Form onSubmit={(event) => { event.preventDefault(); onSubmit(formData); }}>
      <Row className="g-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Language Preference</Form.Label>
            <Form.Control value={formData.language_preference} onChange={(event) => setFormData((prev) => ({ ...prev, language_preference: event.target.value }))} disabled={disabled} />
          </Form.Group>
        </Col>
        <Col md={12}>
          <Form.Group>
            <Form.Label>Notes</Form.Label>
            <Form.Control as="textarea" rows={6} value={formData.notes} onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))} disabled={disabled} />
          </Form.Group>
        </Col>
      </Row>
      <div className="d-flex justify-content-end mt-4">
        <Button type="submit" disabled={disabled}>Save Worker</Button>
      </div>
    </Form>
  );
};
