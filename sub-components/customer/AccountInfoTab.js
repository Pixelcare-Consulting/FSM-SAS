import React from 'react';
import { Row, Col, Table, OverlayTrigger, Tooltip, Badge } from 'react-bootstrap';
import { EnvelopeFill, TelephoneFill, GeoAltFill, CurrencyExchange, HouseFill } from 'react-bootstrap-icons';
import { FaWhatsapp } from 'react-icons/fa';
import { CustomCountryFlag } from 'components/flags/CountryFlags';
import { digitsForPhoneLinks } from '../../lib/utils/toTelHref';
import { ExtensionFriendlyPhone } from 'components/common/ExtensionFriendlyPhone';
import {
  formatPortalBpAddressFull,
  formatPortalBpAddressSubtitle,
  sanitizeAddressPart,
} from '../../lib/utils/formatPortalBpAddress';

function whatsAppHrefFromRaw(rawTrimmed) {
  const trimmed = (rawTrimmed ?? '').trim();
  if (!trimmed) return '';
  const digits = digitsForPhoneLinks(trimmed);
  return digits.length >= 8 ? `https://wa.me/${digits}` : '';
}

export const AccountInfoTab = ({ customerData }) => {
  if (!customerData) {
    return <div className="p-4">Loading account information...</div>;
  }

  // Helper function to get the default billing address
const getDefaultBillingAddress = () => {
  if (!customerData.BPAddresses || customerData.BPAddresses.length === 0) {
    // Fallback: try to construct address from basic fields
    // Field mapping:
    // AddressName (siteId) = BilltoDefault or Address (location name)
    // Street = Street (actual street address)
    // BuildingFloorRoom = Building/Address (building/unit name)
    if (customerData.Street || customerData.Address || customerData.MailAddress) {
      return {
        AddressName: customerData.BilltoDefault || customerData.Building || customerData.Address || '', // Location Name (siteId)
        Street: customerData.Street || '', // Street Address
        BuildingFloorRoom: customerData.Building || customerData.Address || '', // Building/Unit name
        City: customerData.City || '',
        Country: customerData.Country || customerData.MailCountry || '',
        ZipCode: customerData.ZipCode || '',
        AddressType: 'bo_BillTo'
      };
    }
    return null;
  }
  
  // First try to find address matching BilltoDefault
  if (customerData.BilltoDefault) {
    const defaultAddr = customerData.BPAddresses.find(addr => 
      (addr.AddressType === 'bo_BillTo' || addr.AddressType === 'B') && 
      addr.AddressName === customerData.BilltoDefault
    );
    if (defaultAddr) return defaultAddr;
  }
  
  // Try to find address marked as default
  const defaultMarked = customerData.BPAddresses.find(addr => 
    addr.Default === 'Y' || addr.Default === true
  );
  if (defaultMarked) return defaultMarked;
  
  // Try to find any billing address
  const billingAddr = customerData.BPAddresses.find(addr => 
    addr.AddressType === 'bo_BillTo' || addr.AddressType === 'B'
  );
  if (billingAddr) return billingAddr;
  
  // Fallback to first address
  return customerData.BPAddresses[0];
};

// Add the unit number extraction helper function
const getUnitNumber = (buildingFloorRoom) => {
  if (!buildingFloorRoom) return '';
  
  // Match the #XX-XX pattern
  const match = buildingFloorRoom.match(/#\d{2}-\d{2}/);
  return match ? match[0] : buildingFloorRoom;
};

// Update the getFormattedAddress function
const getFormattedAddress = () => {
  const defaultAddress = getDefaultBillingAddress();
  
  if (!defaultAddress) {
    // Final fallback: use basic address fields
    // Field mapping:
    // siteId = not available, use Building/Address as fallback
    // street = Street (actual street address)
    // building = Building/Address (building/unit name)
    const siteId = customerData.Building || customerData.Address || '';
    const street = sanitizeAddressPart(customerData.Street);
    const building = sanitizeAddressPart(customerData.Building || customerData.Address);
    
    // Display Sequence: siteId, Street, Building No., Country, ZipCode
    const basicAddress = [
      building, // Building/Unit name (acts as siteId)
      customerData.Street, // Street Address
      customerData.Country === 'SG' ? 'Singapore' : customerData.Country, // Country
      customerData.ZipCode // Zip/Postal Code
    ].filter(Boolean).join(', ');
    
    const country = customerData.Country === 'SG' ? 'Singapore' : customerData.Country || '';
    const zipCode = customerData.ZipCode || '';
    
    return { 
      siteId: siteId || building || '', // Building/Address as siteId fallback
      street: street || '', // Street Address
      buildingInfo: building || '', // Building/Unit name
      country: country || '', // Country
      zipCode: zipCode || '', // Zip/Postal Code
      fullAddress: basicAddress || 'N/A' 
    };
  }

  // Field mapping:
  // siteId = AddressName (location name)
  // street = Street (actual street address, e.g., "16 RAFFLES QUAY")
  // building = BuildingFloorRoom/Building (building/unit name, e.g., "#11-01 HONG LEONG BUILDING")
  const siteId = defaultAddress.AddressName || '';
  const street = sanitizeAddressPart(defaultAddress.Street);
  const building = sanitizeAddressPart(defaultAddress.BuildingFloorRoom || defaultAddress.Building);
  
  const country = defaultAddress.Country === 'SG' ? 'Singapore' : (defaultAddress.Country || defaultAddress.CountryName || '');
  const zipCode = defaultAddress.ZipCode || '';
  const fullAddress = formatPortalBpAddressFull(defaultAddress);
  const subtitle = formatPortalBpAddressSubtitle(defaultAddress);

  return {
    siteId: siteId || building || '',
    street: street || '',
    buildingInfo: building || '',
    country: country || '',
    zipCode: zipCode || '',
    fullAddress: fullAddress || 'N/A',
    subtitle: subtitle || fullAddress || 'N/A',
  };
};

// Add this helper function at the top of your component
const getDefaultContact = () => {
  if (!customerData.ContactEmployees) return null;
  
  // Find the first active contact
  return customerData.ContactEmployees.find(
    contact => contact.Active === 'tYES'
  );
};

  return (
    <Row className="p-4">
      <Col>
        <h3 className="mb-4">Account Information</h3>
        <Table striped bordered hover responsive>
          <tbody>
            <tr>
              <td className="fw-bold" style={{ width: '30%' }}>Customer Code</td>
              <td>{customerData.CardCode || 'N/A'}</td>
            </tr>
            <tr>
              <td className="fw-bold">Company Name</td>
              <td>{customerData.CardName || 'N/A'}</td>
            </tr>
            <tr>
              <td className="fw-bold">Contact Person</td>
              <td>
                {(() => {
                  const contact = getDefaultContact();
                  if (!contact) {
                    return customerData.ContactPerson || 'No contact assigned';
                  }
                  
                  return (
                    <div>
                      <div className="fw-bold">{contact.Name}</div>
                      <div className="text-muted small">
                        {[contact.FirstName, contact.LastName].filter(Boolean).join(' ')}
                      </div>
                      {contact.Phone1 && (() => {
                        const waHref = whatsAppHrefFromRaw(contact.Phone1);
                        return (
                          <div className="d-inline-flex align-items-center gap-2 flex-wrap mt-1">
                            <ExtensionFriendlyPhone raw={contact.Phone1} />
                            {waHref ? (
                              <a
                                href={waHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="d-inline-flex align-items-center justify-content-center rounded-circle text-success text-decoration-none"
                                style={{ width: 24, height: 24, backgroundColor: 'rgba(37, 211, 102, 0.15)' }}
                                aria-label="WhatsApp"
                                title="Open WhatsApp chat"
                              >
                                <FaWhatsapp size={14} />
                              </a>
                            ) : null}
                          </div>
                        );
                      })()}
                      {contact.E_Mail && (
                        <div>
                          <a href={`mailto:${contact.E_Mail}`} className="text-decoration-none">
                            <EnvelopeFill className="me-2" />
                            {contact.E_Mail}
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </td>
            </tr>
            <tr>
              <td className="fw-bold">Phone</td>
              <td>
                {(() => {
                  const trimmed = (customerData.Phone1 || '').trim();
                  if (!trimmed) {
                    return (
                      <span className="text-muted">
                        <TelephoneFill className="me-2" />
                        N/A
                      </span>
                    );
                  }
                  const waHref = whatsAppHrefFromRaw(trimmed);
                  return (
                    <span className="d-inline-flex align-items-center gap-2 flex-wrap">
                      <OverlayTrigger
                        placement="top"
                        overlay={
                          <Tooltip id="phone-tooltip">
                            Yeastar Linkus: hover the number until the extension icon appears, then click its popup to dial
                          </Tooltip>
                        }
                      >
                        <span>
                          <ExtensionFriendlyPhone raw={trimmed} />
                        </span>
                      </OverlayTrigger>
                      {waHref ? (
                        <OverlayTrigger placement="top" overlay={<Tooltip id="phone-wa-tooltip">Open WhatsApp chat</Tooltip>}>
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="d-inline-flex align-items-center justify-content-center rounded-circle text-success text-decoration-none"
                            style={{ width: 28, height: 28, backgroundColor: 'rgba(37, 211, 102, 0.15)' }}
                            aria-label="WhatsApp"
                          >
                            <FaWhatsapp size={16} />
                          </a>
                        </OverlayTrigger>
                      ) : null}
                    </span>
                  );
                })()}
              </td>
            </tr>
            <tr>
              <td className="fw-bold">Secondary Phone</td>
              <td>
                {customerData.Phone2 ? (
                  <span className="d-inline-flex align-items-center gap-2 flex-wrap">
                    {(() => {
                      const waHref = whatsAppHrefFromRaw(customerData.Phone2);
                      return (
                        <>
                          <OverlayTrigger
                            placement="top"
                            overlay={
                              <Tooltip id="phone2-tooltip">
                                Yeastar Linkus: hover the number until the extension icon appears, then click its popup to dial
                              </Tooltip>
                            }
                          >
                            <span>
                              <ExtensionFriendlyPhone raw={customerData.Phone2} />
                            </span>
                          </OverlayTrigger>
                          {waHref ? (
                            <OverlayTrigger
                              placement="top"
                              overlay={<Tooltip id="phone2-wa-tooltip">Open WhatsApp chat</Tooltip>}
                            >
                              <a
                                href={waHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="d-inline-flex align-items-center justify-content-center rounded-circle text-success text-decoration-none"
                                style={{ width: 28, height: 28, backgroundColor: 'rgba(37, 211, 102, 0.15)' }}
                                aria-label="WhatsApp"
                              >
                                <FaWhatsapp size={16} />
                              </a>
                            </OverlayTrigger>
                          ) : null}
                        </>
                      );
                    })()}
                  </span>
                ) : (
                  <span className="text-muted">
                    <TelephoneFill className="me-2" />
                    No secondary phone
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td className="fw-bold">Email</td>
              <td>
                <OverlayTrigger
                  placement="top"
                  overlay={<Tooltip id="email-tooltip">Click to send email</Tooltip>}
                >
                  <a href={`mailto:${customerData.EmailAddress}`} className="text-decoration-none">
                    <EnvelopeFill className="me-2" />
                    {customerData.EmailAddress || 'N/A'}
                  </a>
                </OverlayTrigger>
              </td>
            </tr>
            <tr>
              <td className="fw-bold">Default Address</td>
              <td>
                <div>
                  <div className="d-flex align-items-center">
                    <GeoAltFill className="me-2 text-primary" size={14} />
                    <span className="fw-bold text-primary">
                      {getFormattedAddress().siteId || getFormattedAddress().buildingInfo || 'N/A'}
                    </span>
                    <Badge bg="primary" className="ms-2">Default</Badge>
                    {customerData.MailCountry && (
                      <div className="ms-2">
                        <CustomCountryFlag country={customerData.MailCountry} />
                      </div>
                    )}
                  </div>
                  {(() => {
                    const formatted = getFormattedAddress();
                    const secondaryLine =
                      formatted.subtitle && formatted.subtitle !== 'N/A'
                        ? formatted.subtitle
                        : [
                            formatted.street,
                            formatted.buildingInfo,
                            formatted.country,
                            formatted.zipCode,
                          ]
                            .filter(Boolean)
                            .join(', ');

                    return secondaryLine ? (
                      <div className="ms-4 text-muted">
                        {secondaryLine}
                      </div>
                    ) : null;
                  })()}
                </div>
              </td>
            </tr>
            <tr>
              <td className="fw-bold">Service Remarks</td>
              <td>{customerData.FreeText || 'No remarks'}</td>
            </tr>
            <tr>
              <td className="fw-bold">Current Account Balance</td>
              <td>
                <OverlayTrigger
                  placement="top"
                  overlay={<Tooltip id="balance-tooltip">Current balance as of today</Tooltip>}
                >
                  <span>
                    <CurrencyExchange className="me-2" />
                    {customerData.CurrentAccountBalance 
                      ? `${customerData.Currency} ${customerData.CurrentAccountBalance.toLocaleString()}`
                      : 'SGD 0.00'}
                  </span>
                </OverlayTrigger>
              </td>
            </tr>
            <tr>
              <td className="fw-bold">Orders</td>
              <td>
                <span>
                  <CurrencyExchange className="me-2" />
                  {customerData.OpenOrdersBalance 
                    ? `${customerData.Currency} ${customerData.OpenOrdersBalance.toLocaleString()}`
                    : 'No open orders'}
                </span>
              </td>
            </tr>
          </tbody>
        </Table>
      </Col>
    </Row>
  );
};

export default AccountInfoTab;
