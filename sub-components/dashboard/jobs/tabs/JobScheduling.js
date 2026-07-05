// import React, { useState, useEffect } from "react";
// import { Row, Col, Form, InputGroup, Button } from "react-bootstrap";
// import Select from "react-select";
// import { db } from "../../../../firebase";
// import { collection, getDocs } from "firebase/firestore";
// import DatePicker from "react-datepicker"; // Import DatePicker
// import "react-datepicker/dist/react-datepicker.css"; // Import the CSS for DatePicker
// import format from "date-fns/format";
// import parse from "date-fns/parse";

// const JobScheduling = ({
//   formData,
//   selectedWorkers,
//   handleInputChange,
//   handleWorkersChange,
//   handleSubmit,
//   jobId,
// }) => {
//   const [workers, setWorkers] = useState([]);

//   useEffect(() => {
//     const fetchUsers = async () => {
//       try {
//         const usersCollection = collection(db, "users");
//         const usersSnapshot = await getDocs(usersCollection);
//         const usersList = usersSnapshot.docs.map((doc) => ({
//           value: doc.id,
//           label:
//             doc.data().workerId +
//             " - " +
//             doc.data().firstName +
//             " " +
//             doc.data().lastName,
//         }));
//         setWorkers(usersList);
//       } catch (error) {
//         console.error("Error fetching users:", error);
//       }
//     };
//     fetchUsers();
//   }, []);

//   const assignedWorkersOptions = workers.filter((worker) =>
//     selectedWorkers.map((sw) => sw.workerId).includes(worker.value)
//   );

//   // Convert dates to DD/MM/YYYY format for display
//   const formatDateForDisplay = (dateString) => {
//     if (!dateString) return "";
//     const date = new Date(dateString);
//     return format(date, "dd/MM/yyyy");
//   };

//   return (
//     <Form
//       onSubmit={(e) => {
//         e.preventDefault(); // Prevent the default form submission behavior
//         handleSubmit(); // Call the submission handler passed from the parent
//       }}
//     >
//       <Row className="mb-3">
//         <Col xs="auto">
//           <Form.Group as={Col} controlId="jobNo">
//             <Form.Label>Job No.</Form.Label>
//             <Form.Control
//               type="text"
//               value={jobId}
//               readOnly
//               style={{ width: "95px" }}
//             />
//           </Form.Group>
//         </Col>
//         <Form.Group as={Col} controlId="jobName">
//           <Form.Label>Job Name</Form.Label>
//           <Form.Control
//             type="text"
//             name="jobName"
//             value={formData.jobName}
//             onChange={handleInputChange}
//             placeholder="Enter Job Name"
//           />
//         </Form.Group>
//       </Row>
//       <Row className="mb-3">
//         <Form.Group controlId="description">
//           <Form.Label>Description</Form.Label>
//           <Form.Control
//             as="textarea"
//             name="description"
//             value={formData.description}
//             onChange={handleInputChange}
//             rows={3}
//             placeholder="Enter job description"
//           />
//         </Form.Group>
//       </Row>
//       <Row className="mb-3">
//         <Form.Group as={Col} md="4" controlId="jobPriority">
//           <Form.Label>Job Priority</Form.Label>
//           <Form.Select
//             name="jobPriority"
//             value={formData.priority}
//             onChange={handleInputChange}
//             aria-label="Select job category"
//           >
//             <option value="" disabled>
//               Select Priority
//             </option>
//             <option value="Low">Low</option>
//             <option value="Normal">Normal</option>
//             <option value="High">High</option>
//           </Form.Select>
//         </Form.Group>
//         <Form.Group as={Col} md="4" controlId="jobStatus">
//           <Form.Label>Job Status</Form.Label>
//           <Form.Select
//             name="jobStatus"
//             value={formData.jobStatus}
//             onChange={handleInputChange}
//             aria-label="Select job status"
//           >
//             <option value="" disabled>
//               Select Status
//             </option>
//             <option value="C">Created</option>
//             <option value="CO">Confirm</option>
//             <option value="CA">Cancel</option>
//             <option value="JS">Job Started</option>
//             <option value="JC">Job Complete</option>
//             <option value="V">Validate</option>
//             <option value="S">Scheduled</option>
//             <option value="US">Unscheduled</option>
//             <option value="RS">Re-scheduled</option>
//           </Form.Select>
//         </Form.Group>
//         <Form.Group as={Col} md="4" controlId="jobWorker">
//           <Form.Label>Assigned Worker</Form.Label>
//           <Select
//             instanceId="worker-select"
//             isMulti
//             options={workers}
//             value={assignedWorkersOptions}
//             onChange={handleWorkersChange} // Update workers in parent state
//             placeholder="Search Worker"
//           />
//         </Form.Group>
//       </Row>
//       <Row className="mb-3">
//         <Form.Group as={Col} md="4" controlId="startDate">
//           <Form.Label>Start Date</Form.Label>
//           <div>
//             <DatePicker
//               selected={
//                 formData.startDate ? new Date(formData.startDate) : null
//               }
//               onChange={(date) => {
//                 handleInputChange({
//                   target: {
//                     name: "startDate",
//                     value: date ? date.toISOString().split("T")[0] : "", // Store date in YYYY-MM-DD format for Firebase
//                   },
//                 });
//               }}
//               dateFormat="dd/MM/yyyy"
//               placeholderText="DD/MM/YYYY"
//               className="form-control" // Use Bootstrap styling
//             />
//           </div>
//         </Form.Group>

//         <Form.Group as={Col} md="4" controlId="endDate">
//           <Form.Label>End Date</Form.Label>
//           <div>
//             <DatePicker
//               selected={formData.endDate ? new Date(formData.endDate) : null}
//               onChange={(date) => {
//                 handleInputChange({
//                   target: {
//                     name: "endDate",
//                     value: date ? date.toISOString().split("T")[0] : "", // Store date in YYYY-MM-DD format for Firebase
//                   },
//                 });
//               }}
//               dateFormat="dd/MM/yyyy"
//               className="form-control" // Use Bootstrap styling
//             />
//           </div>
//         </Form.Group>
//       </Row>
//       <Row className="mb-3">
//         <Form.Group as={Col} md="4" controlId="startTime">
//           <Form.Label>Start Time</Form.Label>
//           <Form.Control
//             type="time"
//             name="startTime"
//             value={formData.startTime}
//             onChange={handleInputChange}
//             placeholder="Enter start time"
//           />
//         </Form.Group>
//         <Form.Group as={Col} md="4" controlId="endTime">
//           <Form.Label>End Time</Form.Label>
//           <Form.Control
//             type="time"
//             name="endTime"
//             value={formData.endTime}
//             onChange={handleInputChange}
//             placeholder="Enter end time"
//           />
//         </Form.Group>
//         <Form.Group as={Col} md="3" controlId="estimatedDuration">
//           <Form.Label>Estimated Duration</Form.Label>
//           <InputGroup>
//             <Form.Control
//               type="number"
//               name="estimatedDurationHours"
//               value={formData.estimatedDurationHours || 0}
//               readOnly
//               placeholder="Hours"
//               style={{ backgroundColor: '#f8f9fa', cursor: 'not-allowed' }}
//             />
//             <InputGroup.Text>h</InputGroup.Text>
//             <Form.Control
//               type="number"
//               name="estimatedDurationMinutes"
//               value={formData.estimatedDurationMinutes || 0}
//               readOnly
//               placeholder="Minutes"
//               style={{ backgroundColor: '#f8f9fa', cursor: 'not-allowed' }}
//             />
//             <InputGroup.Text>m</InputGroup.Text>
//           </InputGroup>
//           {formData.startTime && formData.endTime && (
//             <small className="text-muted">
//               Duration auto-calculated from time range
//             </small>
//           )}
//         </Form.Group>
//       </Row>
//       <hr className="my-4" />
//       <p className="text-muted">Notification:</p>
//       <Row className="mt-3">
//         <Form.Group controlId="adminWorkerNotify">
//           <Form.Check
//             type="checkbox"
//             name="adminWorkerNotify"
//             checked={formData.adminWorkerNotify}
//             onChange={handleInputChange}
//             label="Admin/Worker: Email Notify when Job Status changed and new Job message Submitted"
//           />
//         </Form.Group>
//         <Form.Group controlId="customerNotify">
//           <Form.Check
//             type="checkbox"
//             name="customerNotify"
//             checked={formData.customerNotify}
//             onChange={handleInputChange}
//             label="Customer: Email Notify when Job Status changed and new Job message Submitted"
//           />
//         </Form.Group>
//       </Row>
//       <Row className="align-items-center">
//         <Col md={{ span: 4, offset: 8 }} xs={12} className="mt-4">
//           <Button type="submit" variant="primary" className="float-end">
//             Submit
//           </Button>{" "}
//         </Col>{" "}
//       </Row>{" "}
//     </Form>
//   );
// };
// export default JobScheduling;