import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';

function contactPersonInitial(d) {
  if (!d) return '';
  const emp = Array.isArray(d.ContactEmployees) ? d.ContactEmployees[0] : null;
  if (emp) {
    const combined = [emp.FirstName, emp.LastName].filter(Boolean).join(' ').trim();
    if (combined && combined !== '—') return combined;
    if (emp.Name && emp.Name !== '—') return emp.Name;
  }
  return typeof d.ContactPerson === 'string' ? d.ContactPerson.trim() : '';
}

function stripPlaceholderAddress(addr) {
  const s = String(addr || '').trim();
  if (!s || s.toUpperCase() === 'N/A') return '';
  return s;
}

/**
 * PATCH masterlist-backed customer or SAP lead (Supabase row).
 * @param {'customer' | 'lead'} mode
 * @param {string} code CardCode / lead_code
 * @param {object} customerData — SAP-shaped bundle from shim (AccountInfoTab)
 */
export function MasterlistEntityEditModal({ show, onHide, mode, code, customerData, onSaved }) {
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show || !customerData) return;
    setCompanyName(String(customerData.CardName || '').trim());
    setContactPerson(contactPersonInitial(customerData));
    setPhone(String(customerData.Phone1 || '').trim());
    setEmail(String(customerData.EmailAddress || '').trim());
    setAddress(
      stripPlaceholderAddress(
        customerData.MailAddress || customerData.Street || customerData.Address || ''
      )
    );
  }, [show, customerData]);

  const title = mode === 'customer' ? 'Edit customer (masterlist)' : 'Edit SAP lead (masterlist)';
  const companyLabel = mode === 'customer' ? 'Company name' : 'Lead name';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code) return;
    setSaving(true);
    try {
      const path =
        mode === 'customer'
          ? `/api/customers/masterlist/${encodeURIComponent(String(code).trim())}`
          : `/api/leads/masterlist/${encodeURIComponent(String(code).trim())}`;

      const nameKey = mode === 'customer' ? 'customer_name' : 'lead_name';
      const addrKey = mode === 'customer' ? 'customer_address' : 'lead_address';

      const res = await fetch(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [nameKey]: companyName.trim(),
          phone_number: phone.trim(),
          email: email.trim(),
          [addrKey]: address.trim(),
          contact_person: contactPerson.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || `Save failed (${res.status})`);
      }
      toast.success(mode === 'customer' ? 'Customer updated.' : 'Lead updated.');
      onSaved?.();
      onHide();
    } catch (err) {
      console.error('Masterlist save:', err);
      toast.error(err.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={saving ? undefined : onHide} centered size="lg">
      <Modal.Header closeButton={!saving}>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Changes are saved to the portal database (imported masterlist). They do not push to SAP
            Business One automatically.
          </p>
          <Form.Group className="mb-3" controlId="mlm-company">
            <Form.Label>{companyLabel}</Form.Label>
            <Form.Control
              value={companyName}
              onChange={(ev) => setCompanyName(ev.target.value)}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="mlm-contact">
            <Form.Label>Contact person</Form.Label>
            <Form.Control
              value={contactPerson}
              onChange={(ev) => setContactPerson(ev.target.value)}
              placeholder="Full name"
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="mlm-phone">
            <Form.Label>Phone</Form.Label>
            <Form.Control
              value={phone}
              onChange={(ev) => setPhone(ev.target.value)}
              placeholder="Main phone (BP / lead row)"
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="mlm-email">
            <Form.Label>Email</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="Main email (BP / lead row)"
            />
          </Form.Group>
          <Form.Group className="mb-0" controlId="mlm-address">
            <Form.Label>Default address (single line)</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={address}
              onChange={(ev) => setAddress(ev.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" type="button" disabled={saving} onClick={onHide}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
