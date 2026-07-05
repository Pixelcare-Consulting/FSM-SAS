import React, { useState } from 'react';
import { Row, Col, Form, Button } from 'react-bootstrap';

export const EditContactTab = ({ onSubmit }) => {
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [primaryCode, setPrimaryCode] = useState('');
  const [secondaryCode, setSecondaryCode] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [activePhone1, setActive1] = useState(false);
  const [activePhone2, setActive2] = useState(false);
  const [streetAddress, setStreetAddress] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const formData = {
      primaryCode,
      primaryPhone,
      secondaryCode,
      secondaryPhone,
      activePhone1,
      activePhone2,
      streetAddress,
      stateProvince,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      emergencyRelationship,
    };
    console.log(formData);
    onSubmit(formData);
  };

  return (
    <Form onSubmit={handleSubmit}>
    <Row className="mb-3">
    <Form.Label>Primary Phone Number</Form.Label>
      {/* <Form.Group as={Col} sm={1} controlId="formPhone1">
      <Form.Control type="text" value={primaryCode} onChange={(e) => setPrimaryCode(e.target.value)} />
      </Form.Group> */}
      <Form.Group as={Col} sm={3} controlId="formPhone2">
      <Form.Control type="text" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} />
      </Form.Group>
        <Form.Group as={Col} controlId="fromSwitchActive">
          <Form.Check
            type="switch"
            id="active-phone1"
            label="Active"
            checked={activePhone1} // Set the checked state to the value of 'active'
            onChange={(e) => setActive1(e.target.checked)} // Update 'active' state on change
          />
        </Form.Group>

    </Row>
    <Row className="mb-3">
    <Form.Label>Secondary Phone Number</Form.Label>
      {/* <Form.Group as={Col} sm={1} controlId="formPhone3">
      <Form.Control type="text" value={secondaryCode} onChange={(e) => setSecondaryCode(e.target.value)} />
      </Form.Group> */}
      <Form.Group as={Col} sm={3} controlId="formPhone4">
      <Form.Control type="text" value={secondaryPhone} onChange={(e) => setSecondaryPhone(e.target.value)} />
      </Form.Group>
      <Form.Group as={Col} controlId="fromSwitchActive">
          <Form.Check
            type="switch"
            id="active-phone2"
            label="Active"
            checked={activePhone2} // Set the checked state to the value of 'active'
            onChange={(e) => setActive2(e.target.checked)} // Update 'active' state on change
          />
        </Form.Group>
    </Row>

   <Row className="mb-3">
    <Form.Group as={Col} controlId="formGridStreetAddress">
      <Form.Label>Street Address</Form.Label>
      <Form.Control 
      type="text" 
      placeholder="Enter Street Address"
      value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} />
    </Form.Group>
    
    <Form.Group as={Col} controlId="formGridStateProvince">
      <Form.Label>State / Province</Form.Label>
      <Form.Control 
      type="text" 
      placeholder="Enter State / Province"
      value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} />
    </Form.Group>

    <Form.Group as={Col} controlId="formGridZipPostal">
      <Form.Label>Postal Code</Form.Label>
      <Form.Control 
      type="text" 
      placeholder="Enter Zip Code / Postal Code"
      value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
    </Form.Group>
  </Row>

  <Row className="mb-3">
    <Form.Group as={Col} controlId="formGridEmergencyName">
      <Form.Label>Emergency Contact Name</Form.Label>
      <Form.Control 
      type="text" 
      placeholder="Enter Emergency Contact Name"
      value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
    </Form.Group>
    
    <Form.Group as={Col} controlId="formGridEmergencyContact">
      <Form.Label>Emergency Contact Phone</Form.Label>
      <Form.Control 
      type="text" 
      placeholder="Enter Emergency Contact" 
      value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)}/>
    </Form.Group>

    <Form.Group as={Col} controlId="formGridEmergencyRelationship">
          <Form.Label>Emergency Contact Relationship</Form.Label>
          <Form.Select
            aria-label="Select Emergency Contact Relationship"
            value={emergencyRelationship} // Set the value to the state
            onChange={(e) => setEmergencyRelationship(e.target.value)} // Update state on change
          >
            <option>Select Relationship</option>
            <option value="Parent">Parent</option>
            <option value="Spouse">Spouse</option>
            <option value="Sibling">Sibling</option>
            <option value="Child">Child</option>
            <option value="Other">Other</option>
          </Form.Select>
        </Form.Group>

  </Row>

  
  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button variant="primary" type="submit">Next</Button>
    </div>

</Form>
  );
};