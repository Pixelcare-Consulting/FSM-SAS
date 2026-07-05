// import React, { useState, useEffect } from "react";
// import { Row, Col, Form, Button } from "react-bootstrap";
// import Select from "react-select";
// import EquipmentsTable from "pages/dashboard/tables/datatable-equipments";
// import { db } from "../../../../firebase";
// import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";

// const JobSummary = ({
//   jobId,
//   showServiceLocation,
//   showEquipments,
//   toggleServiceLocation,
//   toggleEquipments,
//   setActiveTab,
// }) => {
//   const [formData, setFormData] = useState({
//     customerID: "", // Added to align with Firestore
//     customerName: "", // Already present

//     contact: {
//       contactID: "", // Already present
//       contactFullName: "", // Adjusted to match your Firestore field
//       firstName: "", // Already present
//       middleName: "", // Already present
//       lastName: "", // Already present
//       phoneNumber: "", // Already present
//       mobilePhone: "", // Already present
//       email: "", // Already present
//     },

//     location: {
//       address: {
//         streetNo: "", // Already present
//         streetAddress: "", // Adjusted to match your Firestore field
//         block: "", // Already present
//         buildingNo: "", // Not included in your Firestore structure
//         country: "", // Not included in your Firestore structure
//         stateProvince: "", // Already present
//         city: "", // Already present
//         postalCode: "", // Adjusted to match Firestore field
//       },

//       locationName: "", // Already present
//     },
//     equipments: [], // Already present
//   });
//   const [customers, setCustomers] = useState([]);
//   const [contacts, setContacts] = useState([]);
//   const [locations, setLocations] = useState([]);
//   const [equipments, setEquipments] = useState([]);
//   const [selectedCustomer, setSelectedCustomer] = useState(null);
//   const [selectedContact, setSelectedContact] = useState(null);
//   const [selectedLocation, setSelectedLocation] = useState(null);

//   useEffect(() => {
//     const fetchJobData = async () => {
//       try {
//         const jobRef = doc(db, "jobs", jobId);
//         const jobSnap = await getDoc(jobRef);

//         if (jobSnap.exists()) {
//           const jobData = jobSnap.data();

//           // Map nested contact data
//           const contactData = jobData.contact || {};
//           const locationData = jobData.location || {};
//           const addressData = locationData.address || {};

//           // Set formData with mapped values
//           setFormData({
//             ...jobData,
//             contactId: contactData.contactID || "",
//             firstName: contactData.firstName || "",
//             middleName: contactData.middleName || "",
//             lastName: contactData.lastName || "",
//             phoneNumber: contactData.phoneNumber || "",
//             mobilePhone: contactData.mobilePhone || "",
//             email: contactData.email || "",
//             locationName: locationData.locationName || "",
//             streetNo: addressData.streetNo || "",
//             streetAddress: addressData.streetAddress || "",
//             block: addressData.block || "",
//             buildingNo: addressData.buildingNo || "",
//             country: addressData.country || "",
//             stateProvince: addressData.stateProvince || "",
//             city: addressData.city || "",
//             zipCode: addressData.zipCode || "",
//             equipments: jobData.equipments || [],
//           });

//           // Find the customer object that matches the customerName from jobData
//           const selectedCustomer = customers.find(
//             (customer) => customer.label === jobData.customerName
//           );
//           setSelectedCustomer(selectedCustomer);
//         } else {
//           console.error("No such document!");
//         }
//       } catch (error) {
//         console.error("Error fetching job data:", error);
//       }
//     };

//     if (jobId) {
//       fetchJobData();
//     }
//   }, [jobId, customers]);
//   useEffect(() => {
//     if (selectedCustomer) {
//       const fetchRelatedData = async () => {
//         try {
//           const contactsResponse = await fetch("/api/getContacts", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ cardCode: selectedCustomer.value }),
//           });
//           const contactsData = await contactsResponse.json();
//           const formattedContacts = contactsData.map((item) => ({
//             value: item.contactId,
//             label: item.contactId,
//             ...item,
//           }));
//           setContacts(formattedContacts);

//           // Log the contacts fetched
//           console.log("Contacts fetched:", formattedContacts);

//           // Set selected contact based on formData
//           const selectedContact = formattedContacts.find(
//             (contact) => contact.label === formData.contactId
//           );
//           console.log("Selected contact:", selectedContact);
//           setSelectedContact(selectedContact);
//         } catch (error) {
//           console.error("Error fetching contacts:", error);
//           setContacts([]);
//         }

//         try {
//           const locationsResponse = await fetch("/api/getLocation", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ cardCode: selectedCustomer.value }),
//           });
//           const locationsData = await locationsResponse.json();
//           const formattedLocations = locationsData.map((item) => ({
//             value: item.siteId,
//             label: item.siteId,
//             ...item,
//           }));
//           setLocations(formattedLocations);

//           // Log the locations fetched
//           console.log("Locations fetched:", formattedLocations);

//           // Set selected location based on formData
//           const selectedLocation = formattedLocations.find(
//             (location) => location.label === formData.locationName
//           );

//           // Log the selected location
//           console.log("Selected location:", selectedLocation);

//           // If selectedLocation is found, set it
//           if (selectedLocation) {
//             setSelectedLocation(selectedLocation);
//           } else {
//             setSelectedLocation(null); // Or handle as needed if not found
//           }
//         } catch (error) {
//           console.error("Error fetching locations:", error);
//           setLocations([]);
//         }

//         try {
//           const equipmentsResponse = await fetch("/api/getEquipments", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ cardCode: selectedCustomer.value }),
//           });
//           const equipmentsData = await equipmentsResponse.json();
//           const formattedEquipments = equipmentsData.map((item) => ({
//             value: item.ItemCode,
//             label: item.ItemCode,
//             ...item,
//           }));
//           setEquipments(formattedEquipments);
//         } catch (error) {
//           console.error("Error fetching equipments:", error);
//           setEquipments([]);
//         }
//       };

//       fetchRelatedData();
//     }
//   }, [selectedCustomer]);

//   const fetchCustomers = async () => {
//     try {
//       const response = await fetch("/api/getCustomers");
//       const data = await response.json();
//       const formattedOptions = data.map((item) => ({
//         value: item.cardCode,
//         label: item.cardCode + " - " + item.cardName,
//       }));
//       setCustomers(formattedOptions);
//     } catch (error) {
//       console.error("Error fetching customers:", error);
//       setCustomers([]);
//     }
//   };

//   useEffect(() => {
//     fetchCustomers();
//   }, []);

//   const handleCustomerChange = (selectedOption) => {
//     // Reset contact, location, and formData related to the selected customer
//     setSelectedContact(null);
//     setSelectedLocation(null);
//     setContacts([]); // Clear contacts
//     setLocations([]); // Clear locations
//     setEquipments([]); // Optionally clear equipments
//     setFormData((prevFormData) => ({
//       ...prevFormData,
//       customerName: selectedOption ? selectedOption.label : "",
//       contact: {
//         contactID: "",
//         contactFullName: "",
//         firstName: "",
//         middleName: "",
//         lastName: "",
//         phoneNumber: "",
//         mobilePhone: "",
//         email: "",
//       },
//       location: {
//         address: {
//           streetNo: "",
//           streetAddress: "",
//           block: "",
//           buildingNo: "",
//           country: "",
//           stateProvince: "",
//           city: "",
//           zipCode: "",
//         },
//         locationName: "",
//       },

//       equipments: [], // Clear selected equipments
//     }));
//     setSelectedCustomer(selectedOption);
//   };

//   const handleContactChange = (selectedOption) => {
//     console.log("Selected contact:", selectedOption); // Debugging log
//     if (!selectedOption) return; // Check if selectedOption is valid

//     const fullName = `${selectedOption.firstName || ""} ${
//       selectedOption.middleName || ""
//     } ${selectedOption.lastName || ""}`.trim();

//     // Update selected contact
//     setSelectedContact(selectedOption);

//     // Update formData with the new contact details
//     setFormData((prevFormData) => ({
//       ...prevFormData,
//       contact: {
//         contactID: selectedOption.contactId || "",
//         contactFullname: fullName,
//         firstName: selectedOption.firstName || "",
//         middleName: selectedOption.middleName || "",
//         lastName: selectedOption.lastName || "",
//         phoneNumber: selectedOption.tel1 || "",
//         mobilePhone: selectedOption.tel2 || "",
//         email: selectedOption.email || "",
//       },
//     }));
//   };

//   const handleLocationChange = (selectedOption) => {
//     console.log("Selected location:", selectedOption); // Debugging log
//     if (!selectedOption) return; // Check if selectedOption is valid

//     const selectedLocation = locations.find(
//       (location) => location.value === selectedOption.value
//     );

//     if (!selectedLocation) return; // Handle if location is not found

//     // Update formData with the new location details
//     setFormData((prevFormData) => ({
//       ...prevFormData,
//       location: {
//         locationName: selectedLocation.siteId,
//         address: {
//           streetNo: selectedLocation.streetNo || "",
//           streetAddress: selectedLocation.street || "",
//           block: selectedLocation.block || "",
//           buildingNo: selectedLocation.building || "",
//           country: selectedLocation.countryName || "",
//           stateProvince: "",
//           city: selectedLocation.city || "",
//           zipCode: selectedLocation.zipCode || "",
//         },
//       },
//     }));
//   };

//   const handleSelectedEquipmentsChange = (selectedEquipments) => {
//     setFormData((prevFormData) => ({
//       ...prevFormData,
//       equipments: selectedEquipments,
//     }));
//   };

//   const handleInputChange = (e) => {
//     const { name, value, type, checked } = e.target;
//     setFormData((prevState) => ({
//       ...prevState,
//       [name]: type === "checkbox" ? checked : value,
//     }));
//   };

//   const handleSubmit = async () => {
//     try {
//       const jobRef = doc(db, "jobs", jobId);

//       // Fetch the current document data to retain existing fields
//       const jobDoc = await getDoc(jobRef);
//       const currentData = jobDoc.data() || {}; // Ensure currentData is not null

//       // Prepare the data to be updated
//       const updatedData = {
//         customerName: formData.customerName || currentData.customerName,
//         contact: {
//           contactID:
//             formData.contact.contactID || currentData.contact.contactID,
//           contactFullname:
//             formData.contact.contactFullname ||
//             currentData.contact.contactFullname,
//           firstName:
//             formData.contact.firstName || currentData.contact.firstName,
//           middleName:
//             formData.contact.middleName || currentData.contact.middleName,
//           lastName: formData.contact.lastName || currentData.contact.lastName,
//           phoneNumber:
//             formData.contact.phoneNumber || currentData.contact.phoneNumber,
//           mobilePhone:
//             formData.contact.mobilePhone || currentData.contact.mobilePhone,
//           email: formData.contact.email || currentData.contact.email,
//         },
//         location: {
//           address: {
//             streetNo:
//               formData.location.address.streetNo ||
//               currentData.location.address.streetNo,
//             streetAddress:
//               formData.location.address.streetAddress ||
//               currentData.location.address.streetAddress,
//             block:
//               formData.location.address.block ||
//               currentData.location.address.block,
//             city:
//               formData.location.address.city ||
//               currentData.location.address.city,
//             stateProvince:
//               formData.location.address.stateProvince ||
//               currentData.location.address.stateProvince,
//             postalCode:
//               formData.location.address.postalCode ||
//               currentData.location.address.postalCode,
//           },
//           locationName:
//             formData.location.locationName || currentData.location.locationName,
//           coordinates: currentData.location.coordinates || {}, // Retain existing coordinates
//         },
//         equipments: formData.equipments || currentData.equipments || [],
//         // Include any other fields from the currentData that should be retained
//         // For example: assignedWorkers, adminWorkerNotify, etc.
//         assignedWorkers: currentData.assignedWorkers || [],
//         adminWorkerNotify: currentData.adminWorkerNotify || false,
//         jobStatus: currentData.jobStatus || "Created", // Default value if not provided
//         // Add any other necessary fields here...
//       };

//       // Update the document in Firestore
//       await setDoc(jobRef, updatedData, { merge: true });

//       setActiveTab("scheduling");
//     } catch (error) {
//       console.error("Error updating job:", error);
//       alert("Error updating the job!");
//     }
//   };

//   return (
//     <>
//       <Form noValidate>
//         <Row className="mb-3">
//           <Form.Group as={Col} md="7" controlId="customerList">
//             <Form.Label>Search Customer</Form.Label>
//             <Select
//               instanceId="customer-select"
//               options={customers}
//               value={selectedCustomer}
//               onChange={handleCustomerChange}
//               placeholder="Enter Customer Name"
//             />
//           </Form.Group>
//         </Row>

//         <hr className="my-4" />
//         <h5 className="mb-1">Primary Contact</h5>
//         <p className="text-muted">Details about the customer.</p>

//         <Row className="mb-3">
//           <Form.Group as={Col} md="3" controlId="jobWorker">
//             <Form.Label>Select Contact ID</Form.Label>
//             <Select
//               instanceId="contact-select"
//               options={contacts}
//               value={selectedContact}
//               onChange={handleContactChange}
//               placeholder="Select Contact ID"
//             />
//           </Form.Group>
//         </Row>

//         <Row className="mb-3">
//           <Form.Group as={Col} md="4" controlId="validationCustom01">
//             <Form.Label>First name</Form.Label>
//             <Form.Control
//               required
//               type="text"
//               name="firstName"
//               value={formData.contact.firstName}
//               onChange={handleInputChange}
//               readOnly={false}
//             />
//             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
//           </Form.Group>
//           <Form.Group as={Col} md="4" controlId="validationCustom02">
//             <Form.Label>Middle name</Form.Label>
//             <Form.Control
//               required
//               type="text"
//               name="middleName"
//               value={formData.contact.middleName}
//               onChange={handleInputChange}
//               readOnly={false}
//             />
//             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
//           </Form.Group>
//           <Form.Group as={Col} md="4" controlId="validationCustom03">
//             <Form.Label>Last name</Form.Label>
//             <Form.Control
//               required
//               type="text"
//               name="lastName"
//               value={formData.contact.lastName}
//               onChange={handleInputChange}
//               readOnly={false}
//             />
//             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
//           </Form.Group>
//         </Row>
//         <Row className="mb-3">
//           <Form.Group as={Col} md="4" controlId="validationCustomPhoneNumber">
//             <Form.Label>Phone Number</Form.Label>
//             <Form.Control
//               name="phoneNumber"
//               value={formData.contact.phoneNumber}
//               onChange={handleInputChange}
//               type="text"
//               readOnly={false}
//             />
//             <Form.Control.Feedback type="invalid">
//               Please provide a valid phone number.
//             </Form.Control.Feedback>
//           </Form.Group>
//           <Form.Group as={Col} md="4" controlId="validationCustomMobilePhone">
//             <Form.Label>Mobile Phone</Form.Label>
//             <Form.Control
//               name="mobilePhone"
//               value={formData.contact.mobilePhone}
//               onChange={handleInputChange}
//               type="text"
//               readOnly={false}
//             />
//             <Form.Control.Feedback type="invalid">
//               Please provide a valid mobile phone number.
//             </Form.Control.Feedback>
//           </Form.Group>
//           <Form.Group as={Col} md="4" controlId="validationCustomEmail">
//             <Form.Label>Email</Form.Label>
//             <Form.Control
//               name="email"
//               value={formData.contact.email}
//               onChange={handleInputChange}
//               type="email"
//               readOnly={false}
//             />
//             <Form.Control.Feedback type="invalid">
//               Please provide a valid email.
//             </Form.Control.Feedback>
//           </Form.Group>
//         </Row>

//         <hr className="my-4" />
//         <h5
//           className="mb-1"
//           style={{ cursor: "pointer" }}
//           onClick={toggleServiceLocation}
//         >
//           Job Address {showServiceLocation ? "(-)" : "(+)"}
//         </h5>
//         {showServiceLocation && (
//           <>
//             <p className="text-muted">Details about the Job Address.</p>
//             <Row className="mb-3">
//               <Form.Group as={Col} md="4" controlId="jobLocation">
//                 <Form.Label>Select Location ID</Form.Label>
//                 <Select
//                   instanceId="location-select"
//                   options={locations}
//                   value={selectedLocation}
//                   onChange={handleLocationChange}
//                   placeholder="Select Location ID"
//                 />
//               </Form.Group>
//             </Row>
//             <Row className="mb-3">
//               <Form.Group as={Col} controlId="locationName">
//                 <Form.Label>Location Name</Form.Label>
//                 <Form.Control
//                   name="locationName"
//                   type="text"
//                   value={formData.location.locationName}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//               <Form.Group as={Col} controlId="streetAddress">
//                 <Form.Label>Street No.</Form.Label>
//                 <Form.Control
//                   name="streetNo"
//                   type="text"
//                   value={formData.location.address.streetNo}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//               <Form.Group as={Col} controlId="streetAddress">
//                 <Form.Label>Street Address</Form.Label>
//                 <Form.Control
//                   name="streetAddress"
//                   type="text"
//                   value={formData.location.address.streetAddress}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//             </Row>
//             <Row className="mb-3">
//               <Form.Group as={Col} controlId="block">
//                 <Form.Label>Block</Form.Label>
//                 <Form.Control
//                   name="block"
//                   type="text"
//                   value={formData.location.address.block}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//               <Form.Group as={Col} controlId="building">
//                 <Form.Label>Building No.</Form.Label>
//                 <Form.Control
//                   name="buildingNo"
//                   type="text"
//                   value={formData.location.address.buildingNo}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//             </Row>
//             <Row className="mb-3">
//               <Form.Group as={Col} md="3" controlId="country">
//                 <Form.Label>Country</Form.Label>
//                 <Form.Control
//                   name="country"
//                   type="text"
//                   value={formData.location.address.country}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//               <Form.Group as={Col} md="3" controlId="stateProvince">
//                 <Form.Label>State/Province</Form.Label>
//                 <Form.Control
//                   name="stateProvince"
//                   type="text"
//                   value={formData.location.address.stateProvince}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//               <Form.Group as={Col} md="3" controlId="city">
//                 <Form.Label>City</Form.Label>
//                 <Form.Control
//                   name="city"
//                   type="text"
//                   value={formData.location.address.city}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//               <Form.Group as={Col} md="3" controlId="zipCode">
//                 <Form.Label>Zip/Postal Code</Form.Label>
//                 <Form.Control
//                   name="zipCode"
//                   type="text"
//                   value={formData.location.address.zipCode}
//                   onChange={handleInputChange}
//                   readOnly={false}
//                 />
//               </Form.Group>
//             </Row>
//           </>
//         )}

//         <hr className="my-4" />
//         <h5
//           className="mb-1"
//           style={{ cursor: "pointer" }}
//           onClick={toggleEquipments}
//         >
//           Job Equipments {showEquipments ? "(-)" : "(+)"}
//         </h5>
//         {showEquipments && (
//           <>
//             <p className="text-muted">Details about the Equipments.</p>
//             <Row className="mb-3">
//               <EquipmentsTable
//                 equipments={equipments}
//                 onSelectedRowsChange={handleSelectedEquipmentsChange}
//               />
//             </Row>
//           </>
//         )}
//         <hr className="my-4" />
//       </Form>
//       <Row className="align-items-center">
//         <Col md={{ span: 4, offset: 8 }} xs={12} className="mt-1">
//           <Button
//             variant="primary"
//             onClick={handleSubmit}
//             className="float-end"
//           >
//             Next
//           </Button>
//         </Col>
//       </Row>
//     </>
//   );
// };

// export default JobSummary;

// // import React, { useState, useEffect } from 'react';
// // import { Row, Col, Form, Button } from 'react-bootstrap';
// // import Select from 'react-select';
// // import EquipmentsTable from 'pages/dashboard/tables/datatable-equipments';
// // import { db } from '../../../../firebase';
// // import { doc, getDoc, updateDoc } from 'firebase/firestore';

// // const JobSummary = ({
// //   jobId,
// //   showServiceLocation,
// //   showEquipments,
// //   toggleServiceLocation,
// //   toggleEquipments
// // }) => {
// //   const [formData, setFormData] = useState({
// //     customerName: '',
// //     firstName: '',
// //     middleName: '',
// //     lastName: '',
// //     phoneNumber: '',
// //     mobilePhone: '',
// //     email: '',
// //     locationName: '',
// //     streetNo: '',
// //     streetAddress: '',
// //     block: '',
// //     buildingNo: '',
// //     country: '',
// //     stateProvince: '',
// //     city: '',
// //     zipCode: '',
// //     equipments: []
// //   });

// //   const [customers, setCustomers] = useState([]);
// //   const [contacts, setContacts] = useState([]);
// //   const [locations, setLocations] = useState([]);
// //   const [equipments, setEquipments] = useState([]);
// //   const [selectedCustomer, setSelectedCustomer] = useState(null);
// //   const [selectedContact, setSelectedContact] = useState(null);
// //   const [selectedLocation, setSelectedLocation] = useState(null);

// //   useEffect(() => {
// //     const fetchJobData = async () => {
// //       try {
// //         const jobRef = doc(db, 'jobs', jobId);
// //         const jobSnap = await getDoc(jobRef);

// //         if (jobSnap.exists()) {
// //           const jobData = jobSnap.data();
// //           setFormData(jobData);

// //           // Find the customer object that matches the customerName from jobData
// //           const selectedCustomer = customers.find(
// //             (customer) => customer.label === jobData.customerName
// //           );
// //           setSelectedCustomer(selectedCustomer);
// //         } else {
// //           console.error('No such document!');
// //         }
// //       } catch (error) {
// //         console.error('Error fetching job data:', error);
// //       }
// //     };

// //     if (jobId) {
// //       fetchJobData();
// //     }
// //   }, [jobId, customers]);

// //   useEffect(() => {
// //     if (selectedCustomer) {
// //       const fetchRelatedData = async () => {
// //         try {
// //           const contactsResponse = await fetch('/api/getContacts', {
// //             method: 'POST',
// //             headers: { 'Content-Type': 'application/json' },
// //             body: JSON.stringify({ cardCode: selectedCustomer.value })
// //           });
// //           const contactsData = await contactsResponse.json();
// //           const formattedContacts = contactsData.map(item => ({
// //             value: item.contactId,
// //             label: item.contactId,
// //             ...item
// //           }));
// //           setContacts(formattedContacts);

// //           // Set selected contact based on formData
// //           const selectedContact = formattedContacts.find(
// //             contact => contact.label === formData.firstName
// //           );
// //           setSelectedContact(selectedContact);

// //         } catch (error) {
// //           console.error('Error fetching contacts:', error);
// //           setContacts([]);
// //         }

// //         try {
// //           const locationsResponse = await fetch('/api/getLocation', {
// //             method: 'POST',
// //             headers: { 'Content-Type': 'application/json' },
// //             body: JSON.stringify({ cardCode: selectedCustomer.value })
// //           });
// //           const locationsData = await locationsResponse.json();
// //           const formattedLocations = locationsData.map(item => ({
// //             value: item.siteId,
// //             label: item.siteId,
// //             ...item
// //           }));
// //           setLocations(formattedLocations);

// //           // Set selected location based on formData
// //           const selectedLocation = formattedLocations.find(
// //             location => location.label === formData.locationName
// //           );
// //           setSelectedLocation(selectedLocation);

// //         } catch (error) {
// //           console.error('Error fetching locations:', error);
// //           setLocations([]);
// //         }

// //         try {
// //           const equipmentsResponse = await fetch('/api/getEquipments', {
// //             method: 'POST',
// //             headers: { 'Content-Type': 'application/json' },
// //             body: JSON.stringify({ cardCode: selectedCustomer.value })
// //           });
// //           const equipmentsData = await equipmentsResponse.json();
// //           const formattedEquipments = equipmentsData.map(item => ({
// //             value: item.ItemCode,
// //             label: item.ItemCode,
// //             ...item
// //           }));
// //           setEquipments(formattedEquipments);
// //         } catch (error) {
// //           console.error('Error fetching equipments:', error);
// //           setEquipments([]);
// //         }
// //       };

// //       fetchRelatedData();
// //     }
// //   }, [selectedCustomer]);

// //   const fetchCustomers = async () => {
// //     try {
// //       const response = await fetch('/api/getCustomers');
// //       const data = await response.json();
// //       const formattedOptions = data.map(item => ({
// //         value: item.cardCode,
// //         label: item.cardCode + ' - ' + item.cardName
// //       }));
// //       setCustomers(formattedOptions);
// //     } catch (error) {
// //       console.error('Error fetching customers:', error);
// //       setCustomers([]);
// //     }
// //   };

// //   useEffect(() => {
// //     fetchCustomers();
// //   }, []);

// //   const handleCustomerChange = (selectedOption) => {
// //     setSelectedContact(null);
// //     setSelectedLocation(null);
// //     setSelectedCustomer(selectedOption);
// //     setFormData(prevFormData => ({
// //       ...prevFormData,
// //       customerName: selectedOption ? selectedOption.label : ''
// //     }));
// //   };

// //   const handleContactChange = (selectedOption) => {
// //     setSelectedContact(selectedOption);
// //     setFormData({
// //       ...formData,
// //       firstName: selectedOption.firstName || '',
// //       middleName: selectedOption.middleName || '',
// //       lastName: selectedOption.lastName || '',
// //       phoneNumber: selectedOption.tel1 || '',
// //       mobilePhone: selectedOption.tel2 || '',
// //       email: selectedOption.email || ''
// //     });
// //   };

// //   const handleLocationChange = (selectedOption) => {
// //     const selectedLocation = locations.find(location => location.value === selectedOption.value);
// //     setSelectedLocation(selectedLocation);
// //     setFormData({
// //       ...formData,
// //       locationName: selectedLocation.siteId,
// //       streetNo: selectedLocation.streetNo || '',
// //       streetAddress: selectedLocation.street || '',
// //       block: selectedLocation.block || '',
// //       buildingNo: selectedLocation.building || '',
// //       country: selectedLocation.countryName || '',
// //       stateProvince: '',
// //       city: selectedLocation.city || '',
// //       zipCode: selectedLocation.zipCode || ''
// //     });
// //   };

// //   const handleSelectedEquipmentsChange = (selectedEquipments) => {
// //     setFormData(prevFormData => ({
// //       ...prevFormData,
// //       equipments: selectedEquipments
// //     }));
// //   };

// //   const handleInputChange = (e) => {
// //     const { name, value, type, checked } = e.target;
// //     setFormData((prevState) => ({
// //       ...prevState,
// //       [name]: type === 'checkbox' ? checked : value
// //     }));
// //   };

// //   const handleSubmit = async () => {
// //     try {
// //       const jobRef = doc(db, 'jobs', jobId);
// //       await updateDoc(jobRef, formData);
// //       alert('Job updated successfully!');
// //     } catch (error) {
// //       console.error('Error updating job:', error);
// //       alert('Error updating the job!');
// //     }
// //   };

// //   return (
// //     <>
// //       <Form noValidate>
// //         <Row className='mb-3'>
// //           <Form.Group as={Col} md="7" controlId="customerList">
// //             <Form.Label>Search Customer</Form.Label>
// //             <Select
// //               instanceId="customer-select"
// //               options={customers}
// //               value={selectedCustomer}
// //               onChange={handleCustomerChange}
// //               placeholder="Enter Customer Name"
// //             />
// //           </Form.Group>
// //         </Row>

// //         <hr className="my-4" />
// //         <h5 className="mb-1">Primary Contact</h5>
// //         <p className="text-muted">Details about the customer.</p>

// //         <Row className="mb-3">
// //           <Form.Group as={Col} md="3" controlId="jobWorker">
// //             <Form.Label>Select Contact ID</Form.Label>
// //             <Select
// //               instanceId="contact-select"
// //               options={contacts}
// //               value={selectedContact}
// //               onChange={handleContactChange}
// //               placeholder="Select Contact ID"
// //             />
// //           </Form.Group>
// //         </Row>

// //         <Row className="mb-3">
// //           <Form.Group as={Col} md="4" controlId="validationCustom01">
// //             <Form.Label>First name</Form.Label>
// //             <Form.Control
// //               required
// //               type="text"
// //               name="firstName"
// //               value={formData.firstName}
// //               onChange={handleInputChange}
// //               readOnly={false}
// //             />
// //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// //           </Form.Group>
// //           <Form.Group as={Col} md="4" controlId="validationCustom02">
// //             <Form.Label>Middle name</Form.Label>
// //             <Form.Control
// //               required
// //               type="text"
// //               name="middleName"
// //               value={formData.middleName}
// //               onChange={handleInputChange}
// //               readOnly={false}
// //             />
// //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// //           </Form.Group>
// //           <Form.Group as={Col} md="4" controlId="validationCustom03">
// //             <Form.Label>Last name</Form.Label>
// //             <Form.Control
// //               required
// //               type="text"
// //               name="lastName"
// //               value={formData.lastName}
// //               onChange={handleInputChange}
// //               readOnly={false}
// //             />
// //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// //           </Form.Group>
// //         </Row>
// //         <Row className="mb-3">
// //           <Form.Group as={Col} md="4" controlId="validationCustomPhoneNumber">
// //             <Form.Label>Phone Number</Form.Label>
// //             <Form.Control
// //               name="phoneNumber"
// //               value={formData.phoneNumber}
// //               onChange={handleInputChange}
// //               type="text"
// //               readOnly={false}
// //             />
// //             <Form.Control.Feedback type="invalid">
// //               Please provide a valid phone number.
// //             </Form.Control.Feedback>
// //           </Form.Group>
// //           <Form.Group as={Col} md="4" controlId="validationCustomMobilePhone">
// //             <Form.Label>Mobile Phone</Form.Label>
// //             <Form.Control
// //               name="mobilePhone"
// //               value={formData.mobilePhone}
// //               onChange={handleInputChange}
// //               type="text"
// //               readOnly={false}
// //             />
// //             <Form.Control.Feedback type="invalid">
// //               Please provide a valid mobile phone number.
// //             </Form.Control.Feedback>
// //           </Form.Group>
// //           <Form.Group as={Col} md="4" controlId="validationCustomEmail">
// //             <Form.Label>Email</Form.Label>
// //             <Form.Control
// //               name="email"
// //               value={formData.email}
// //               onChange={handleInputChange}
// //               type="email"
// //               readOnly={false}
// //             />
// //             <Form.Control.Feedback type="invalid">
// //               Please provide a valid email.
// //             </Form.Control.Feedback>
// //           </Form.Group>
// //         </Row>

// //         <hr className="my-4" />
// //         <h5 className="mb-1" style={{ cursor: 'pointer' }} onClick={toggleServiceLocation}>
// //           Job Address {showServiceLocation ? '(-)' : '(+)'}
// //         </h5>
// //         {showServiceLocation && (
// //           <>
// //             <p className="text-muted">Details about the Job Address.</p>
// //             <Row className="mb-3">
// //               <Form.Group as={Col} md="4" controlId="jobLocation">
// //                 <Form.Label>Select Location ID</Form.Label>
// //                 <Select
// //                   instanceId="location-select"
// //                   options={locations}
// //                   value={selectedLocation}
// //                   onChange={handleLocationChange}
// //                   placeholder="Select Location ID"
// //                 />
// //               </Form.Group>
// //             </Row>
// //             <Row className="mb-3">
// //               <Form.Group as={Col} controlId="locationName">
// //                 <Form.Label>Location Name</Form.Label>
// //                 <Form.Control
// //                   name="locationName"
// //                   type="text"
// //                   value={formData.locationName}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //               <Form.Group as={Col} controlId="streetAddress">
// //                 <Form.Label>Street No.</Form.Label>
// //                 <Form.Control
// //                   name="streetNo"
// //                   type="text"
// //                   value={formData.streetNo}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //               <Form.Group as={Col} controlId="streetAddress">
// //                 <Form.Label>Street Address</Form.Label>
// //                 <Form.Control
// //                   name="streetAddress"
// //                   type="text"
// //                   value={formData.streetAddress}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //             </Row>
// //             <Row className="mb-3">
// //               <Form.Group as={Col} controlId="block">
// //                 <Form.Label>Block</Form.Label>
// //                 <Form.Control
// //                   name="block"
// //                   type="text"
// //                   value={formData.block}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //               <Form.Group as={Col} controlId="building">
// //                 <Form.Label>Building No.</Form.Label>
// //                 <Form.Control
// //                   name="buildingNo"
// //                   type="text"
// //                   value={formData.buildingNo}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //             </Row>
// //             <Row className="mb-3">
// //               <Form.Group as={Col} md="3" controlId="country">
// //                 <Form.Label>Country</Form.Label>
// //                 <Form.Control
// //                   name="country"
// //                   type="text"
// //                   value={formData.country}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //               <Form.Group as={Col} md="3" controlId="stateProvince">
// //                 <Form.Label>State/Province</Form.Label>
// //                 <Form.Control
// //                   name="stateProvince"
// //                   type="text"
// //                   value={formData.stateProvince}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //               <Form.Group as={Col} md="3" controlId="city">
// //                 <Form.Label>City</Form.Label>
// //                 <Form.Control
// //                   name="city"
// //                   type="text"
// //                   value={formData.city}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //               <Form.Group as={Col} md="3" controlId="zipCode">
// //                 <Form.Label>Zip/Postal Code</Form.Label>
// //                 <Form.Control
// //                   name="zipCode"
// //                   type="text"
// //                   value={formData.zipCode}
// //                   onChange={handleInputChange}
// //                   readOnly={false}
// //                 />
// //               </Form.Group>
// //             </Row>
// //           </>
// //         )}

// //         <hr className="my-4" />
// //         <h5 className="mb-1" style={{ cursor: 'pointer' }} onClick={toggleEquipments}>
// //           Job Equipments {showEquipments ? '(-)' : '(+)'}
// //         </h5>
// //         {showEquipments && (
// //           <>
// //             <p className="text-muted">Details about the Equipments.</p>
// //             <Row className='mb-3'>
// //               <EquipmentsTable equipments={equipments} onSelectedRowsChange={handleSelectedEquipmentsChange} />
// //             </Row>
// //           </>
// //         )}
// //         <hr className="my-4" />
// //       </Form>
// //       <Row className="align-items-center">
// //         <Col md={{ span: 4, offset: 8 }} xs={12} className="mt-1">
// //           <Button variant="primary" onClick={handleSubmit} className="float-end">
// //             Update
// //           </Button>
// //         </Col>
// //       </Row>
// //     </>
// //   );
// // };

// // export default JobSummary;

// // // import React, { useState, useEffect } from 'react';
// // // import { Row, Col, Form, Button } from 'react-bootstrap';
// // // import Select from 'react-select';
// // // import EquipmentsTable from 'pages/dashboard/tables/datatable-equipments';
// // // import { db } from '../../../../firebase';
// // // import { doc, getDoc, updateDoc } from 'firebase/firestore';

// // // const JobSummary = ({
// // //   jobId,
// // //   showServiceLocation,
// // //   showEquipments,
// // //   toggleServiceLocation,
// // //   toggleEquipments
// // // }) => {
// // //   const [formData, setFormData] = useState({
// // //     customerName: '',
// // //     firstName: '',
// // //     middleName: '',
// // //     lastName: '',
// // //     phoneNumber: '',
// // //     mobilePhone: '',
// // //     email: '',
// // //     locationName: '',
// // //     streetNo: '',
// // //     streetAddress: '',
// // //     block: '',
// // //     buildingNo: '',
// // //     country: '',
// // //     stateProvince: '',
// // //     city: '',
// // //     zipCode: '',
// // //     equipments: []
// // //   });

// // //   const [customers, setCustomers] = useState([]);
// // //   const [contacts, setContacts] = useState([]);
// // //   const [locations, setLocations] = useState([]);
// // //   const [equipments, setEquipments] = useState([]);
// // //   const [selectedCustomer, setSelectedCustomer] = useState(null);
// // //   const [selectedContact, setSelectedContact] = useState(null);
// // //   const [selectedLocation, setSelectedLocation] = useState(null);

// // //   useEffect(() => {
// // //     const fetchJobData = async () => {
// // //       try {
// // //         const jobRef = doc(db, 'jobs', jobId);
// // //         const jobSnap = await getDoc(jobRef);

// // //         if (jobSnap.exists()) {
// // //           const jobData = jobSnap.data();
// // //           setFormData(jobData);

// // //           // Find the customer object that matches the customerName from jobData
// // //           const selectedCustomer = customers.find(
// // //             (customer) => customer.label === jobData.customerName
// // //           );
// // //           setSelectedCustomer(selectedCustomer);
// // //         } else {
// // //           console.error('No such document!');
// // //         }
// // //       } catch (error) {
// // //         console.error('Error fetching job data:', error);
// // //       }
// // //     };

// // //     if (jobId) {
// // //       fetchJobData();
// // //     }
// // //   }, [jobId, customers]);

// // //   const fetchCustomers = async () => {
// // //     try {
// // //       const response = await fetch('/api/getCustomers');
// // //       const data = await response.json();
// // //       const formattedOptions = data.map(item => ({
// // //         value: item.cardCode,
// // //         label: item.cardCode + ' - ' + item.cardName
// // //       }));
// // //       setCustomers(formattedOptions);
// // //     } catch (error) {
// // //       console.error('Error fetching customers:', error);
// // //       setCustomers([]);
// // //     }
// // //   };

// // //   useEffect(() => {
// // //     fetchCustomers();
// // //   }, []);

// // //   useEffect(() => {
// // //     if (selectedCustomer) {
// // //       const fetchRelatedData = async () => {
// // //         try {
// // //           const contactsResponse = await fetch('/api/getContacts', {
// // //             method: 'POST',
// // //             headers: { 'Content-Type': 'application/json' },
// // //             body: JSON.stringify({ cardCode: selectedCustomer.value })
// // //           });
// // //           const contactsData = await contactsResponse.json();
// // //           const formattedContacts = contactsData.map(item => ({
// // //             value: item.contactId,
// // //             label: item.contactId,
// // //             ...item
// // //           }));
// // //           setContacts(formattedContacts);
// // //         } catch (error) {
// // //           console.error('Error fetching contacts:', error);
// // //           setContacts([]);
// // //         }

// // //         try {
// // //           const locationsResponse = await fetch('/api/getLocation', {
// // //             method: 'POST',
// // //             headers: { 'Content-Type': 'application/json' },
// // //             body: JSON.stringify({ cardCode: selectedCustomer.value })
// // //           });
// // //           const locationsData = await locationsResponse.json();
// // //           const formattedLocations = locationsData.map(item => ({
// // //             value: item.siteId,
// // //             label: item.siteId,
// // //             ...item
// // //           }));
// // //           setLocations(formattedLocations);
// // //         } catch (error) {
// // //           console.error('Error fetching locations:', error);
// // //           setLocations([]);
// // //         }

// // //         try {
// // //           const equipmentsResponse = await fetch('/api/getEquipments', {
// // //             method: 'POST',
// // //             headers: { 'Content-Type': 'application/json' },
// // //             body: JSON.stringify({ cardCode: selectedCustomer.value })
// // //           });
// // //           const equipmentsData = await equipmentsResponse.json();
// // //           const formattedEquipments = equipmentsData.map(item => ({
// // //             value: item.ItemCode,
// // //             label: item.ItemCode,
// // //             ...item
// // //           }));
// // //           setEquipments(formattedEquipments);
// // //         } catch (error) {
// // //           console.error('Error fetching equipments:', error);
// // //           setEquipments([]);
// // //         }
// // //       };

// // //       fetchRelatedData();
// // //     }
// // //   }, [selectedCustomer]);

// // //   const handleCustomerChange = (selectedOption) => {
// // //     setSelectedContact(null);
// // //     setSelectedLocation(null);
// // //     setSelectedCustomer(selectedOption);
// // //     setFormData(prevFormData => ({
// // //       ...prevFormData,
// // //       customerName: selectedOption ? selectedOption.label : ''
// // //     }));
// // //   };

// // //   const handleContactChange = (selectedOption) => {
// // //     setSelectedContact(selectedOption);
// // //     setFormData({
// // //       ...formData,
// // //       firstName: selectedOption.firstName || '',
// // //       middleName: selectedOption.middleName || '',
// // //       lastName: selectedOption.lastName || '',
// // //       phoneNumber: selectedOption.tel1 || '',
// // //       mobilePhone: selectedOption.tel2 || '',
// // //       email: selectedOption.email || ''
// // //     });
// // //   };

// // //   const handleLocationChange = (selectedOption) => {
// // //     const selectedLocation = locations.find(location => location.value === selectedOption.value);
// // //     setSelectedLocation(selectedLocation);
// // //     setFormData({
// // //       ...formData,
// // //       locationName: selectedLocation.siteId,
// // //       streetNo: selectedLocation.streetNo || '',
// // //       streetAddress: selectedLocation.street || '',
// // //       block: selectedLocation.block || '',
// // //       buildingNo: selectedLocation.building || '',
// // //       country: selectedLocation.countryName || '',
// // //       stateProvince: '',
// // //       city: selectedLocation.city || '',
// // //       zipCode: selectedLocation.zipCode || ''
// // //     });
// // //   };

// // //   const handleSelectedEquipmentsChange = (selectedEquipments) => {
// // //     setFormData(prevFormData => ({
// // //       ...prevFormData,
// // //       equipments: selectedEquipments
// // //     }));
// // //   };

// // //   const handleInputChange = (e) => {
// // //     const { name, value, type, checked } = e.target;
// // //     setFormData((prevState) => ({
// // //       ...prevState,
// // //       [name]: type === 'checkbox' ? checked : value
// // //     }));
// // //   };

// // //   const handleSubmit = async () => {
// // //     try {
// // //       const jobRef = doc(db, 'jobs', jobId);
// // //       await updateDoc(jobRef, formData);
// // //       alert('Job updated successfully!');
// // //     } catch (error) {
// // //       console.error('Error updating job:', error);
// // //       alert('Error updating the job!');
// // //     }
// // //   };

// // //   return (
// // //     <>
// // //       <Form noValidate>
// // //         <Row className='mb-3'>
// // //           <Form.Group as={Col} md="7" controlId="customerList">
// // //             <Form.Label>Search Customer</Form.Label>
// // //             <Select
// // //               instanceId="customer-select"
// // //               options={customers}
// // //               value={selectedCustomer}
// // //               onChange={handleCustomerChange}
// // //               placeholder="Enter Customer Name"
// // //             />
// // //           </Form.Group>
// // //         </Row>

// // //         <hr className="my-4" />
// // //         <h5 className="mb-1">Primary Contact</h5>
// // //         <p className="text-muted">Details about the customer.</p>

// // //         <Row className="mb-3">
// // //           <Form.Group as={Col} md="3" controlId="jobWorker">
// // //             <Form.Label>Select Contact ID</Form.Label>
// // //             <Select
// // //               instanceId="contact-select"
// // //               options={contacts}
// // //               value={selectedContact}
// // //               onChange={handleContactChange}
// // //               placeholder="Select Contact ID"
// // //             />
// // //           </Form.Group>
// // //         </Row>

// // //         <Row className="mb-3">
// // //           <Form.Group as={Col} md="4" controlId="validationCustom01">
// // //             <Form.Label>First name</Form.Label>
// // //             <Form.Control
// // //               required
// // //               type="text"
// // //               name="firstName"
// // //               value={formData.firstName}
// // //               onChange={handleInputChange}
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // //           </Form.Group>
// // //           <Form.Group as={Col} md="4" controlId="validationCustom02">
// // //             <Form.Label>Middle name</Form.Label>
// // //             <Form.Control
// // //               required
// // //               type="text"
// // //               name="middleName"
// // //               value={formData.middleName}
// // //               onChange={handleInputChange}
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // //           </Form.Group>
// // //           <Form.Group as={Col} md="4" controlId="validationCustom03">
// // //             <Form.Label>Last name</Form.Label>
// // //             <Form.Control
// // //               required
// // //               type="text"
// // //               name="lastName"
// // //               value={formData.lastName}
// // //               onChange={handleInputChange}
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // //           </Form.Group>
// // //         </Row>
// // //         <Row className="mb-3">
// // //           <Form.Group as={Col} md="4" controlId="validationCustomPhoneNumber">
// // //             <Form.Label>Phone Number</Form.Label>
// // //             <Form.Control
// // //               name="phoneNumber"
// // //               value={formData.phoneNumber}
// // //               onChange={handleInputChange}
// // //               type="text"
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback type="invalid">
// // //               Please provide a valid phone number.
// // //             </Form.Control.Feedback>
// // //           </Form.Group>
// // //           <Form.Group as={Col} md="4" controlId="validationCustomMobilePhone">
// // //             <Form.Label>Mobile Phone</Form.Label>
// // //             <Form.Control
// // //               name="mobilePhone"
// // //               value={formData.mobilePhone}
// // //               onChange={handleInputChange}
// // //               type="text"
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback type="invalid">
// // //               Please provide a valid mobile phone number.
// // //             </Form.Control.Feedback>
// // //           </Form.Group>
// // //           <Form.Group as={Col} md="4" controlId="validationCustomEmail">
// // //             <Form.Label>Email</Form.Label>
// // //             <Form.Control
// // //               name="email"
// // //               value={formData.email}
// // //               onChange={handleInputChange}
// // //               type="email"
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback type="invalid">
// // //               Please provide a valid email.
// // //             </Form.Control.Feedback>
// // //           </Form.Group>
// // //         </Row>

// // //         <hr className="my-4" />
// // //         <h5 className="mb-1" style={{ cursor: 'pointer' }} onClick={toggleServiceLocation}>
// // //           Job Address {showServiceLocation ? '(-)' : '(+)'}
// // //         </h5>
// // //         {showServiceLocation && (
// // //           <>
// // //             <p className="text-muted">Details about the Job Address.</p>
// // //             <Row className="mb-3">
// // //               <Form.Group as={Col} md="4" controlId="jobLocation">
// // //                 <Form.Label>Select Location ID</Form.Label>
// // //                 <Select
// // //                   instanceId="location-select"
// // //                   options={locations}
// // //                   value={selectedLocation}
// // //                   onChange={handleLocationChange}
// // //                   placeholder="Select Location ID"
// // //                 />
// // //               </Form.Group>
// // //             </Row>
// // //             <Row className="mb-3">
// // //               <Form.Group as={Col} controlId="locationName">
// // //                 <Form.Label>Location Name</Form.Label>
// // //                 <Form.Control
// // //                   name="locationName"
// // //                   type="text"
// // //                   value={formData.locationName}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} controlId="streetAddress">
// // //                 <Form.Label>Street No.</Form.Label>
// // //                 <Form.Control
// // //                   name="streetNo"
// // //                   type="text"
// // //                   value={formData.streetNo}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} controlId="streetAddress">
// // //                 <Form.Label>Street Address</Form.Label>
// // //                 <Form.Control
// // //                   name="streetAddress"
// // //                   type="text"
// // //                   value={formData.streetAddress}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //             </Row>
// // //             <Row className="mb-3">
// // //               <Form.Group as={Col} controlId="block">
// // //                 <Form.Label>Block</Form.Label>
// // //                 <Form.Control
// // //                   name="block"
// // //                   type="text"
// // //                   value={formData.block}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} controlId="building">
// // //                 <Form.Label>Building No.</Form.Label>
// // //                 <Form.Control
// // //                   name="buildingNo"
// // //                   type="text"
// // //                   value={formData.buildingNo}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //             </Row>
// // //             <Row className="mb-3">
// // //               <Form.Group as={Col} md="3" controlId="country">
// // //                 <Form.Label>Country</Form.Label>
// // //                 <Form.Control
// // //                   name="country"
// // //                   type="text"
// // //                   value={formData.country}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} md="3" controlId="stateProvince">
// // //                 <Form.Label>State/Province</Form.Label>
// // //                 <Form.Control
// // //                   name="stateProvince"
// // //                   type="text"
// // //                   value={formData.stateProvince}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} md="3" controlId="city">
// // //                 <Form.Label>City</Form.Label>
// // //                 <Form.Control
// // //                   name="city"
// // //                   type="text"
// // //                   value={formData.city}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} md="3" controlId="zipCode">
// // //                 <Form.Label>Zip/Postal Code</Form.Label>
// // //                 <Form.Control
// // //                   name="zipCode"
// // //                   type="text"
// // //                   value={formData.zipCode}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //             </Row>
// // //           </>
// // //         )}

// // //         <hr className="my-4" />
// // //         <h5 className="mb-1" style={{ cursor: 'pointer' }} onClick={toggleEquipments}>
// // //           Job Equipments {showEquipments ? '(-)' : '(+)'}
// // //         </h5>
// // //         {showEquipments && (
// // //           <>
// // //             <p className="text-muted">Details about the Equipments.</p>
// // //             <Row className='mb-3'>
// // //               <EquipmentsTable equipments={equipments} onSelectedRowsChange={handleSelectedEquipmentsChange} />
// // //             </Row>
// // //           </>
// // //         )}
// // //         <hr className="my-4" />
// // //       </Form>
// // //       <Row className="align-items-center">
// // //         <Col md={{ span: 4, offset: 8 }} xs={12} className="mt-1">
// // //           <Button variant="primary" onClick={handleSubmit} className="float-end">
// // //             Update
// // //           </Button>
// // //         </Col>
// // //       </Row>
// // //     </>
// // //   );
// // // };

// // // export default JobSummary;

// // // import React, { useState, useEffect } from 'react';
// // // import { Row, Col, Form, Button } from 'react-bootstrap';
// // // import Select from 'react-select';
// // // import EquipmentsTable from 'pages/dashboard/tables/datatable-equipments';
// // // import { db } from '../../../../firebase';
// // // import { doc, getDoc, updateDoc } from 'firebase/firestore';

// // // const JobSummary = ({
// // //   jobId,
// // //   showServiceLocation,
// // //   showEquipments,
// // //   toggleServiceLocation,
// // //   toggleEquipments
// // // }) => {
// // //   const [formData, setFormData] = useState({
// // //     customerName: '',
// // //     firstName: '',
// // //     middleName: '',
// // //     lastName: '',
// // //     phoneNumber: '',
// // //     mobilePhone: '',
// // //     email: '',
// // //     locationName: '',
// // //     streetNo: '',
// // //     streetAddress: '',
// // //     block: '',
// // //     buildingNo: '',
// // //     country: '',
// // //     stateProvince: '',
// // //     city: '',
// // //     zipCode: '',
// // //     equipments: []
// // //   });

// // //   const [customers, setCustomers] = useState([]);
// // //   const [contacts, setContacts] = useState([]);
// // //   const [locations, setLocations] = useState([]);
// // //   const [equipments, setEquipments] = useState([]);
// // //   const [selectedCustomer, setSelectedCustomer] = useState(null);
// // //   const [selectedContact, setSelectedContact] = useState(null);
// // //   const [selectedLocation, setSelectedLocation] = useState(null);

// // //   useEffect(() => {
// // //     const fetchJobData = async () => {
// // //       try {
// // //         const jobRef = doc(db, 'jobs', jobId);
// // //         const jobSnap = await getDoc(jobRef);

// // //         if (jobSnap.exists()) {
// // //           const jobData = jobSnap.data();
// // //           setFormData(jobData);

// // //           // Find the customer object that matches the customerName from jobData
// // //           const selectedCustomer = customers.find(
// // //             (customer) => customer.value === jobData.customerName
// // //           );
// // //           setSelectedCustomer(selectedCustomer);
// // //         } else {
// // //           console.error('No such document!');
// // //         }
// // //       } catch (error) {
// // //         console.error('Error fetching job data:', error);
// // //       }
// // //     };

// // //     if (jobId) {
// // //       fetchJobData();
// // //     }
// // //   }, [jobId, customers]);

// // //   const fetchCustomers = async () => {
// // //     try {
// // //       const response = await fetch('/api/getCustomers');
// // //       const data = await response.json();
// // //       const formattedOptions = data.map(item => ({
// // //         value: item.cardCode,
// // //         label: item.cardCode + ' - ' + item.cardName
// // //       }));
// // //       setCustomers(formattedOptions);
// // //     } catch (error) {
// // //       console.error('Error fetching customers:', error);
// // //       setCustomers([]);
// // //     }
// // //   };

// // //   useEffect(() => {
// // //     fetchCustomers();
// // //   }, []);

// // //   const handleCustomerChange = async (selectedOption) => {
// // //     setSelectedContact(null);
// // //     setSelectedLocation(null);
// // //     setSelectedCustomer(selectedOption);
// // //     const selectedCustomer = customers.find(option => option.value === selectedOption.value);
// // //     setFormData({ ...formData, customerName: selectedCustomer ? selectedCustomer.label : '' });

// // //     try {
// // //       const contactsResponse = await fetch('/api/getContacts', {
// // //         method: 'POST',
// // //         headers: { 'Content-Type': 'application/json' },
// // //         body: JSON.stringify({ cardCode: selectedOption.value })
// // //       });
// // //       const contactsData = await contactsResponse.json();
// // //       const formattedContacts = contactsData.map(item => ({
// // //         value: item.contactId,
// // //         label: item.contactId,
// // //         ...item
// // //       }));
// // //       setContacts(formattedContacts);
// // //     } catch (error) {
// // //       console.error('Error fetching contacts:', error);
// // //       setContacts([]);
// // //     }

// // //     try {
// // //       const locationsResponse = await fetch('/api/getLocation', {
// // //         method: 'POST',
// // //         headers: { 'Content-Type': 'application/json' },
// // //         body: JSON.stringify({ cardCode: selectedOption.value })
// // //       });
// // //       const locationsData = await locationsResponse.json();
// // //       const formattedLocations = locationsData.map(item => ({
// // //         value: item.siteId,
// // //         label: item.siteId,
// // //         ...item
// // //       }));
// // //       setLocations(formattedLocations);
// // //     } catch (error) {
// // //       console.error('Error fetching locations:', error);
// // //       setLocations([]);
// // //     }

// // //     try {
// // //       const equipmentsResponse = await fetch('/api/getEquipments', {
// // //         method: 'POST',
// // //         headers: { 'Content-Type': 'application/json' },
// // //         body: JSON.stringify({ cardCode: selectedOption.value })
// // //       });
// // //       const equipmentsData = await equipmentsResponse.json();
// // //       const formattedEquipments = equipmentsData.map(item => ({
// // //         value: item.ItemCode,
// // //         label: item.ItemCode,
// // //         ...item
// // //       }));
// // //       setEquipments(formattedEquipments);
// // //     } catch (error) {
// // //       console.error('Error fetching equipments:', error);
// // //       setEquipments([]);
// // //     }
// // //   };

// // //   const handleContactChange = (selectedOption) => {
// // //     setSelectedContact(selectedOption);
// // //     setFormData({
// // //       ...formData,
// // //       firstName: selectedOption.firstName || '',
// // //       middleName: selectedOption.middleName || '',
// // //       lastName: selectedOption.lastName || '',
// // //       phoneNumber: selectedOption.tel1 || '',
// // //       mobilePhone: selectedOption.tel2 || '',
// // //       email: selectedOption.email || ''
// // //     });
// // //   };

// // //   const handleLocationChange = (selectedOption) => {
// // //     const selectedLocation = locations.find(location => location.value === selectedOption.value);
// // //     setSelectedLocation(selectedLocation);
// // //     setFormData({
// // //       ...formData,
// // //       locationName: selectedLocation.siteId,
// // //       streetNo: selectedLocation.streetNo || '',
// // //       streetAddress: selectedLocation.street || '',
// // //       block: selectedLocation.block || '',
// // //       buildingNo: selectedLocation.building || '',
// // //       country: selectedLocation.countryName || '',
// // //       stateProvince: '',
// // //       city: selectedLocation.city || '',
// // //       zipCode: selectedLocation.zipCode || ''
// // //     });
// // //   };

// // //   const handleSelectedEquipmentsChange = (selectedEquipments) => {
// // //     setFormData(prevFormData => ({
// // //       ...prevFormData,
// // //       equipments: selectedEquipments
// // //     }));
// // //   };

// // //   const handleInputChange = (e) => {
// // //     const { name, value, type, checked } = e.target;
// // //     setFormData((prevState) => ({
// // //       ...prevState,
// // //       [name]: type === 'checkbox' ? checked : value
// // //     }));
// // //   };

// // //   const handleSubmit = async () => {
// // //     try {
// // //       const jobRef = doc(db, 'jobs', jobId);
// // //       await updateDoc(jobRef, formData);
// // //       alert('Job updated successfully!');
// // //     } catch (error) {
// // //       console.error('Error updating job:', error);
// // //       alert('Error updating the job!');
// // //     }
// // //   };

// // //   return (
// // //     <>
// // //       <Form noValidate>
// // //         <Row className='mb-3'>
// // //           <Form.Group as={Col} md="7" controlId="customerList">
// // //             <Form.Label>Search Customer</Form.Label>
// // //             <Select
// // //               instanceId="customer-select"
// // //               options={customers}
// // //               value={selectedCustomer}
// // //               onChange={handleCustomerChange}
// // //               placeholder="Enter Customer Name"
// // //             />
// // //           </Form.Group>
// // //         </Row>

// // //         <hr className="my-4" />
// // //         <h5 className="mb-1">Primary Contact</h5>
// // //         <p className="text-muted">Details about the customer.</p>

// // //         <Row className="mb-3">
// // //           <Form.Group as={Col} md="3" controlId="jobWorker">
// // //             <Form.Label>Select Contact ID</Form.Label>
// // //             <Select
// // //               instanceId="contact-select"
// // //               options={contacts}
// // //               value={selectedContact}
// // //               onChange={handleContactChange}
// // //               placeholder="Select Contact ID"
// // //             />
// // //           </Form.Group>
// // //         </Row>

// // //         <Row className="mb-3">
// // //           <Form.Group as={Col} md="4" controlId="validationCustom01">
// // //             <Form.Label>First name</Form.Label>
// // //             <Form.Control
// // //               required
// // //               type="text"
// // //               name="firstName"
// // //               value={formData.firstName}
// // //               onChange={handleInputChange}
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // //           </Form.Group>
// // //           <Form.Group as={Col} md="4" controlId="validationCustom02">
// // //             <Form.Label>Middle name</Form.Label>
// // //             <Form.Control
// // //               required
// // //               type="text"
// // //               name="middleName"
// // //               value={formData.middleName}
// // //               onChange={handleInputChange}
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // //           </Form.Group>
// // //           <Form.Group as={Col} md="4" controlId="validationCustom03">
// // //             <Form.Label>Last name</Form.Label>
// // //             <Form.Control
// // //               required
// // //               type="text"
// // //               name="lastName"
// // //               value={formData.lastName}
// // //               onChange={handleInputChange}
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // //           </Form.Group>
// // //         </Row>
// // //         <Row className="mb-3">
// // //           <Form.Group as={Col} md="4" controlId="validationCustomPhoneNumber">
// // //             <Form.Label>Phone Number</Form.Label>
// // //             <Form.Control
// // //               name="phoneNumber"
// // //               value={formData.phoneNumber}
// // //               onChange={handleInputChange}
// // //               type="text"
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback type="invalid">
// // //               Please provide a valid phone number.
// // //             </Form.Control.Feedback>
// // //           </Form.Group>
// // //           <Form.Group as={Col} md="4" controlId="validationCustomMobilePhone">
// // //             <Form.Label>Mobile Phone</Form.Label>
// // //             <Form.Control
// // //               name="mobilePhone"
// // //               value={formData.mobilePhone}
// // //               onChange={handleInputChange}
// // //               type="text"
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback type="invalid">
// // //               Please provide a valid mobile phone number.
// // //             </Form.Control.Feedback>
// // //           </Form.Group>
// // //           <Form.Group as={Col} md="4" controlId="validationCustomEmail">
// // //             <Form.Label>Email</Form.Label>
// // //             <Form.Control
// // //               name="email"
// // //               value={formData.email}
// // //               onChange={handleInputChange}
// // //               type="email"
// // //               readOnly={false}
// // //             />
// // //             <Form.Control.Feedback type="invalid">
// // //               Please provide a valid email.
// // //             </Form.Control.Feedback>
// // //           </Form.Group>
// // //         </Row>

// // //         <hr className="my-4" />
// // //         <h5 className="mb-1" style={{ cursor: 'pointer' }} onClick={toggleServiceLocation}>
// // //           Job Address {showServiceLocation ? '(-)' : '(+)'}
// // //         </h5>
// // //         {showServiceLocation && (
// // //           <>
// // //             <p className="text-muted">Details about the Job Address.</p>
// // //             <Row className="mb-3">
// // //               <Form.Group as={Col} md="4" controlId="jobLocation">
// // //                 <Form.Label>Select Location ID</Form.Label>
// // //                 <Select
// // //                   instanceId="location-select"
// // //                   options={locations}
// // //                   value={selectedLocation}
// // //                   onChange={handleLocationChange}
// // //                   placeholder="Select Location ID"
// // //                 />
// // //               </Form.Group>
// // //             </Row>
// // //             <Row className="mb-3">
// // //               <Form.Group as={Col} controlId="locationName">
// // //                 <Form.Label>Location Name</Form.Label>
// // //                 <Form.Control
// // //                   name="locationName"
// // //                   type="text"
// // //                   value={formData.locationName}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} controlId="streetAddress">
// // //                 <Form.Label>Street No.</Form.Label>
// // //                 <Form.Control
// // //                   name="streetNo"
// // //                   type="text"
// // //                   value={formData.streetNo}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} controlId="streetAddress">
// // //                 <Form.Label>Street Address</Form.Label>
// // //                 <Form.Control
// // //                   name="streetAddress"
// // //                   type="text"
// // //                   value={formData.streetAddress}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //             </Row>
// // //             <Row className="mb-3">
// // //               <Form.Group as={Col} controlId="block">
// // //                 <Form.Label>Block</Form.Label>
// // //                 <Form.Control
// // //                   name="block"
// // //                   type="text"
// // //                   value={formData.block}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} controlId="building">
// // //                 <Form.Label>Building No.</Form.Label>
// // //                 <Form.Control
// // //                   name="buildingNo"
// // //                   type="text"
// // //                   value={formData.buildingNo}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //             </Row>
// // //             <Row className="mb-3">
// // //               <Form.Group as={Col} md="3" controlId="country">
// // //                 <Form.Label>Country</Form.Label>
// // //                 <Form.Control
// // //                   name="country"
// // //                   type="text"
// // //                   value={formData.country}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} md="3" controlId="stateProvince">
// // //                 <Form.Label>State/Province</Form.Label>
// // //                 <Form.Control
// // //                   name="stateProvince"
// // //                   type="text"
// // //                   value={formData.stateProvince}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} md="3" controlId="city">
// // //                 <Form.Label>City</Form.Label>
// // //                 <Form.Control
// // //                   name="city"
// // //                   type="text"
// // //                   value={formData.city}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //               <Form.Group as={Col} md="3" controlId="zipCode">
// // //                 <Form.Label>Zip/Postal Code</Form.Label>
// // //                 <Form.Control
// // //                   name="zipCode"
// // //                   type="text"
// // //                   value={formData.zipCode}
// // //                   onChange={handleInputChange}
// // //                   readOnly={false}
// // //                 />
// // //               </Form.Group>
// // //             </Row>
// // //           </>
// // //         )}

// // //         <hr className="my-4" />
// // //         <h5 className="mb-1" style={{ cursor: 'pointer' }} onClick={toggleEquipments}>
// // //           Job Equipments {showEquipments ? '(-)' : '(+)'}
// // //         </h5>
// // //         {showEquipments && (
// // //           <>
// // //             <p className="text-muted">Details about the Equipments.</p>
// // //             <Row className='mb-3'>
// // //               <EquipmentsTable equipments={equipments} onSelectedRowsChange={handleSelectedEquipmentsChange} />
// // //             </Row>
// // //           </>
// // //         )}
// // //         <hr className="my-4" />
// // //       </Form>
// // //       <Row className="align-items-center">
// // //         <Col md={{ span: 4, offset: 8 }} xs={12} className="mt-1">
// // //           <Button variant="primary" onClick={handleSubmit} className="float-end">
// // //             Update
// // //           </Button>
// // //         </Col>
// // //       </Row>
// // //     </>
// // //   );
// // // };

// // // export default JobSummary;

// // // // import React, { useState, useEffect } from 'react';
// // // // import { Row, Col, Form, Button } from 'react-bootstrap';
// // // // import Select from 'react-select';
// // // // import EquipmentsTable from 'pages/dashboard/tables/datatable-equipments';
// // // // import { db } from '../../../../firebase';
// // // // import { doc, getDoc, updateDoc } from 'firebase/firestore';

// // // // const JobSummary = ({
// // // //   jobId,
// // // //   selectedCustomer,
// // // //   selectedContact,
// // // //   selectedLocation,
// // // //   showServiceLocation,
// // // //   showEquipments,
// // // //   toggleServiceLocation,
// // // //   toggleEquipments
// // // // }) => {
// // // //   const [formData, setFormData] = useState({
// // // //     customerName: '',
// // // //     firstName: '',
// // // //     middleName: '',
// // // //     lastName: '',
// // // //     phoneNumber: '',
// // // //     mobilePhone: '',
// // // //     email: '',
// // // //     locationName: '',
// // // //     streetNo: '',
// // // //     streetAddress: '',
// // // //     block: '',
// // // //     buildingNo: '',
// // // //     country: '',
// // // //     stateProvince: '',
// // // //     city: '',
// // // //     zipCode: '',
// // // //     equipments: []
// // // //   });

// // // //   const [customers, setCustomers] = useState([]);
// // // //   const [selectedCustomerOption, setSelectedCustomerOption] = useState(null);

// // // //   useEffect(() => {
// // // //     const fetchJobData = async () => {
// // // //       try {
// // // //         const jobRef = doc(db, 'jobs', jobId);
// // // //         const jobSnap = await getDoc(jobRef);

// // // //         if (jobSnap.exists()) {
// // // //           setFormData(jobSnap.data());
// // // //           const selectedCustomer = customers.find(
// // // //             (customer) => customer.value === jobSnap.data().customerName
// // // //           );
// // // //           setSelectedCustomerOption(selectedCustomer);
// // // //         } else {
// // // //           console.error('No such document!');
// // // //         }
// // // //       } catch (error) {
// // // //         console.error('Error fetching job data:', error);
// // // //       }
// // // //     };

// // // //     if (jobId) {
// // // //       fetchJobData();
// // // //     }
// // // //   }, [jobId, customers]);

// // // //   const fetchCustomers = async () => {
// // // //     try {
// // // //       const response = await fetch('/api/getCustomers');
// // // //       const data = await response.json();
// // // //       const formattedOptions = data.map(item => ({
// // // //         value: item.cardCode,
// // // //         label: item.cardCode + ' - ' + item.cardName
// // // //       }));
// // // //       setCustomers(formattedOptions);
// // // //     } catch (error) {
// // // //       console.error('Error fetching customers:', error);
// // // //       setCustomers([]);
// // // //     }
// // // //   };

// // // //   useEffect(() => {
// // // //     fetchCustomers();
// // // //   }, []);

// // // //   console.log(formData.customerName);

// // // //  const handleInputChange = (e) => {
// // // //     const { name, value, type, checked } = e.target;
// // // //     setFormData((prevState) => ({
// // // //       ...prevState,
// // // //       [name]: type === 'checkbox' ? checked : value
// // // //     }));
// // // //   };

// // // //   const handleCustomerChange = (selectedOption) => {
// // // //     setSelectedCustomerOption(selectedOption);
// // // //     setFormData((prevState) => ({
// // // //       ...prevState,
// // // //       customerName: selectedOption ? selectedOption.value : ''
// // // //     }));
// // // //   };

// // // //  const handleSubmit = async () => {
// // // //     try {
// // // //       const jobRef = doc(db, 'jobs', jobId);
// // // //       await updateDoc(jobRef, formData);
// // // //       alert('Job updated successfully!');
// // // //     } catch (error) {
// // // //       console.error('Error updating job:', error);
// // // //       alert('Error updating the job!');
// // // //     }
// // // //   };

// // // //   return (
// // // //     <>
// // // //       <Form noValidate>
// // // //         <Row className='mb-3'>
// // // //           <Form.Group as={Col} md="7" controlId="customerList">
// // // //             <Form.Label>Search Customer</Form.Label>
// // // //             <Select
// // // //               instanceId="customer-select"
// // // //               options={[]} // Empty options for now
// // // //               value={formData.customerName}
// // // //               placeholder="Enter Customer Name"
// // // //             />
// // // //           </Form.Group>
// // // //         </Row>

// // // //         <hr className="my-4" />
// // // //         <h5 className="mb-1">Primary Contact</h5>
// // // //         <p className="text-muted">Details about the customer.</p>

// // // //         <Row className="mb-3">
// // // //           <Form.Group as={Col} md="3" controlId="jobWorker">
// // // //             <Form.Label>Select Contact ID</Form.Label>
// // // //             <Select
// // // //               instanceId="contact-select"
// // // //               options={[]} // Empty options for now
// // // //               value={selectedContact}
// // // //               placeholder="Select Contact ID"
// // // //             />
// // // //           </Form.Group>
// // // //         </Row>

// // // //         <Row className="mb-3">
// // // //           <Form.Group as={Col} md="4" controlId="validationCustom01">
// // // //             <Form.Label>First name</Form.Label>
// // // //             <Form.Control
// // // //               required
// // // //               type="text"
// // // //               name="firstName"
// // // //               value={formData.firstName}
// // // //               onChange={handleInputChange}
// // // //               readOnly={false}
// // // //             />
// // // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // // //           </Form.Group>
// // // //           <Form.Group as={Col} md="4" controlId="validationCustom02">
// // // //             <Form.Label>Middle name</Form.Label>
// // // //             <Form.Control
// // // //               required
// // // //               type="text"
// // // //               name="middleName"
// // // //               value={formData.middleName}
// // // //               onChange={handleInputChange}
// // // //               readOnly={false}
// // // //             />
// // // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // // //           </Form.Group>
// // // //           <Form.Group as={Col} md="4" controlId="validationCustom03">
// // // //             <Form.Label>Last name</Form.Label>
// // // //             <Form.Control
// // // //               required
// // // //               type="text"
// // // //               name="lastName"
// // // //               value={formData.lastName}
// // // //               onChange={handleInputChange}
// // // //               readOnly={false}
// // // //             />
// // // //             <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
// // // //           </Form.Group>
// // // //         </Row>
// // // //         <Row className="mb-3">
// // // //           <Form.Group as={Col} md="4" controlId="validationCustomPhoneNumber">
// // // //             <Form.Label>Phone Number</Form.Label>
// // // //             <Form.Control
// // // //               name="phoneNumber"
// // // //               value={formData.phoneNumber}
// // // //               onChange={handleInputChange}
// // // //               type="text"
// // // //               readOnly={false}
// // // //             />
// // // //             <Form.Control.Feedback type="invalid">
// // // //               Please provide a valid phone number.
// // // //             </Form.Control.Feedback>
// // // //           </Form.Group>
// // // //           <Form.Group as={Col} md="4" controlId="validationCustomMobilePhone">
// // // //             <Form.Label>Mobile Phone</Form.Label>
// // // //             <Form.Control
// // // //               name="mobilePhone"
// // // //               value={formData.mobilePhone}
// // // //               onChange={handleInputChange}
// // // //               type="text"
// // // //               readOnly={false}
// // // //             />
// // // //             <Form.Control.Feedback type="invalid">
// // // //               Please provide a valid mobile phone number.
// // // //             </Form.Control.Feedback>
// // // //           </Form.Group>
// // // //           <Form.Group as={Col} md="4" controlId="validationCustomEmail">
// // // //             <Form.Label>Email</Form.Label>
// // // //             <Form.Control
// // // //               name="email"
// // // //               value={formData.email}
// // // //               onChange={handleInputChange}
// // // //               type="email"
// // // //               readOnly={false}
// // // //             />
// // // //             <Form.Control.Feedback type="invalid">
// // // //               Please provide a valid email.
// // // //             </Form.Control.Feedback>
// // // //           </Form.Group>
// // // //         </Row>

// // // //         <hr className="my-4" />
// // // //         <h5 className="mb-1" style={{ cursor: 'pointer' }} onClick={toggleServiceLocation}>
// // // //           Job Address {showServiceLocation ? '(-)' : '(+)'}
// // // //         </h5>
// // // //         {showServiceLocation && (
// // // //           <>
// // // //             <p className="text-muted">Details about the Job Address.</p>
// // // //             <Row className="mb-3">
// // // //               <Form.Group as={Col} md="4" controlId="jobLocation">
// // // //                 <Form.Label>Select Location ID</Form.Label>
// // // //                 <Select
// // // //                   instanceId="location-select"
// // // //                   options={[]} // Empty options for now
// // // //                   value={selectedLocation}
// // // //                   placeholder="Select Location ID"
// // // //                 />
// // // //               </Form.Group>
// // // //             </Row>
// // // //             <Row className="mb-3">
// // // //               <Form.Group as={Col} controlId="locationName">
// // // //                 <Form.Label>Location Name</Form.Label>
// // // //                 <Form.Control
// // // //                   name="locationName"
// // // //                   type="text"
// // // //                   value={formData.locationName}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //               <Form.Group as={Col} controlId="streetAddress">
// // // //                 <Form.Label>Street No.</Form.Label>
// // // //                 <Form.Control
// // // //                   name="streetNo"
// // // //                   type="text"
// // // //                   value={formData.streetNo}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //               <Form.Group as={Col} controlId="streetAddress">
// // // //                 <Form.Label>Street Address</Form.Label>
// // // //                 <Form.Control
// // // //                   name="streetAddress"
// // // //                   type="text"
// // // //                   value={formData.streetAddress}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //             </Row>
// // // //             <Row className="mb-3">
// // // //               <Form.Group as={Col} controlId="block">
// // // //                 <Form.Label>Block</Form.Label>
// // // //                 <Form.Control
// // // //                   name="block"
// // // //                   type="text"
// // // //                   value={formData.block}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //               <Form.Group as={Col} controlId="building">
// // // //                 <Form.Label>Building No.</Form.Label>
// // // //                 <Form.Control
// // // //                   name="buildingNo"
// // // //                   type="text"
// // // //                   value={formData.buildingNo}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //             </Row>
// // // //             <Row className="mb-3">
// // // //               <Form.Group as={Col} md="3" controlId="country">
// // // //                 <Form.Label>Country</Form.Label>
// // // //                 <Form.Control
// // // //                   name="country"
// // // //                   type="text"
// // // //                   value={formData.country}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //               <Form.Group as={Col} md="3" controlId="stateProvince">
// // // //                 <Form.Label>State/Province</Form.Label>
// // // //                 <Form.Control
// // // //                   name="stateProvince"
// // // //                   type="text"
// // // //                   value={formData.stateProvince}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //               <Form.Group as={Col} md="3" controlId="city">
// // // //                 <Form.Label>City</Form.Label>
// // // //                 <Form.Control
// // // //                   name="city"
// // // //                   type="text"
// // // //                   value={formData.city}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //               <Form.Group as={Col} md="3" controlId="zipCode">
// // // //                 <Form.Label>Zip/Postal Code</Form.Label>
// // // //                 <Form.Control
// // // //                   name="zipCode"
// // // //                   type="text"
// // // //                   value={formData.zipCode}
// // // //                   onChange={handleInputChange}
// // // //                   readOnly={false}
// // // //                 />
// // // //               </Form.Group>
// // // //             </Row>
// // // //           </>
// // // //         )}

// // // //         <hr className="my-4" />
// // // //         <h5 className="mb-1" style={{ cursor: 'pointer' }} onClick={toggleEquipments}>
// // // //           Job Equipments {showEquipments ? '(-)' : '(+)'}
// // // //         </h5>
// // // //         {showEquipments && (
// // // //           <>
// // // //             <p className="text-muted">Details about the Equipments.</p>
// // // //             <Row className='mb-3'>
// // // //               <EquipmentsTable equipments={[]} onSelectedRowsChange={() => {}} /> {/* Empty equipments for now */}
// // // //             </Row>
// // // //           </>
// // // //         )}
// // // //         <hr className="my-4" />
// // // //       </Form>
// // // //       <Row className="align-items-center">
// // // //         <Col md={{ span: 4, offset: 8 }} xs={12} className="mt-1">
// // // //           <Button variant="primary" onClick={handleSubmit} className="float-end">
// // // //             Update
// // // //           </Button>
// // // //         </Col>
// // // //       </Row>
// // // //     </>
// // // //   );
// // // // };

// // // // export default JobSummary;
