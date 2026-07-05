// import { useState, useEffect } from 'react';
// import { v4 as uuid } from 'uuid';
// import Flatpickr from 'react-flatpickr';
// import { Button, Form, Offcanvas } from 'react-bootstrap';
// import { getFirestore, collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
// import Select from 'react-select';

// // import widget/custom components
// import { FormSelect } from 'widgets';

// // Fetch users function
// const fetchUsers = async () => {
//   const db = getFirestore();
//   const usersCollection = collection(db, 'users');
//   const usersSnapshot = await getDocs(usersCollection);
//   const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//   return usersList;
// };

// // Function to save or update event in Firestore
// const saveEventToFirestore = async (eventData) => {
//   const db = getFirestore();
//   const eventRef = doc(db, 'events', eventData.id);
//   await setDoc(eventRef, eventData);
// };

// // Function to update event in Firestore
// const updateEventInFirestore = async (eventData) => {
//   const db = getFirestore();
//   const eventRef = doc(db, 'events', eventData.id);
//   await updateDoc(eventRef, eventData);
// };

// // Main Component
// const AddEditSchedule = (props) => {
//   const { show, onHide, isEditEvent, selectedEvent, calendarApi, setShowEventOffcanvas, setEvents } = props;

//   return (
//     <Offcanvas show={show} onHide={onHide} placement="end">
//       <Offcanvas.Header closeButton className='border-bottom'>
//         <Offcanvas.Title>{isEditEvent ? "Edit" : "Add New"} Worker Schedule</Offcanvas.Title>
//       </Offcanvas.Header>
//       <Offcanvas.Body>
//         <ScheduleForm 
//           calendarApi={calendarApi}
//           isEditEvent={isEditEvent}
//           selectedEvent={selectedEvent}
//           setShowEventOffcanvas={setShowEventOffcanvas}
//           setEvents={setEvents} // Ensure this is passed correctly
//         />
//       </Offcanvas.Body>
//     </Offcanvas>
//   );
// };

// // Form Component
// const ScheduleForm = (props) => {
//   const { calendarApi, isEditEvent, selectedEvent, setShowEventOffcanvas, setEvents } = props;

//   // Initialize all required states for event fields with default values
//   const [eventId, setEventId] = useState(selectedEvent ? selectedEvent.id : uuid());
//   const [title, setTitle] = useState(selectedEvent ? selectedEvent.title : '');
//   const [description, setDescription] = useState(selectedEvent && selectedEvent.extendedProps.description ? selectedEvent.extendedProps.description : '');
//   const [location, setLocation] = useState(selectedEvent && selectedEvent.extendedProps.location ? selectedEvent.extendedProps.location : '');
//   const [startDate, setStartDate] = useState(new Date(selectedEvent ? selectedEvent.start : Date.now()));
//   const [startTime, setStartTime] = useState(new Date(selectedEvent ? selectedEvent.start : Date.now()));
//   const [endTime, setEndTime] = useState(new Date(selectedEvent ? selectedEvent.end : Date.now()));
//   const [category, setCategory] = useState('');
//   const [status, setStatus] = useState('');
//   const [workerId, setWorkerId] = useState(selectedEvent && selectedEvent.extendedProps.workerId ? selectedEvent.extendedProps.workerId : '');
//   const [workers, setWorkers] = useState([]);

//   useEffect(() => {
//     const loadUsers = async () => {
//       const usersList = await fetchUsers();
//       setWorkers(usersList);
//     };
//     loadUsers();
//   }, []);

//   useEffect(() => {
//     // Set category based on status
//     switch (status) {
//       case 'Available':
//         setCategory('success');
//         break;
//       case 'On Leave':
//         setCategory('danger');
//         break;
//       case 'Medical Leave':
//         setCategory('secondary');
//         break;
//       case 'Public Holiday':
//         setCategory('warning');
//         break;
//       default:
//         setCategory('');
//     }
//   }, [status]);

//   const handleFormSubmit = async (e) => {
//     e.preventDefault();

//     const updatedEventData = {
//       id: eventId,
//       title: title,
//       start: new Date(startDate.setHours(startTime.getHours(), startTime.getMinutes())), // Combine date and time
//       end: new Date(startDate.setHours(endTime.getHours(), endTime.getMinutes())), // Combine date and time
//       allDay: false,
//       extendedProps: {
//         category: category,
//         location: location || '', // Ensure this is not undefined
//         description: description || '', // Ensure this is not undefined
//         workerId: workerId || '', // Ensure this is not undefined
//         status: status // Add status to extendedProps
//       }
//     };

//     try {
//       if (isEditEvent) {
//         const existingEvent = calendarApi.getEventById(eventId);
//         if (existingEvent) {
//           existingEvent.setProp('title', updatedEventData.title);
//           existingEvent.setProp('extendedProps', updatedEventData.extendedProps);
//           existingEvent.setDates(updatedEventData.start, updatedEventData.end, { allDay: updatedEventData.allDay });
//           await updateEventInFirestore(updatedEventData);
//         }
//       } else {
//         calendarApi.addEvent(updatedEventData);
//         await saveEventToFirestore(updatedEventData);
//       }
//       setShowEventOffcanvas(false);
//     } catch (error) {
//       console.error('Error saving event to Firestore:', error);
//     }
//   };

//   const workerOptions = workers.map(worker => ({
//     value: worker.id,
//     label: `${worker.firstName} ${worker.lastName}`
//   }));

//   const statusOptions = [
//     { value: 'Available', label: 'Available' },
//     { value: 'On Leave', label: 'On Leave' },
//     { value: 'Medical Leave', label: 'Medical Leave' },
//     { value: 'Public Holiday', label: 'Public Holiday' }
//   ];

//   const handleDeleteEvent = () => {
//     setShowEventOffcanvas(false);
//     calendarApi.getEventById(eventId).remove();
//   };

//   return (
//     <Form onSubmit={handleFormSubmit}>

//       <Form.Group className="mb-2" controlId="eventTitle">
//         <Form.Label>Schedule Title</Form.Label>
//         <Form.Control 
//           type="text"
//           placeholder="Event Title"
//           onChange={e => setTitle(e.target.value)}
//           value={title}
//           required 
//         />
//       </Form.Group>

//       <Form.Group className="mb-2" controlId="statusSelect">
//         <Form.Label>Status</Form.Label>
//         <Select
//           options={statusOptions}
//           value={statusOptions.find(option => option.value === status) || ''}
//           onChange={option => setStatus(option.value)}
//           isClearable
//           placeholder="Select Status"
//           required
//         />
//       </Form.Group>

//       <Form.Group className="mb-2 event-date" controlId="eventStartDate">
//         <Form.Label>Schedule Start Date</Form.Label>
//         <Flatpickr
//           value={startDate}
//           placeholder='Select Start Date'
//           className="form-control"
//           options={{
//             dateFormat: "Y-m-d",
//             monthSelectorType: 'dropdown',
//             yearSelectorType: 'static',
//             static: true,
//             wrap: false
//           }}
//           onChange={date => {
//             setStartDate(date[0]);
//           }}
//         />
//       </Form.Group>

//       <Form.Group className="mb-2 event-date" controlId="eventStartTime">
//         <Form.Label>Time From</Form.Label>
//         <Flatpickr
//           value={startTime}
//           placeholder='Select Start Time'
//           className="form-control"
//           options={{
//             enableTime: true,
//             noCalendar: true,
//             dateFormat: "h:i K", // 12-hour format with AM/PM
//             time_24hr: false,
//             static: true
//           }}
//           onChange={time => {
//             setStartTime(time[0]);
//           }}
//         />
//       </Form.Group>

//       <Form.Group className="mb-2 event-date" controlId="eventEndTime">
//         <Form.Label>Time To</Form.Label>
//         <Flatpickr
//           value={endTime}
//           placeholder='Select End Time'
//           className="form-control"
//           options={{
//             enableTime: true,
//             noCalendar: true,
//             dateFormat: "h:i K", // 12-hour format with AM/PM
//             time_24hr: false,
//             static: true,
//             minDate: startTime
//           }}
//           onChange={time => {
//             setEndTime(time[0]);
//           }}
//         />
//       </Form.Group>

//       <Form.Group className="mb-2" controlId="workerSelect">
//         <Form.Label>Select Worker</Form.Label>
//         <Select
//           options={workerOptions}
//           value={workerOptions.find(option => option.value === workerId) || ''}
//           onChange={option => setWorkerId(option.value)}
//           isClearable
//           placeholder="Select Worker"
//           required
//         />
//       </Form.Group>

//       <Form.Group className="mb-2" controlId="eventDescription">
//         <Form.Label>Schedule Description</Form.Label>
//         <Form.Control 
//           as="textarea"
//           placeholder="Schedule Description"
//           required
//           rows={3}
//           value={description}
//           onChange={e => setDescription(e.target.value)}
//         />
//       </Form.Group>

//       <div className="mt-3">
//         <Button type="submit" variant="primary" id="add-new-event-btn">{isEditEvent ? "Update" : "Add"} Schedule</Button>
//         {isEditEvent && <Button className="ms-2" variant="danger" onClick={handleDeleteEvent}>Delete</Button>}
//         <Form.Control type="hidden" id="eventid" name="eventid" value={eventId} onChange={e => setEventId(e.target.value)} />
//       </div>

//     </Form>
//   );
// };

// export default AddEditSchedule;









// // // import node module libraries
// // import { useState } from 'react';
// // import { v4 as uuid } from 'uuid';
// // import Flatpickr from 'react-flatpickr';
// // import { Button, Form, Offcanvas } from 'react-bootstrap';

// // import { getFirestore, collection, getDocs } from 'firebase/firestore';
// // // import widget/custom components
// // import { FormSelect } from 'widgets';


// // const AddEditSchedule = props => {
// //   const { show, onHide, isEditEvent, selectedEvent, calendarApi, setShowEventOffcanvas } = props;
// //   return (
// //     <Offcanvas show={show} onHide={onHide} placement="end" {...props}>
// //       <Offcanvas.Header closeButton className='border-bottom'>
// //         <Offcanvas.Title>{isEditEvent ? "Edit" : "Add New"} Worker Schedule</Offcanvas.Title>
// //       </Offcanvas.Header>
// //       <Offcanvas.Body>
// //         <ScheduleForm calendarApi={calendarApi}
// //           isEditEvent={isEditEvent} selectedEvent={selectedEvent}
// //           setShowEventOffcanvas={setShowEventOffcanvas}
// //         />
// //       </Offcanvas.Body>
// //     </Offcanvas>
// //   )
// // }

// // const ScheduleForm = props => {
// //   const { calendarApi, isEditEvent, selectedEvent, setShowEventOffcanvas } = props;

// //   // Initialize all required states for event fields
// //   const [eventId, setEventId] = useState(selectedEvent && selectedEvent.id)
// //   const [title, setTitle] = useState(selectedEvent && selectedEvent.title)
// //   const [description, setDescription] = useState(selectedEvent && selectedEvent.extendedProps.description)
// //   const [location, setLocation] = useState(selectedEvent && selectedEvent.extendedProps.location)
// //   const [startDate, setStartDate] = useState(new Date(selectedEvent && selectedEvent.start))
// //   const [endDate, setEndDate] = useState(new Date(selectedEvent && selectedEvent.end))
// //   const [category, setCategory] = useState(selectedEvent && selectedEvent.extendedProps.category)

// //   // Function to manage event form submission.
// //   const handleFormSubmit = (e) => {
// //     e.preventDefault();
// //     if (isEditEvent) {
// //       // Execute below code on event editing
// //       const updatedEventData = {
// //         id: selectedEvent.id,
// //         title: title,
// //         start: startDate,
// //         end: endDate,
// //         allDay: true,
// //         extendedProps: {
// //           category: category,
// //           location: location,
// //           description: description
// //         }
// //       }
// //       const propsToUpdate = ['id', 'title']
// //       const extendedPropsToUpdate = ['category', 'location', 'description']
// //       const existingEvent = calendarApi.getEventById(eventId)

// //       // Set event properties except date related
// //       for (let index = 0; index < propsToUpdate.length; index++) {
// //         const propName = propsToUpdate[index]
// //         existingEvent.setProp(propName, updatedEventData[propName])
// //       }

// //       // Set date related props
// //       existingEvent.setDates(
// //         new Date(updatedEventData.start),
// //         new Date(updatedEventData.end),
// //         { allDay: updatedEventData.allDay })

// //       // Set event's extendedProps
// //       for (let index = 0; index < extendedPropsToUpdate.length; index++) {
// //         const propName = extendedPropsToUpdate[index]
// //         existingEvent.setExtendedProp(propName, updatedEventData.extendedProps[propName])
// //       }
// //     } else {
// //       // Execute below code on new event entry
// //       calendarApi.addEvent({
// //         id: uuid(),
// //         title: title,
// //         start: startDate,
// //         end: endDate,
// //         allDay: true,
// //         extendedProps: {
// //           category: category,
// //           location: location,
// //           description: description
// //         }
// //       });
// //     }
// //     setShowEventOffcanvas(false);
// //   }

// //   // Background color options
// //   const backgroundOptions = [
// //     { value: 'primary', label: 'Primary' },
// //     { value: 'danger', label: 'Danger' },
// //     { value: 'success', label: 'Success' },
// //     { value: 'info', label: 'Info' },
// //     { value: 'dark', label: 'Dark' },
// //     { value: 'warning', label: 'Warning' },
// //   ];

// //   // Delete event method
// //   const handleDeleteEvent = () => {
// //     setShowEventOffcanvas(false);
// //     calendarApi.getEventById(eventId).remove();
// //   }

// //   return (
// //     <Form onSubmit={handleFormSubmit} >

// //       {/* Schedule Title */}
// //       <Form.Group className="mb-2" controlId="eventTitle">
// //         <Form.Label> Schedule Title</Form.Label>
// //         <Form.Control type="text" placeholder="Event Title"
// //           onChange={e => setTitle(e.target.value)}
// //           value={title || ""}
// //           required />
// //       </Form.Group>

// //       {/* Event Background */}
// //       <Form.Group className="mb-2" controlId="eventBackground">
// //         <Form.Label>Select Background</Form.Label>
// //         <Form.Control
// //           as={FormSelect}
// //           placeholder="Select Background"
// //           options={backgroundOptions}
// //           value={category || ''}
// //           defaultselected={category}
// //           onChange={e => setCategory(e.target.value)}
// //           required
// //         />
// //       </Form.Group>

// //       {/* Event Start Date */}
// //       <Form.Group className="mb-2 event-date" controlId="eventStartDate">
// //         <Form.Label>Schedule Start Date</Form.Label>
// //         <Flatpickr
// //             value={startDate}
// //             placeholder='Select Start Date'
// //             className="form-control"
// //             options={{
// //               dateFormat: "Y-m-d",
// //               monthSelectorType: 'dropdown',
// //               yearSelectorType: 'static',
// //               static: true,
// //               wrap:false
// //             }}
// //             onChange={date => {
// //               setStartDate(date[0]);
// //             }}
// //           />        
// //       </Form.Group>

// //       {/* Event End Date */}
// //       <Form.Group className="mb-2 event-date" controlId="eventEndDate">
// //         <Form.Label>Schedule End Date</Form.Label>
// //         <Flatpickr
// //             value={endDate}
// //             placeholder='Select End Date'
// //             className="form-control "
// //             options={{
// //               dateFormat: "Y-m-d",
// //               monthSelectorType: 'dropdown',
// //               yearSelectorType: 'static',
// //               static: true,
// //               minDate: new Date(startDate).fp_incr(1)
// //             }}
// //             onChange={(date) => {
// //               setEndDate(date[0]);
// //             }}
// //           />
// //       </Form.Group>

// //       {/* Event Location */}
// //       {/* <Form.Group className="mb-2" controlId="eventLocation">
// //         <Form.Label> Schedule Location</Form.Label>
// //         <Form.Control type="text"
// //           placeholder="Event Location"
// //           required
// //           value={location || ''}
// //           onChange={e => setLocation(e.target.value)}
// //         />
// //       </Form.Group> */}

// //       {/* Event Description */}
// //       <Form.Group className="mb-2" controlId="eventDescription">
// //         <Form.Label> Schedule Description</Form.Label>
// //         <Form.Control as="textarea"
// //           placeholder="Schedule Description"
// //           required
// //           rows={3}
// //           value={description || ''}
// //           onChange={e => setDescription(e.target.value)}
// //         />
// //       </Form.Group>

// //       <div className="mt-3">
// //         <Button type="submit" variant="primary" id="add-new-event-btn">{isEditEvent ? "Update" : "Add"} Event</Button>
// //         {isEditEvent ? <Button className="ms-2" variant="danger" onClick={handleDeleteEvent}>Delete</Button> : ""}
// //         <Form.Control type="hidden" id="eventid" name="eventid" value={eventId} onChange={e => setEventId(e.target.value)} />
// //       </div>

// //     </Form>
// //   )
// // }

// // export default AddEditSchedule