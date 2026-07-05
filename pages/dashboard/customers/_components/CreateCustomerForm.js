import React, { useState, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Form,
  Button,
  Spinner,
  Alert,
  Modal
} from 'react-bootstrap';
import { useRouter } from 'next/router';
import { PeopleFill, GeoAlt, PersonLinesFill } from 'react-bootstrap-icons';

const SERIES_OPTIONS = [
  { value: 71, label: 'Lead' }
];

const CARDTYPE_OPTIONS = [
  { value: 'cLid', label: 'Lead' }
];

const VALID_OPTIONS = [
  { value: 'tYES', label: 'Valid' },
  { value: 'tNO', label: 'Invalid' }
];

const FROZEN_OPTIONS = [
  { value: 'tNO', label: 'Active' },
  { value: 'tYES', label: 'Frozen' }
];

const ADDRESS_TYPE_OPTIONS = [
  { value: 'bo_BillTo', label: 'Bill To' },
  { value: 'bo_ShipTo', label: 'Ship To' }
];

const defaultAddress = (addressType) => ({
  AddressName: '',
  AddressName2: null,
  AddressName3: null,
  StreetNo: null,
  Street: '',
  Block: null,
  BuildingFloorRoom: '',
  Country: 'SG',
  State: 'SG',
  City: null,
  ZipCode: '',
  AddressType: addressType,
  U_Remarks: null
});

const defaultContact = () => ({
  Name: 'Contact1',
  Position: null,
  Phone1: '',
  Phone2: null,
  MobilePhone: null,
  Fax: null,
  E_Mail: '',
  FirstName: '',
  MiddleName: null,
  LastName: ''
});

export default function CreateCustomerForm() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successCardCode, setSuccessCardCode] = useState(null);
  const [cardName, setCardName] = useState('');
  const [series, setSeries] = useState(71);
  const [cardType, setCardType] = useState('cLid');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [fax, setFax] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [freeText, setFreeText] = useState('');
  const [valid, setValid] = useState('tYES');
  const [frozen, setFrozen] = useState('tNO');

  const [addresses, setAddresses] = useState(() => [
    defaultAddress('bo_BillTo'),
    defaultAddress('bo_ShipTo')
  ]);

  const [contacts, setContacts] = useState(() => [defaultContact()]);

  const updateAddress = useCallback((index, field, value) => {
    setAddresses(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value === '' ? null : value };
      return next;
    });
  }, []);

  const updateContact = useCallback((index, field, value) => {
    setContacts(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value === '' ? null : value };
      return next;
    });
  }, []);

  const addContact = useCallback(() => {
    setContacts(prev => [...prev, defaultContact()]);
  }, []);

  const removeContact = useCallback((index) => {
    if (contacts.length <= 1) return;
    setContacts(prev => prev.filter((_, i) => i !== index));
  }, [contacts.length]);

  const copyBillToToShipTo = useCallback(() => {
    setAddresses(prev => {
      const billTo = prev[0];
      if (!billTo) return prev;
      const next = [...prev];
      const shipTo = { ...billTo, AddressType: 'bo_ShipTo' };
      shipTo.AddressName = (billTo.AddressName || '').trim() ? `${(billTo.AddressName || '').trim()} - T` : '';
      next[1] = shipTo;
      return next;
    });
  }, []);

  const buildPayload = useCallback(() => {
    const payload = {
      Series: series,
      CardName: cardName.trim(),
      CardType: cardType,
      Phone1: phone1 || null,
      Phone2: phone2 || null,
      Fax: fax || null,
      EmailAddress: emailAddress || null,
      ContactPerson: contactPerson || null,
      FreeText: freeText || null,
      Valid: valid,
      Frozen: frozen,
      BPAddresses: addresses.map(a => ({
        AddressName: a.AddressName,
        AddressName2: a.AddressName2,
        AddressName3: a.AddressName3,
        StreetNo: a.StreetNo,
        Street: a.Street,
        Block: a.Block,
        BuildingFloorRoom: a.BuildingFloorRoom,
        Country: a.Country || 'SG',
        State: a.State || 'SG',
        City: a.City,
        ZipCode: a.ZipCode,
        AddressType: a.AddressType,
        U_Remarks: a.U_Remarks
      }))
    };
    if (series === 70 && contacts.length > 0) {
      payload.ContactEmployees = contacts.map(c => ({
        Name: c.Name,
        Position: c.Position,
        Phone1: c.Phone1,
        Phone2: c.Phone2,
        MobilePhone: c.MobilePhone,
        Fax: c.Fax,
        E_Mail: c.E_Mail,
        FirstName: c.FirstName,
        MiddleName: c.MiddleName,
        LastName: c.LastName
      }));
    }
    return payload;
  }, [series, cardName, cardType, phone1, phone2, fax, emailAddress, contactPerson, freeText, valid, frozen, addresses, contacts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!cardName.trim()) {
      setMessage({ type: 'danger', text: 'Customer name (Card Name) is required.' });
      return;
    }
    if (!addresses[0]?.AddressName?.trim() || !addresses[0]?.Street?.trim()) {
      setMessage({ type: 'danger', text: 'At least one address with Address Name and Street is required.' });
      return;
    }
    if (series === 70) {
      const first = contacts[0];
      if (!first?.Name?.trim() || !first?.FirstName?.trim() || !first?.LastName?.trim()) {
        setMessage({ type: 'danger', text: 'For Customer (Series 70), at least one contact with Name, First Name and Last Name is required.' });
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/customers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data.message || data.error || 'Failed to create customer';
        const errList = data.errors?.length ? ` ${data.errors.join(', ')}` : '';
        setMessage({ type: 'danger', text: `${errMsg}${errList}` });
        return;
      }

      setSuccessCardCode(data.cardCode || null);
      setShowSuccessModal(true);
    } catch (err) {
      setMessage({ type: 'danger', text: err.message || 'Network error.' });
    } finally {
      setSubmitting(false);
    }
  };

  const isCustomer = series === 70;
  const router = useRouter();

  return (
    <>
      {message && (
        <Alert variant={message.type} onClose={() => setMessage(null)} dismissible>
          {message.text}
        </Alert>
      )}

      <Alert variant="info" className="mb-3">
        <strong>Portal only.</strong> Customers created here are saved in the portal database only and are <strong>not</strong> synced to SAP. Use Series &quot;Customer&quot; or &quot;Lead&quot; as needed; both are stored as portal-only.
      </Alert>

      <Form onSubmit={handleSubmit}>
        <Card className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white py-3">
            <Card.Title className="mb-0 d-flex align-items-center">
              <PeopleFill className="me-2 text-primary" />
              Customer / Lead Information
            </Card.Title>
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Customer Name (Card Name) <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    value={cardName}
                    onChange={e => setCardName(e.target.value)}
                    placeholder="e.g. Test Customer"
                    maxLength={100}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Series</Form.Label>
                  <Form.Select value={series} onChange={e => setSeries(Number(e.target.value))}>
                    {SERIES_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Card Type</Form.Label>
                  <Form.Select value={cardType} onChange={e => setCardType(e.target.value)}>
                    {CARDTYPE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Phone 1</Form.Label>
                  <Form.Control
                    value={phone1}
                    onChange={e => setPhone1(e.target.value)}
                    placeholder="e.g. 65-000-94248189"
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Phone 2 (Optional)</Form.Label>
                  <Form.Control value={phone2} onChange={e => setPhone2(e.target.value)} placeholder="Optional" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Fax (Optional)</Form.Label>
                  <Form.Control value={fax} onChange={e => setFax(e.target.value)} placeholder="Optional" />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Email (Optional)</Form.Label>
                  <Form.Control
                    type="email"
                    value={emailAddress}
                    onChange={e => setEmailAddress(e.target.value)}
                    placeholder="e.g. sample@gmail.com"
                  />
                </Form.Group>
              </Col>
              {/* <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Contact Person (Optional)</Form.Label>
                  <Form.Control
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    placeholder="Assigned Contact ID / default value"
                  />
                </Form.Group>
              </Col> */}
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Remarks (Free Text, Optional)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={freeText}
                    onChange={e => setFreeText(e.target.value)}
                    placeholder="Test Remarks"
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Valid</Form.Label>
                  <Form.Select value={valid} onChange={e => setValid(e.target.value)}>
                    {VALID_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Frozen</Form.Label>
                  <Form.Select value={frozen} onChange={e => setFrozen(e.target.value)}>
                    {FROZEN_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <Card className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white py-3">
            <Card.Title className="mb-0 d-flex align-items-center">
              <GeoAlt className="me-2 text-primary" />
              Addresses (Bill To & Ship To)
            </Card.Title>
            <small className="text-muted d-block mb-2">If only one address, use same details for both and add &quot;- T&quot; to Ship To Address Name.</small>
            <Button
              type="button"
              variant="primary"
              onClick={copyBillToToShipTo}
              className="d-inline-flex align-items-center gap-2 mt-1"
            >
              <GeoAlt className="me-1" />
              Copy Bill To address to Ship To (same address)
            </Button>
          </Card.Header>
          <Card.Body>
            {addresses.map((addr, idx) => (
              <div key={idx} className="mb-4 p-3 border rounded">
                  <h6 className="text-secondary mb-3">
                    {addr.AddressType === 'bo_BillTo' ? 'Bill To' : 'Ship To'} Address
                  </h6>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label className="small">Address Name</Form.Label>
                      <Form.Control
                        size="sm"
                        value={addr.AddressName}
                        onChange={e => updateAddress(idx, 'AddressName', e.target.value)}
                        placeholder="#01-03 SOHO HOUSE"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label className="small">Street</Form.Label>
                      <Form.Control
                        size="sm"
                        value={addr.Street}
                        onChange={e => updateAddress(idx, 'Street', e.target.value)}
                        placeholder="188 RACE COURSE ROAD"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label className="small">Building / Floor / Room</Form.Label>
                      <Form.Control
                        size="sm"
                        value={addr.BuildingFloorRoom}
                        onChange={e => updateAddress(idx, 'BuildingFloorRoom', e.target.value)}
                        placeholder="#01-03 SOHO HOUSE"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-2">
                      <Form.Label className="small">Country</Form.Label>
                      <Form.Select
                        size="sm"
                        value={addr.Country}
                        onChange={e => updateAddress(idx, 'Country', e.target.value)}
                      >
                        <option value="SG">SG</option>
                        <option value="GB">GB</option>
                        <option value="US">US</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-2">
                      <Form.Label className="small">State</Form.Label>
                      <Form.Control
                        size="sm"
                        value={addr.State}
                        onChange={e => updateAddress(idx, 'State', e.target.value)}
                        placeholder="SG"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-2">
                      <Form.Label className="small">Zip Code</Form.Label>
                      <Form.Control
                        size="sm"
                        value={addr.ZipCode}
                        onChange={e => updateAddress(idx, 'ZipCode', e.target.value)}
                        placeholder="218612"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-2">
                      <Form.Label className="small">Address Type</Form.Label>
                      <Form.Select
                        size="sm"
                        value={addr.AddressType}
                        onChange={e => updateAddress(idx, 'AddressType', e.target.value)}
                      >
                        {ADDRESS_TYPE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>
              </div>
            ))}
          </Card.Body>
        </Card>

        {isCustomer && (
          <Card className="border-0 shadow-sm mb-4">
            <Card.Header className="bg-white py-3">
              <Card.Title className="mb-0 d-flex align-items-center">
                <PersonLinesFill className="me-2 text-primary" />
                Contact (Required for Customer)
              </Card.Title>
            </Card.Header>
            <Card.Body>
              {contacts.map((contact, idx) => (
                <div key={idx} className="mb-4 p-3 border rounded">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="text-secondary mb-0">Contact {idx + 1}</h6>
                    {contacts.length > 1 && (
                      <Button variant="outline-danger" size="sm" onClick={() => removeContact(idx)}>Remove</Button>
                    )}
                  </div>
                  <Row>
                    <Col md={4}>
                      <Form.Group className="mb-2">
                        <Form.Label className="small">Name (e.g. Contact1)</Form.Label>
                        <Form.Control
                          size="sm"
                          value={contact.Name}
                          onChange={e => updateContact(idx, 'Name', e.target.value)}
                          placeholder="Contact1"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-2">
                        <Form.Label className="small">First Name</Form.Label>
                        <Form.Control
                          size="sm"
                          value={contact.FirstName}
                          onChange={e => updateContact(idx, 'FirstName', e.target.value)}
                          placeholder="Benedict"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-2">
                        <Form.Label className="small">Last Name</Form.Label>
                        <Form.Control
                          size="sm"
                          value={contact.LastName}
                          onChange={e => updateContact(idx, 'LastName', e.target.value)}
                          placeholder="Villanueva"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-2">
                        <Form.Label className="small">Phone</Form.Label>
                        <Form.Control
                          size="sm"
                          value={contact.Phone1}
                          onChange={e => updateContact(idx, 'Phone1', e.target.value)}
                          placeholder="0943843938"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-2">
                        <Form.Label className="small">Email</Form.Label>
                        <Form.Control
                          size="sm"
                          type="email"
                          value={contact.E_Mail}
                          onChange={e => updateContact(idx, 'E_Mail', e.target.value)}
                          placeholder="sample@gmail.com"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </div>
              ))}
              <Button variant="outline-primary" size="sm" onClick={addContact}>Add Contact</Button>
            </Card.Body>
          </Card>
        )}

        <div className="d-flex gap-2">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? <><Spinner animation="border" size="sm" className="me-2" /> Creating...</> : 'Create Customer'}
          </Button>
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => router.push('/customer-leads')}
          >
            Back to Customers
          </Button>
        </div>
      </Form>

      <Modal show={showSuccessModal} onHide={() => setShowSuccessModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="text-success">Customer created</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">Customer has been saved to the portal successfully.</p>
          {successCardCode && (
            <p className="mb-0 mt-2">
              <strong>Card code:</strong> <code>{successCardCode}</code>
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-primary"
            onClick={() => {
              setShowSuccessModal(false);
              setSuccessCardCode(null);
              setCardName('');
              setSeries(71);
              setCardType('cLid');
              setPhone1('');
              setPhone2('');
              setFax('');
              setEmailAddress('');
              setContactPerson('');
              setFreeText('');
              setValid('tYES');
              setFrozen('tNO');
              setAddresses([defaultAddress('bo_BillTo'), defaultAddress('bo_ShipTo')]);
              setContacts([defaultContact()]);
            }}
          >
            Create another
          </Button>
          <Button variant="primary" onClick={() => { setShowSuccessModal(false); router.push('/customer-leads'); }}>
            Back to Customers
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
