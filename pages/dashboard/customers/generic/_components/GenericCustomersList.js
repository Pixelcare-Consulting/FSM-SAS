import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Button, Badge, Spinner, Alert, Modal, Form } from 'react-bootstrap';
import Link from 'next/link';
import { GeeksSEO } from 'widgets';
import { Pencil, Trash2, Plus, ArrowLeft } from 'react-bootstrap-icons';

const GenericCustomersList = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ customer_name: '', customer_code: '', customer_address: '', phone_number: '', email: '' });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customers/generic', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to load');
      setCustomers(data.customers || []);
    } catch (e) {
      setError(e.message);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const openEdit = (c) => {
    setSelected(c);
    setFormData({
      customer_name: c.customer_name || '',
      customer_code: c.customer_code || '',
      customer_address: c.customer_address || '',
      phone_number: c.phone_number || '',
      email: c.email || ''
    });
    setEditModal(true);
  };

  const openDelete = (c) => {
    setSelected(c);
    setDeleteModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selected?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/generic/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Update failed');
      setEditModal(false);
      setSelected(null);
      fetchCustomers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/generic/${selected.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Delete failed');
      setDeleteModal(false);
      setSelected(null);
      fetchCustomers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <GeeksSEO title="Portal Customers | SAS M&E Portal" />
      <Row>
        <Col lg={12} md={12} sm={12}>
          <div
            style={{
              background: 'linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)',
              padding: '1.5rem 2rem',
              borderRadius: '0 0 24px 24px',
              marginTop: '-39px',
              marginLeft: '10px',
              marginRight: '10px',
              marginBottom: '20px'
            }}
          >
            <div className="d-flex justify-content-between align-items-start">
              <div className="d-flex flex-column">
                <h1 className="mb-2" style={{ fontSize: '28px', fontWeight: '600', color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                  Portal Customers
                </h1>
                <p className="mb-2" style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.7)', fontWeight: '400', lineHeight: '1.5' }}>
                  Manage customers created in the portal (saved in Supabase), including those converted from leads. Create jobs using these customers without SAP. Codes use CP00001-style numbering.
                </p>
                <nav style={{ fontSize: '14px', fontWeight: '500' }}>
                  <div className="d-flex align-items-center">
                    <i className="fe fe-home" style={{ color: 'rgba(255, 255, 255, 0.7)' }}></i>
                    <Link href="/dashboard" className="text-decoration-none ms-2" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Dashboard</Link>
                    <span className="mx-2" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>/</span>
                    <Link href="/dashboard/customers/list" className="text-decoration-none" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Customers</Link>
                    <span className="mx-2" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>/</span>
                    <span className="ms-2" style={{ color: '#FFFFFF' }}>Portal Customers</span>
                  </div>
                </nav>
              </div>
              <div className="d-flex gap-2">
                <Link
                  href="/dashboard/customers/create"
                  className="btn btn-light btn-sm d-flex align-items-center gap-2"
                  style={{ borderRadius: '8px', padding: '8px 16px', fontWeight: '500', textDecoration: 'none' }}
                >
                  <Plus size={18} /> Add Customer
                </Link>
                <Link
                  href="/dashboard/customers/list"
                  className="btn btn-outline-light btn-sm d-flex align-items-center gap-2"
                  style={{ borderRadius: '8px', padding: '8px 16px', fontWeight: '500', textDecoration: 'none' }}
                >
                  <ArrowLeft size={18} /> Back to Customers
                </Link>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <Row>
        <Col md={12} className="mb-5">
          {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
          <Card className="border-0 shadow-sm">
            <Card.Body>
              {loading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" /> <span className="ms-2">Loading portal customers...</span>
                </div>
              ) : customers.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <p className="mb-3">No portal customers yet.</p>
                  <Link href="/dashboard/customers/create" className="btn btn-primary">Create first customer</Link>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <tr>
                        <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Code</th>
                        <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Name</th>
                        <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Address</th>
                        <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Phone</th>
                        <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Email</th>
                        <th className="text-end" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#475569', width: '120px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => (
                        <tr
                          key={c.id}
                          style={{ borderBottom: '1px solid #f0f0f0', transition: 'all 0.2s ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                        >
                          <td style={{ padding: '12px 16px' }}><Badge bg="secondary" style={{ fontSize: '11px', fontWeight: '500' }}>{c.customer_code}</Badge></td>
                          <td style={{ padding: '12px 16px', fontSize: '13px' }}>{c.customer_name}</td>
                          <td className="text-muted" style={{ padding: '12px 16px', fontSize: '13px', maxWidth: '200px' }}>{c.customer_address || '–'}</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px' }}>{c.phone_number || '–'}</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px' }}>{c.email || '–'}</td>
                          <td className="text-end" style={{ padding: '12px 16px' }}>
                            <Button variant="outline-primary" size="sm" className="me-2" onClick={() => openEdit(c)}><Pencil /></Button>
                            <Button variant="outline-danger" size="sm" onClick={() => openDelete(c)}><Trash2 /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Modal show={editModal} onHide={() => { setEditModal(false); setSelected(null); }} centered>
        <Modal.Header closeButton><Modal.Title>Edit Customer</Modal.Title></Modal.Header>
        <Form onSubmit={handleUpdate}>
          <Modal.Body>
            <Form.Group className="mb-2">
              <Form.Label>Customer Code</Form.Label>
              <Form.Control
                value={formData.customer_code}
                onChange={(e) => setFormData((p) => ({ ...p, customer_code: e.target.value }))}
                placeholder="e.g. GEN-XXX"
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                value={formData.customer_name}
                onChange={(e) => setFormData((p) => ({ ...p, customer_name: e.target.value }))}
                required
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Address</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={formData.customer_address}
                onChange={(e) => setFormData((p) => ({ ...p, customer_address: e.target.value }))}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Phone</Form.Label>
              <Form.Control
                value={formData.phone_number}
                onChange={(e) => setFormData((p) => ({ ...p, phone_number: e.target.value }))}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => { setEditModal(false); setSelected(null); }}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={deleteModal} onHide={() => { setDeleteModal(false); setSelected(null); }} centered>
        <Modal.Header closeButton><Modal.Title>Delete Customer</Modal.Title></Modal.Header>
        <Modal.Body>
          Are you sure you want to delete <strong>{selected?.customer_name}</strong> ({selected?.customer_code})? This cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setDeleteModal(false); setSelected(null); }}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default GenericCustomersList;
