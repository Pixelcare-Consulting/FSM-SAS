import React, { useState, useRef, useEffect } from "react";
import { Container, Row, Col, Form, Button, Image, InputGroup } from "react-bootstrap";
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { uploadFile } from "../../../lib/supabase/storage";


export const PersonalTab = ({ onSubmit, initialValues }) => {
  const [profilePicture, setProfilePicture] = useState(
    "/images/avatar/NoProfile.png"
  );
  const [activeUser, setActiveUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isFieldWorker, setIsFieldWorker] = useState(false);
  const [shortBio, setShortBio] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workPermitExpiryDate, setWorkPermitExpiryDate] = useState("");
  const [nricFinWorkPermitNumber, setNricFinWorkPermitNumber] = useState("");
  const [jobIncentiveHourlyRate, setJobIncentiveHourlyRate] = useState("0");
  const [sapTechCode, setSapTechCode] = useState("");
  const [role, setRole] = useState("Worker");
  const [file, setFile] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef(null);

  // Set initial values when component mounts or when initialValues prop changes
  useEffect(() => {
    if (initialValues) {
      setProfilePicture(
        initialValues.profilePicture || "/images/avatar/NoProfile.png"
      );
      setActiveUser(initialValues.activeUser || false);
      setIsAdmin(initialValues.isAdmin || false);
      setIsFieldWorker(initialValues.isFieldWorker || false);
      setShortBio(initialValues.shortBio || "");
      setFirstName(initialValues.firstName || "");
      setMiddleName(initialValues.middleName || "");
      setLastName(initialValues.lastName || "");
      setGender(initialValues.gender || "");
      setDateOfBirth(initialValues.dateOfBirth || "");
      setEmail(initialValues.email || "");
      setPassword(initialValues.password || "");
      setWorkPermitExpiryDate(initialValues.workPermitExpiryDate || initialValues.expirationDate || "");
      setNricFinWorkPermitNumber(initialValues.nricFinWorkPermitNumber || "");
      setJobIncentiveHourlyRate(String(initialValues.jobIncentiveHourlyRate ?? 0));
      setSapTechCode(initialValues.sapTechCode != null ? String(initialValues.sapTechCode) : "");
      setRole("Worker");
    }
  }, [initialValues]); // Re-run this effect if initialValues changes

  const handleImageChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = () => {
        setProfilePicture(reader.result);
      };
      reader.readAsDataURL(selectedFile);
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    let profilePictureUrl = profilePicture;

    // Upload to Supabase avatar bucket when a new file is selected
    if (file && profilePicture.startsWith('data:')) {
      setIsUploading(true);
      try {
        const timestamp = Date.now();
        const workerIdOrTemp = initialValues?.workerId || `temp-${timestamp}`;
        const ext = file.name.split('.').pop() || 'jpg';
        const fileName = `avatars/${workerIdOrTemp}-${timestamp}.${ext}`;
        const result = await uploadFile('avatar', fileName, file, { upsert: true });
        profilePictureUrl = result.url;
      } catch (error) {
        console.error("Error uploading avatar to Supabase:", error);
        setIsUploading(false);
        throw error;
      }
      setIsUploading(false);
    }

    const fullName = `${firstName} ${middleName} ${lastName}`.trim();

    const formData = {
      profilePicture: profilePictureUrl,
      activeUser,
      isAdmin,
      isFieldWorker,
      shortBio,
      firstName,
      middleName,
      lastName,
      fullName,
      gender,
      dateOfBirth,
      email,
      password,
      role,
      workPermitExpiryDate,
      nricFinWorkPermitNumber,
      jobIncentiveHourlyRate: Number(jobIncentiveHourlyRate) || 0,
      sapTechCode: sapTechCode.trim(),
      // Keep expirationDate for backward compatibility
      expirationDate: workPermitExpiryDate,
    };

    console.log(formData);
    onSubmit(formData);
  };

  const handleRemoveImage = () => {
    setProfilePicture("/images/avatar/NoProfile.png");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Container>
      <Form onSubmit={handleSubmit}>
        <Row className="align-items-center mb-4">
          <Col xs={12} md={6}>
            <h5 className="mb-0">Profile Picture</h5>
          </Col>
        </Row>

        <Row className="mb-3">
          <Col xs={12} md={4}>
            <div className="d-flex align-items-center">
              <div className="me-3">
                <Image
                  src={profilePicture}
                  className="rounded-circle avatar avatar-xl"
                  alt="Profile Picture"
                  style={{ width: "120px", height: "120px" }}
                />
              </div>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: "none" }}
                  ref={fileInputRef}
                  id="upload-input"
                />
                <Button
                  className="me-2"
                  onClick={() =>
                    document.getElementById("upload-input").click()
                  }
                >
                  Change
                </Button>
                <Button onClick={handleRemoveImage}>Remove</Button>
              </div>
            </div>
          </Col>
          <Form.Group as={Col} controlId="formSwitchActive">
            <Form.Label>Optional</Form.Label>
            <Form.Check
              type="switch"
              id="active-switch"
              label="Active"
              checked={activeUser}
              onChange={(e) => setActiveUser(e.target.checked)}
            />
            <Form.Check
              type="switch"
              id="admin-switch"
              label="Admin"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            <Form.Check
              type="switch"
              id="field-worker-switch"
              label="Field Worker"
              checked={isFieldWorker}
              onChange={(e) => setIsFieldWorker(e.target.checked)}
            />
          </Form.Group>
          <Form.Group as={Col} controlId="formShortBio">
            <Form.Label>Short Bio</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={shortBio}
              onChange={(e) => setShortBio(e.target.value)}
            />
          </Form.Group>
        </Row>

        <Row className="mb-3">
          <Form.Group as={Col} controlId="formGridFirstName">
            <Form.Label>First Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </Form.Group>
          <Form.Group as={Col} controlId="formGridMiddleName">
            <Form.Label>Middle Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter Middle Name"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
            />
          </Form.Group>
          <Form.Group as={Col} controlId="formGridLastName">
            <Form.Label>Last Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </Form.Group>
        </Row>

        <Row className="mb-3">
          <Form.Group as={Col} controlId="formGridGender">
            <Form.Label>Gender</Form.Label>
            {["radio"].map((type) => (
              <div key={`inline-${type}`} className="mb-3">
                <Form.Check
                  inline
                  label="Male"
                  name="gender"
                  type="radio"
                  id={`inline-gender-1`}
                  checked={gender === "male"}
                  onChange={() => setGender("male")}
                />
                <Form.Check
                  inline
                  label="Female"
                  name="gender"
                  type="radio"
                  id={`inline-gender-2`}
                  checked={gender === "female"}
                  onChange={() => setGender("female")}
                />
              </div>
            ))}
          </Form.Group>

          <Form.Group as={Col} controlId="formGridBirthDate">
            <Form.Label>Date of Birth</Form.Label>
            <Form.Control
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </Form.Group>

          <Form.Group as={Col} controlId="formGridEmail">
            <Form.Label>Email</Form.Label>
            <Form.Control
              type="email"
              placeholder="Enter Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Form.Group>
        </Row>

        <Row className="mb-3">
          <Form.Group as={Col} controlId="formGridPassword">
      <Form.Label>Password <small className="text-muted">(Optional - leave blank to keep current password)</small></Form.Label>
      <InputGroup>
        <Form.Control
          type={showPassword ? "text" : "password"}
          placeholder="Enter new password (optional)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <InputGroup.Text onClick={() => setShowPassword(!showPassword)}>
          {showPassword ? <FaEyeSlash /> : <FaEye />}
        </InputGroup.Text>
      </InputGroup>
    </Form.Group>

          <Form.Group as={Col} controlId="formGridWorkPermitExpDate">
            <Form.Label>Work Permit Expiry Date</Form.Label>
            <Form.Control
              type="date"
              value={workPermitExpiryDate}
              onChange={(e) => setWorkPermitExpiryDate(e.target.value)}
            />
          </Form.Group>
        </Row>

        <Row className="mb-3">
          <Form.Group as={Col} controlId="formGridNricFinWorkPermit">
            <Form.Label>NRIC/FIN/Work Permit Number</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter NRIC/FIN/Work Permit Number"
              value={nricFinWorkPermitNumber}
              onChange={(e) => setNricFinWorkPermitNumber(e.target.value)}
            />
          </Form.Group>
        </Row>

        <Row className="mb-3">
          <Form.Group as={Col} controlId="formGridSapTechCode">
            <Form.Label>SAP technician code</Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g. A1EdsonBeh (must match @API_JOB_SCHEDULE.U_JobTech)"
              value={sapTechCode}
              onChange={(e) => setSapTechCode(e.target.value)}
            />
            <Form.Text className="text-muted">
              Required for SAP Job Incentives add-on sync and reports.
            </Form.Text>
          </Form.Group>
          <Form.Group as={Col} controlId="formGridJobIncentiveHourlyRate">
            <Form.Label>Job Incentive Hourly Rate</Form.Label>
            <Form.Control
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={jobIncentiveHourlyRate}
              onChange={(e) => setJobIncentiveHourlyRate(e.target.value)}
            />
            <Form.Text className="text-muted">
              Used to calculate incentives from completed job labor time.
            </Form.Text>
          </Form.Group>
        </Row>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary" type="submit" disabled={isUploading}>
            {isUploading ? "Uploading..." : "Next"}
          </Button>
        </div>
      </Form>
    </Container>
  );
};
