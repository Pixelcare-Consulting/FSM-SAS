import React, { useState, useRef, useEffect } from "react";
import { Container, Row, Col, Form, Button, Image } from "react-bootstrap";
import { uploadFile } from "../../../lib/supabase/storage";

export const EditPersonalTab = ({ onSubmit, initialValues }) => {
  const [profilePicture, setProfilePicture] = useState(
    "/images/avatar/NoProfile.png"
  );
  //   const [activeUser, setActiveUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isFieldWorker, setIsFieldWorker] = useState(false);
  const [shortBio, setShortBio] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [password, setPassword] = useState("");
  const [workPermitExpiryDate, setWorkPermitExpiryDate] = useState("");
  const [nricFinWorkPermitNumber, setNricFinWorkPermitNumber] = useState("");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  // Set initial values when component mounts or when initialValues prop changes
  useEffect(() => {
    if (initialValues) {
      setProfilePicture(
        initialValues.profilePicture || "/images/avatar/NoProfile.png"
      );
      //setActiveUser(initialValues.activeUser || false);
      setIsAdmin(initialValues.isAdmin || false);
      setIsFieldWorker(initialValues.isFieldWorker || false);
      setShortBio(initialValues.shortBio || "");
      setFirstName(initialValues.firstName || "");
      setMiddleName(initialValues.middleName || "");
      setLastName(initialValues.lastName || "");
      setGender(initialValues.gender || "");
      setDateOfBirth(initialValues.dateOfBirth || "");
      setEmail(initialValues.email || "");
      setWorkerId(initialValues.workerId || "");
      setPassword(initialValues.password || "");
      setWorkPermitExpiryDate(initialValues.workPermitExpiryDate || initialValues.expirationDate || "");
      setNricFinWorkPermitNumber(initialValues.nricFinWorkPermitNumber || "");
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

    if (file) {
      try {
        // Upload to Supabase Storage
        const timestamp = Date.now();
        const fileName = `${workerId}-${timestamp}-${file.name}`;
        const result = await uploadFile('avatar', `avatars/${fileName}`, file, { upsert: true });
        profilePictureUrl = result.url;
      } catch (error) {
        console.error("Error uploading file:", error);
        // Continue with existing profile picture if upload fails
      }
    }

    const formData = {
      profilePicture: profilePictureUrl,
      //   activeUser,
      isAdmin,
      isFieldWorker,
      shortBio,
      firstName,
      middleName,
      lastName,
      gender,
      dateOfBirth,
      email,
      workerId,
      password,
      workPermitExpiryDate,
      nricFinWorkPermitNumber,
      // Keep expirationDate for backward compatibility
      expirationDate: workPermitExpiryDate,
    };

    console.log(formData);
    onSubmit(formData); // Don't need to pass workerId here; it's already in formData
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
          {/* <Form.Group as={Col} controlId="formSwitchActive">
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
          </Form.Group> */}
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
              required
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
          <Form.Group as={Col} controlId="formGridWorkerID">
            <Form.Label>Worker ID</Form.Label>
            <Form.Control
              type="text"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)} // Allow user to modify
              required
              placeholder="Enter Worker ID"
            />
          </Form.Group>
          <Form.Group as={Col} controlId="formGridPassword">
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              placeholder="Enter Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary" type="submit">
            Next
          </Button>
        </div>
      </Form>
    </Container>
  );
};
