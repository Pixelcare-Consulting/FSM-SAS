// import React, { useEffect, useState } from "react";
// import {
//   ScheduleComponent,
//   Day,
//   Week,
//   Month,
//   Agenda,
//   Inject,
// } from "@syncfusion/ej2-react-schedule";
// import { collection, getDocs } from "firebase/firestore"; // Firebase Firestore functions
// import { db } from "../firebase";

// const SchedulerComponent = () => {
//   const [events, setEvents] = useState([]);

//   // Fetch job data from Firebase (jobs collection)
//   useEffect(() => {
//     const fetchJobs = async () => {
//       try {
//         const jobsSnapshot = await getDocs(collection(db, "jobs"));
//         const jobsData = jobsSnapshot.docs.map((doc) => {
//           const job = doc.data();
//           return {
//             Id: doc.id,
//             Subject: job.jobName,
//             StartTime: new Date(job.start),
//             EndTime: new Date(`${job.endDate}T${job.endTime}`),
//             Description: job.description,
//           };
//         });
//         setEvents(jobsData);
//       } catch (error) {
//         console.error("Error fetching jobs from Firebase:", error);
//       }
//     };

//     fetchJobs();
//   }, []);

//   const eventSettings = {
//     dataSource: events, // Use the fetched events data from Firebase
//   };

//   return (
//     <ScheduleComponent
//       height="650px"
//       eventSettings={eventSettings}
//       selectedDate={new Date()} // Default to the current date
//       currentView="Month" // Default view set to Month
//       views={["Day", "Week", "Month", "Agenda"]} // Calendar views
//     >
//       <Inject services={[Day, Week, Month, Agenda]} />
//     </ScheduleComponent>
//   );
// };

// export default SchedulerComponent;

// // import * as React from 'react';
// // import { useEffect, useRef, useState } from 'react';
// // import { ScheduleComponent, ResourcesDirective, ResourceDirective, ViewsDirective, ViewDirective, Inject, Day, Week, Month, Resize, DragAndDrop } from '@syncfusion/ej2-react-schedule';
// // import { registerLicense } from '@syncfusion/ej2-base';
// // import { collection, getDocs, onSnapshot } from 'firebase/firestore';
// // import { db } from '../firebase'; // Your Firebase config

// // // Register Syncfusion license
// // registerLicense(process.env.REACT_APP_SYNCFUSION_LICENSE_KEY);

// // const SchedulerComponent = () => {
// //     let scheduleObj = useRef(null);

// //     const [jobData, setJobData] = useState([]);  // To hold the job events

// //     // Fetch job data from Firebase (jobs collection)
// //     useEffect(() => {
// //         const fetchJobs = async () => {
// //             try {
// //                 const jobsSnapshot = await getDocs(collection(db, 'jobs'));
// //                 const jobsData = jobsSnapshot.docs.map(doc => {
// //                     const job = doc.data();
// //                     return {
// //                         Id: doc.id, // use Firebase ID as Id
// //                         Subject: job.jobName, // Job Name as the title
// //                         StartTime: new Date(job.start), // Convert start string to Date
// //                         EndTime: new Date(job.endDate + 'T' + job.endTime), // Combine endDate and endTime
// //                         Description: job.description, // Job description
// //                         Location: job.locationName, // Location for more info
// //                     };
// //                 });
// //                 setJobData(jobsData);
// //             } catch (error) {
// //                 console.error("Error fetching jobs:", error);
// //             }
// //         };

// //         fetchJobs();
// //     }, []);

// //     return (
// //         <div className='schedule-control-section'>
// //             <div className='col-lg-12 control-section'>
// //                 <div className='control-wrapper drag-sample-wrapper'>
// //                     <div className="schedule-container">
// //                         <ScheduleComponent
// //                             ref={scheduleObj}
// //                             cssClass='schedule-drag-drop'
// //                             width='100%'
// //                             height='650px'
// //                             selectedDate={new Date()} // Default to today's date
// //                             currentView='Month'  // Use 'Month', 'Week', or 'Day' for standard calendar views
// //                             showQuickInfo={false}
// //                             eventSettings={{
// //                                 dataSource: jobData,  // Use the jobData state for events
// //                                 fields: {
// //                                     subject: { title: 'Job Name', name: 'Subject' },
// //                                     startTime: { title: "Start Time", name: "StartTime" },
// //                                     endTime: { title: "End Time", name: "EndTime" },
// //                                     description: { title: 'Job Description', name: 'Description' }
// //                                 }
// //                             }}
// //                             group={{ enableCompactView: false, resources: ['Jobs'] }}>

// //                             <ResourcesDirective>
// //                                 <ResourceDirective
// //                                     field='JobId'
// //                                     title='Job'
// //                                     name='Jobs'
// //                                     allowMultiple={false}
// //                                     dataSource={jobData}
// //                                     textField='Subject'
// //                                     idField='Id'
// //                                     colorField='Color' />
// //                             </ResourcesDirective>

// //                             <ViewsDirective>
// //                                 <ViewDirective option='Day'/>
// //                                 <ViewDirective option='Week'/>
// //                                 <ViewDirective option='Month'/>
// //                             </ViewsDirective>

// //                             <Inject services={[Day, Week, Month, Resize, DragAndDrop]}/>
// //                         </ScheduleComponent>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };

// // export default SchedulerComponent;

// // 'use client'

// // import React from 'react';
// // import { ScheduleComponent, Day, Week, Month, Agenda, Inject } from '@syncfusion/ej2-react-schedule';
// // import { registerLicense } from '@syncfusion/ej2-base';

// // // Register Syncfusion license
// // registerLicense(process.env.REACT_APP_SYNCFUSION_LICENSE_KEY);

// // const SchedulerComponent = () => {
// //     const eventSettings = {
// //         dataSource: [
// //           {
// //             Id: 1,
// //             Subject: 'Team Meeting',
// //             StartTime: new Date(2024, 9, 6, 10, 0),
// //             EndTime: new Date(2024, 9, 6, 12, 0),
// //             CategoryColor: '#1aaa55', // green
// //           },
// //           {
// //             Id: 2,
// //             Subject: 'Conference',
// //             StartTime: new Date(2024, 9, 7, 9, 0),
// //             EndTime: new Date(2024, 9, 7, 10, 30),
// //             CategoryColor: '#f57b00', // orange
// //           },
// //         ],
// //     };

// //   return (
// //     <ScheduleComponent
// //       height="650px"
// //       eventSettings={eventSettings}
// //       selectedDate={new Date(2024, 9, 6)}
// //       currentView="Month"  // Default view set to Month
// //       views={['Day', 'Week', 'Month', 'Agenda']}  // Excluded Work Week view
// //     >
// //       <Inject services={[Day, Week, Month, Agenda]} />
// //     </ScheduleComponent>
// //   );
// // };

// // export default SchedulerComponent;
