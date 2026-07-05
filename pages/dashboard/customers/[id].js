import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  Tabs,
  Tab,
  Button,
  Spinner,
  Badge
} from 'react-bootstrap';
import { useRouter } from 'next/router';
import { GeeksSEO } from 'widgets';
import { AccountInfoTab } from 'sub-components/customer/AccountInfoTab';
import { ServiceLocationTab } from 'sub-components/customer/ServiceLocationTab';
import EquipmentsTab from 'sub-components/customer/EquipmentsTab';
import { DocumentsTab } from 'sub-components/customer/DocumentsTab';
import { HistoryTab } from 'sub-components/customer/HistoryTab';
import { NotesTab } from 'sub-components/customer/NotesTab';
import QuotationsTab from 'sub-components/customer/QuotationsTab';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { MasterlistEntityEditModal } from '../../../sub-components/dashboard/MasterlistEntityEditModal';
import { enrichPartnerWithSapContacts } from '../../../lib/customers/contactResolution';
import { fetchWithTimeout } from '../../../lib/utils/fetchWithTimeout';

const BUNDLE_TIMEOUT_MS = 45_000;
const EQUIPMENT_TIMEOUT_MS = 30_000;
const SAP_CUSTOMER_TIMEOUT_MS = 35_000;

function useResolvedCustomerCardCode(router) {
  return useMemo(() => {
    if (!router.isReady) return '';
    const raw = router.query.id;
    const fromQuery = Array.isArray(raw) ? raw[0] : raw;
    if (fromQuery && String(fromQuery) !== '[id]') {
      return String(fromQuery).trim();
    }
    const pathOnly = decodeURIComponent((router.asPath || '').split('?')[0]);
    const m = pathOnly.match(/\/(?:customers\/view\/|dashboard\/customers\/)([^/]+)\/?$/);
    return m ? m[1].trim() : '';
  }, [router.isReady, router.query.id, router.asPath]);
}

const ViewCustomer = () => {
  const [activeTab, setActiveTab] = useState('accountInfo');
  const [customerData, setCustomerData] = useState(null);
  const [addressDetails, setAddressDetails] = useState(null);
  const [equipments, setEquipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [masterlistEditable, setMasterlistEditable] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const router = useRouter();
  const resolvedCustomerId = useResolvedCustomerCardCode(router);
  const loadGenerationRef = useRef(0);

  const isPortalCustomerNotSyncedError = (customerId, errorMessage) => {
    if (!customerId || typeof customerId !== 'string' || !errorMessage) return false;
    const normalizedId = customerId.toUpperCase();
    const message = String(errorMessage);

    return /^CP\d+$/i.test(normalizedId) && (
      message.includes('Error fetching BusinessPartner') ||
      message.includes('No matching records found') ||
      message.includes('Customer with CardCode') ||
      message.includes('not found') ||
      message.includes('BusinessPartner')
    );
  };
  
  const loadCustomerDetail = useCallback(async () => {
    const cardCode = resolvedCustomerId;
    if (!cardCode) return;

    const generation = ++loadGenerationRef.current;
    const isStale = () => generation !== loadGenerationRef.current;

    setLoading(true);
    setMasterlistEditable(false);
    setError(null);

    try {
      const [bundleOutcome, equipmentOutcome] = await Promise.all([
        (async () => {
          try {
            const bundleRes = await fetchWithTimeout(
              `/api/customers/masterlist-bundle/${encodeURIComponent(cardCode)}`,
              { credentials: 'same-origin' },
              BUNDLE_TIMEOUT_MS,
            );
            if (!bundleRes.ok) return { partner: null, fromMasterlist: false, addressDetails: null };
            const bundleJson = await bundleRes.json();
            if (bundleJson?.success && bundleJson.partner) {
              return {
                partner: bundleJson.partner,
                fromMasterlist: true,
                addressDetails: bundleJson.addressDetails || { data: {}, dataByCustomerLocationId: {} },
              };
            }
            return { partner: null, fromMasterlist: false, addressDetails: null };
          } catch (bundleErr) {
            console.warn('masterlist-bundle fetch failed:', bundleErr);
            return { partner: null, fromMasterlist: false, addressDetails: null };
          }
        })(),
        (async () => {
          try {
            const equipmentResponse = await fetchWithTimeout(
              '/api/getEquipments',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardCode }),
              },
              EQUIPMENT_TIMEOUT_MS,
            );
            return equipmentResponse.ok ? await equipmentResponse.json() : [];
          } catch (equipmentErr) {
            console.warn('getEquipments fetch failed:', equipmentErr);
            return [];
          }
        })(),
      ]);

      if (isStale()) return;

      let customerInfo = bundleOutcome.partner;
      const fromMasterlist = bundleOutcome.fromMasterlist;
      let bundledAddressDetails = bundleOutcome.addressDetails;

      if (!customerInfo) {
        const customerResponse = await fetchWithTimeout(
          `/api/getCustomerCode?cardCode=${encodeURIComponent(cardCode)}`,
          {},
          SAP_CUSTOMER_TIMEOUT_MS,
        );
        if (!customerResponse.ok) {
          throw new Error(`Failed to fetch customer details: ${await customerResponse.text()}`);
        }
        customerInfo = await customerResponse.json();
        bundledAddressDetails = null;
      }

      if (isStale()) return;

      setMasterlistEditable(fromMasterlist);
      setCustomerData(customerInfo);
      setAddressDetails(bundledAddressDetails);
      setEquipments(Array.isArray(equipmentOutcome) ? equipmentOutcome : []);
      setError(null);
      setLoading(false);

      if (fromMasterlist && customerInfo) {
        enrichPartnerWithSapContacts(customerInfo, cardCode).then((enriched) => {
          if (isStale() || enriched === customerInfo) return;
          setCustomerData(enriched);
        });
      }
    } catch (err) {
      if (isStale()) return;
      console.error('Error fetching data:', err);
      const message =
        err?.name === 'AbortError'
          ? 'Request timed out loading customer data. Please try again.'
          : err.message || 'Failed to load data.';
      setError(message);
      setLoading(false);
    }
  }, [resolvedCustomerId]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!resolvedCustomerId) {
      setLoading(false);
      setCustomerData(null);
      setEquipments([]);
      setMasterlistEditable(false);
      setError('Could not read the customer code from this URL. Open the customer again from the list.');
      return;
    }
    loadCustomerDetail();
  }, [router.isReady, resolvedCustomerId, loadCustomerDetail]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!error || !isPortalCustomerNotSyncedError(resolvedCustomerId, error)) return;

    const redirectTimer = window.setTimeout(() => {
      router.replace({
        pathname: '/customer-leads',
        query: {
          openCustomerCode: resolvedCustomerId,
          portalNotSynced: '1',
        },
      });
    }, 1200);

    return () => window.clearTimeout(redirectTimer);
  }, [router, resolvedCustomerId, error]);

  const handleTabChange = (key) => {
    if (key) setActiveTab(key);
  };

  if (loading) {
    return (
      <Container>
        <Row>
          <Col lg={12} md={12} sm={12}>
            <div
              style={{
                background: "linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)",
                padding: "1.5rem 2rem",
                borderRadius: "0 0 24px 24px",
                marginTop: "-39px",
                marginLeft: "10px",
                marginRight: "10px",
                marginBottom: "20px",
              }}
            >
              <div className="d-flex justify-content-between align-items-start">
                <div className="d-flex flex-column">
                  <div className="mb-3">
                    <h1
                      className="mb-2"
                      style={{
                        fontSize: "28px",
                        fontWeight: "600",
                        color: "#FFFFFF",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Loading...
                    </h1>
                    <p
                      className="mb-2"
                      style={{
                        fontSize: "16px",
                        color: "rgba(255, 255, 255, 0.7)",
                        fontWeight: "400",
                        lineHeight: "1.5",
                      }}
                    >
                      View and manage customer details, equipment, and history
                    </p>
                  </div>

                  <nav
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    <div className="d-flex align-items-center">
                      <i
                        className="fe fe-home"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      ></i>
                      <Link
                        href="/"
                        className="text-decoration-none ms-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        Dashboard
                      </Link>
                      <span
                        className="mx-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        /
                      </span>
                      <Link
                        href="/customers"
                        className="text-decoration-none"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        Loading...
                      </Link>
                      <span
                        className="mx-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        /
                      </span>
                      <span style={{ color: "#FFFFFF" }}>Loading...</span>
                    </div>
                  </nav>
                </div>
              </div>
            </div>
          </Col>
        </Row>
        <Row>
          <Col>
            <Card className="text-center shadow-sm">
              <Card.Body>
                <Spinner animation="border" role="status" variant="primary" style={{ width: '3rem', height: '3rem' }}>
                  <span className="visually-hidden">Loading...</span>
                </Spinner>
                <p className="mt-3">Loading customer data...</p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  if (error) {
    const isLeadNotSynced =
      (resolvedCustomerId &&
        typeof resolvedCustomerId === 'string' &&
        resolvedCustomerId.toUpperCase().startsWith('LEAD-') &&
        (error.includes('CardCode') ||
          error.includes('Value too long') ||
          error.includes('BusinessPartner') ||
          error.includes('not found'))) ||
      isPortalCustomerNotSyncedError(resolvedCustomerId, error);

    return (
      <Container className="mt-5">
        <Row>
          <Col>
            <Card className="text-center shadow-sm">
              <Card.Body className="py-5">
                <Card.Title className="text-danger mb-3">
                  {isLeadNotSynced ? 'Customer Not Synced to SAP Yet' : 'Error Loading Customer'}
                </Card.Title>
                <Card.Text className="mb-4">
                  {isLeadNotSynced ? (
                    <>
                      This customer is a portal or lead record that has not been synced to SAP yet.
                      Redirecting you to Customer Leads so you can view the record there.
                      {resolvedCustomerId && (
                        <>
                          <br />
                          <span className="d-inline-block mt-3 px-3 py-2 bg-light rounded">
                            <strong>Customer Code:</strong>{' '}
                            <code className="text-dark">{resolvedCustomerId}</code>
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {error}
                      {resolvedCustomerId && (
                        <>
                          <br />
                          <small className="text-muted">Customer ID: {resolvedCustomerId}</small>
                        </>
                      )}
                    </>
                  )}
                </Card.Text>
                <div className="d-flex gap-2 justify-content-center flex-wrap">
                  <Button variant="primary" onClick={() => router.push('/customers')}>
                    Back to Customers List
                  </Button>
                  {isLeadNotSynced ? (
                    <Button
                      variant="outline-primary"
                      onClick={() =>
                        router.push({
                          pathname: '/customer-leads',
                          query: {
                            openCustomerCode: resolvedCustomerId,
                            portalNotSynced: '1',
                          },
                        })
                      }
                    >
                      Open in Customer Leads
                    </Button>
                  ) : (
                    <Button variant="outline-primary" onClick={() => router.push('/customer-leads')}>
                      Go to Customer Leads
                    </Button>
                  )}
                  {!isLeadNotSynced && (
                    <Button variant="secondary" onClick={() => window.location.reload()}>
                      Retry Loading
                    </Button>
                  )}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  if (!customerData) {
    return (
      <Container className="mt-5">
        <Row>
          <Col>
            <Card className="text-center">
              <Card.Body>
                <Card.Title>No Data Found</Card.Title>
                <Card.Text>No customer data found for the given ID.</Card.Text>
                <Button variant="primary" onClick={() => router.push('/customers')}>
                  Back to Customers List
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container>
      <GeeksSEO title={`View Customer: ${customerData.CardName || ''} | FSM Portal`} />
      <Row>
        <Col lg={12} md={12} sm={12}>
          <div
            style={{
              background: "linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)",
              padding: "1.5rem 2rem",
              borderRadius: "0 0 24px 24px",
              marginTop: "-39px",
              marginLeft: "10px",
              marginRight: "10px",
              marginBottom: "20px",
            }}
          >
            <div className="d-flex justify-content-between align-items-start">
              <div className="d-flex flex-column">
                <div className="mb-3">
                  <h1
                    className="mb-2"
                    style={{
                      fontSize: "28px",
                      fontWeight: "600",
                      color: "#FFFFFF",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {customerData?.CardName}
                  </h1>
                  <p
                    className="mb-2"
                    style={{
                      fontSize: "16px",
                      color: "rgba(255, 255, 255, 0.7)",
                      fontWeight: "400",
                      lineHeight: "1.5",
                    }}
                  >
                    View and manage customer details, equipment, and history
                  </p>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-light text-dark">
                      ID: {customerData?.CardCode}
                    </span>
                    {customerData?.CustomerType && (
                      <Badge bg="secondary">
                        {customerData.CustomerType}
                      </Badge>
                    )}
                  </div>
                </div>

                <nav
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  <div className="d-flex align-items-center">
                    <i
                      className="fe fe-home"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    ></i>
                    <Link
                      href="/"
                      className="text-decoration-none ms-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      Dashboard
                    </Link>
                    <span
                      className="mx-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      /
                    </span>
                    <Link
                      href="/customers"
                      className="text-decoration-none"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      Customers
                    </Link>
                    <span
                      className="mx-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      /
                    </span>
                    <span style={{ color: "#FFFFFF" }}>Customer Details</span>
                  </div>
                </nav>
              </div>

              <div className="d-flex flex-column gap-2 align-items-end">
                <Button
                  variant="light"
                  className="d-flex align-items-center gap-2"
                  style={{
                    padding: "0.5rem 1rem",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                  onClick={() => router.push('/customers')}
                >
                  <i className="fe fe-arrow-left"></i>
                  Back to Customers
                </Button>
                {masterlistEditable && (
                  <Button
                    variant="outline-light"
                    className="d-flex align-items-center gap-2"
                    style={{
                      padding: "0.5rem 1rem",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    }}
                    onClick={() => setEditModalOpen(true)}
                  >
                    <i className="fe fe-edit-2" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <MasterlistEntityEditModal
        show={editModalOpen}
        onHide={() => setEditModalOpen(false)}
        mode="customer"
        code={resolvedCustomerId}
        customerData={customerData}
        onSaved={loadCustomerDetail}
      />

      <Row>
        <Col xl={12} lg={12} md={12} sm={12}>
          <Card className="shadow-sm">
            <Card.Body>
              <Tabs
                activeKey={activeTab}
                onSelect={handleTabChange}
                className="mb-3"
              >
                <Tab eventKey="accountInfo" title="Account Info">
                  <AccountInfoTab customerData={customerData} />
                </Tab>
                <Tab eventKey="serviceLocation" title="Address">
                  <ServiceLocationTab
                    customerData={customerData}
                    addressDetails={addressDetails}
                    masterlistContactEdit={
                      masterlistEditable && resolvedCustomerId
                        ? { kind: 'customer', code: resolvedCustomerId }
                        : null
                    }
                    onMasterlistContactSaved={loadCustomerDetail}
                    onLocationDeleted={loadCustomerDetail}
                  />
                </Tab>
                <Tab eventKey="notes" title="Notes">
                  <NotesTab customerId={resolvedCustomerId} />
                </Tab>
                <Tab eventKey="equipments" title="Equipments">
                    <EquipmentsTab customerData={customerData} equipments={equipments} />
                </Tab>
                <Tab eventKey="history" title="Job History">
                  <HistoryTab customerData={customerData} customerID={resolvedCustomerId} />
                </Tab>
                <Tab eventKey="quotations" title="Quotations">
                  <QuotationsTab customerId={resolvedCustomerId} />
                </Tab>
                
                <Tab eventKey="documents" title="Documents">
                  <DocumentsTab customerData={customerData} />
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ViewCustomer;
