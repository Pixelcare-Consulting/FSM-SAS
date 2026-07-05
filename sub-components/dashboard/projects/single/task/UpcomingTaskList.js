// // import node module libraries
// import React, { useEffect, useState } from "react";
// import { Card, Dropdown, Image, Tooltip, OverlayTrigger } from "react-bootstrap";
// import Link from "next/link";
// import { FaUser } from "react-icons/fa"; // For Worker Icon

// // import Firebase
// import { db } from "../../../../../firebase"; // Adjust as per your path
// import { collection, getDocs } from "firebase/firestore";

// // import required components
// import { TableStriped } from 'widgets';

// // Helper functions for rendering badges
// const getStatusBadge = (status) => {
//   switch (status) {
//     case "C":
//       return <span className="badge bg-info text-light">Created</span>;
//     case "CO":
//       return <span className="badge bg-primary text-light">Confirmed</span>;
//     case "CA":
//       return <span className="badge bg-danger text-light">Cancelled</span>;
//     case "JS":
//       return <span className="badge bg-warning text-light">Job Started</span>;
//     case "JC":
//       return <span className="badge bg-success text-light">Job Completed</span>;
//     default:
//       return <span className="badge bg-secondary text-light">Unknown</span>;
//   }
// };

// const getPriorityBadge = (priority) => {
//   switch (priority) {
//     case 'L':
//       return <Badge bg="success">Low</Badge>;
//     case 'M':
//       return <Badge bg="warning">Normal</Badge>;
//     case 'H':
//       return <Badge bg="danger">High</Badge>;
//     default:
//       return priority;
//   }
// };

// // Updated function to render worker avatars with a tooltip showing the worker's full name
// const renderWorkerAvatars = (workers = []) => {
// 	const displayedWorkers = workers.slice(0, 3); // Display up to 3 workers
// 	const extraCount = workers.length > 3 ? workers.length - 3 : 0; // Show +n only if there are more than 3 workers
  
// 	return (
// 	  <div className="d-flex align-items-center">
// 		{displayedWorkers.map((worker, idx) => (
// 		  <OverlayTrigger
// 			key={idx}
// 			placement="top"
// 			overlay={<Tooltip>{worker.fullName || "Unknown Worker"}</Tooltip>} // Tooltip with worker's full name
// 		  >
// 			<Image
// 			  src={worker.profilePicture || "/default-avatar.jpg"}
// 			  alt={worker.fullName || "Worker"}
// 			  className="avatar avatar-xs rounded-circle me-1" // Updated margin for better spacing
// 			  style={{ zIndex: 3 - idx }} // Stack avatars properly
// 			/>
// 		  </OverlayTrigger>
// 		))}
// 		{extraCount > 0 && (
// 		  <div
// 			className="avatar avatar-xs rounded-circle bg-light text-dark text-center d-flex justify-content-center align-items-center"
// 			style={{ marginLeft: -10 }} 
// 		  >
// 			{`+${extraCount}`}
// 		  </div>
// 		)}
// 	  </div>
// 	);
//   };
  

// const UpcomingTaskList = () => {
//   const [jobs, setJobs] = useState([]); // State to store jobs

//   // Fetch jobs and workers from Firebase Firestore
//   useEffect(() => {
//     const fetchJobsAndWorkers = async () => {
//       const jobsSnapshot = await getDocs(collection(db, "jobs"));
//       const usersSnapshot = await getDocs(collection(db, "users"));
  
//       const jobsData = jobsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
//       const usersData = usersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  
//       const mergedJobsData = jobsData.map((job) => {
//         const workerNamesAndImages = job.assignedWorkers.map((workerId) => {
//           const worker = usersData.find((user) => user.workerId === workerId);
//           return worker
//             ? { fullName: `${worker.firstName} ${worker.lastName}`, profilePicture: worker.profilePicture }
//             : { fullName: "Unknown Worker", profilePicture: null };
//         });
  
//         return {
//           id: job.jobNo || "No Job No.",
//           project_name: job.jobName || "No Job Name",
//           due_date: job.endDate || "No End Date",
//           priority: job.jobPriority === "L" ? "Low" : job.jobPriority === "M" ? "Medium" : "High",
//           badge: job.jobPriority === "L" ? "success" : job.jobPriority === "M" ? "warning" : "danger",
//           members: workerNamesAndImages.map((worker) => ({
//             avatar: worker.profilePicture || "/default-avatar.jpg"
//           }))
//         };
//       });
  
//       setJobs(mergedJobsData); // Set the transformed data to the jobs state
//     };
  
//     fetchJobsAndWorkers();
//   }, []);

//   return (
//     <Card>
//       <TableStriped TableData={jobs} />
//     </Card>
//   );
// };

// export default UpcomingTaskList;


// // // import node module libraries
// // import React, { useEffect, useState } from "react";
// // import { Card } from "react-bootstrap";

// // // import Firebase
// // import { db } from "../../../../../firebase"; // Adjust as per your path
// // import { collection, getDocs } from "firebase/firestore";

// // // import required components
// // import { TableStriped } from 'widgets';

// // const UpcomingTaskList = () => {
// //   const [jobs, setJobs] = useState([]); // State to store jobs

// //   // Fetch jobs and workers from Firebase Firestore
// //   useEffect(() => {
// //     const fetchJobsAndWorkers = async () => {
// //       const jobsSnapshot = await getDocs(collection(db, "jobs"));
// //       const usersSnapshot = await getDocs(collection(db, "users"));
  
// //       const jobsData = jobsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
// //       const usersData = usersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  
// //       const mergedJobsData = jobsData.map((job) => {
// //         const workerNamesAndImages = job.assignedWorkers.map((workerId) => {
// //           const worker = usersData.find((user) => user.workerId === workerId);
// //           return worker
// //             ? { fullName: `${worker.firstName} ${worker.lastName}`, profilePicture: worker.profilePicture }
// //             : { fullName: "Unknown Worker", profilePicture: null };
// //         });

// //         // Transform the job data into the structure expected by the TableStriped component
// //         return {
// //           id: job.jobNo || "No Job No.",
// //           project_name: job.jobName || "No Job Name",
// //           due_date: job.endDate || "No End Date",
// //           priority: job.jobPriority === "L" ? "Low" : job.jobPriority === "M" ? "Medium" : "High",
// //           badge: job.jobPriority === "L" ? "success" : job.jobPriority === "M" ? "warning" : "danger",
// //           members: workerNamesAndImages.map((worker) => ({
// //             avatar: worker.profilePicture || "/default-avatar.jpg" // Fallback to default if no profilePicture
// //           }))
// //         };
// //       });

// //       setJobs(mergedJobsData); // Set the transformed data to the jobs state
// //     };
  
// //     fetchJobsAndWorkers();
// //   }, []);

// //   return (
// //     <Card>
// //       {/* Use the transformed jobs data instead of BasicTableData */}
// //       <TableStriped TableData={jobs} />
// //     </Card>
// //   );
// // };

// // export default UpcomingTaskList;




// // // // import node module libraries
// // // import React, { useEffect, useState } from "react";
// // // import Link from "next/link";
// // // import { Card, Dropdown, Table } from "react-bootstrap";
// // // import { FaUser } from "react-icons/fa"; // For Worker Icon

// // // // import Firebase
// // // import { db } from "../../../../../firebase";
// // // import { collection, getDocs } from "firebase/firestore";

// // // // Helper functions for rendering badges
// // // const getStatusBadge = (status) => {
// // //   switch (status) {
// // //     case "C":
// // //       return <span className="badge bg-info text-light">Created</span>;
// // //     case "CO":
// // //       return <span className="badge bg-primary text-light">Confirmed</span>;
// // //     case "CA":
// // //       return <span className="badge bg-danger text-light">Cancelled</span>;
// // //     case "JS":
// // //       return <span className="badge bg-warning text-light">Job Started</span>;
// // //     case "JC":
// // //       return <span className="badge bg-success text-light">Job Completed</span>;
// // //     default:
// // //       return <span className="badge bg-secondary text-light">Unknown</span>;
// // //   }
// // // };

// // // const getPriorityBadge = (priority) => {
// // //   switch (priority) {
// // //     case "L":
// // //       return <span className="badge bg-success text-light">Low</span>;
// // //     case "M":
// // //       return <span className="badge bg-warning text-light">Medium</span>;
// // //     case "H":
// // //       return <span className="badge bg-danger text-light">High</span>;
// // //     default:
// // //       return <span className="badge bg-secondary text-light">Unknown</span>;
// // //   }
// // // };

// // // // Helper to format time
// // // const formatTime = (time) => {
// // //   if (!time) return "No Time"; // Handle missing or undefined time
// // //   const [hours, minutes] = time.split(":");
// // //   const hour = parseInt(hours, 10);
// // //   const ampm = hour >= 12 ? "PM" : "AM";
// // //   const formattedHour = hour % 12 || 12; // Convert '0' hour to '12'
// // //   return `${formattedHour}:${minutes} ${ampm}`;
// // // };

// // // const UpcomingTaskList = () => {
// // //   const [jobs, setJobs] = useState([]); // State to store jobs

// // //   // Fetch data from Firebase Firestore
// // //   useEffect(() => {
// // //     const fetchJobs = async () => {
// // //       const jobsCollection = collection(db, "jobs");
// // //       const jobsSnapshot = await getDocs(jobsCollection);
// // //       const jobsList = jobsSnapshot.docs.map((doc) => ({
// // //         id: doc.id,
// // //         ...doc.data(),
// // //       }));
// // //       setJobs(jobsList); // Store fetched data in state
// // //     };

// // //     fetchJobs();
// // //   }, []);

// // //   const CustomToggle = React.forwardRef(({ children, onClick }, ref) => (
// // //     <Link
// // //       href="#"
// // //       ref={ref}
// // //       onClick={(e) => {
// // //         e.preventDefault();
// // //         onClick(e);
// // //       }}
// // //       className="btn-icon btn btn-ghost btn-sm rounded-circle"
// // //     >
// // //       {children}
// // //     </Link>
// // //   ));

// // //   CustomToggle.displayName = "CustomToggle";

// // //   const ActionMenu = () => {
// // //     return (
// // //       <Dropdown>
// // //         <Dropdown.Toggle as={CustomToggle}>
// // //           <i className="fe fe-more-vertical text-muted"></i>
// // //         </Dropdown.Toggle>
// // //         <Dropdown.Menu align="end">
// // //           <Dropdown.Header>Settings</Dropdown.Header>
// // //           <Dropdown.Item eventKey="1">Action</Dropdown.Item>
// // //           <Dropdown.Item eventKey="2">Another action</Dropdown.Item>
// // //           <Dropdown.Item eventKey="3">Something else here</Dropdown.Item>
// // //         </Dropdown.Menu>
// // //       </Dropdown>
// // //     );
// // //   };

// // //   return (
// // //     <Card className="h-100">
// // //       <Card.Header className="card-header d-flex justify-content-between align-items-center">
// // //         <h4 className="mb-0">Current Jobs</h4>
// // //         <div>
// // //           <Link href="/dashboard/jobs/list-jobs" className="ms-auto">
// // //             View All
// // //           </Link>
// // //         </div>
// // //       </Card.Header>
// // //       <Table hover responsive className="text-nowrap mb-0 table-centered">
// // //         <thead className="table-light">
// // //           <tr>
// // //             <th>Job No.</th>
// // //             <th>Job Name</th>
// // // 			<th>Assigned Worker</th>
// // //             <th>Job Status</th>
// // //             <th>Priority</th>
// // //             <th>Action</th>
// // //           </tr>
// // //         </thead>
// // //         <tbody>
// // //           {jobs.length > 0 ? (
// // //             jobs.map((job) => (
// // //               <tr key={job.id}>
// // //                 <td className="align-middle">{job.jobNo || "No Job No."}</td>
// // // 				<td className="align-middle">{job.jobName || "No Job Name"}</td>
// // //                 <td className="align-middle">
// // //                   <FaUser style={{ marginRight: "8px" }} />
// // //                   {job.workerFullName || "No Worker"}
// // //                 </td>
              
// // //                 <td className="align-middle">
// // //                   {getStatusBadge(job.jobStatus)}
// // //                 </td>
// // //                 <td className="align-middle">
// // //                   {getPriorityBadge(job.jobPriority)}
// // //                 </td>
                
// // //                 <td className="align-middle">
// // //                   <ActionMenu />
// // //                 </td>
// // //               </tr>
// // //             ))
// // //           ) : (
// // //             <tr>
// // //               <td colSpan="11" className="text-center">
// // //                 No jobs available
// // //               </td>
// // //             </tr>
// // //           )}
// // //         </tbody>
// // //       </Table>
// // //     </Card>
// // //   );
// // // };

// // // export default UpcomingTaskList;

// // // // // import node module libraries
// // // // import React from 'react';
// // // // import Link from 'next/link';
// // // // import { Card, Dropdown, Table, Image } from 'react-bootstrap';

// // // // // import widget/custom components
// // // // import { ProgressChart } from 'widgets';

// // // // // import data files
// // // // import UpcomingTaskListData from 'data/dashboard/projects/UpcomingTaskListData';

// // // // const UpcomingTaskList = () => {
// // // // 	const CustomToggle = React.forwardRef(({ children, onClick }, ref) => (
// // // // 		(<Link
// // // // 			href=""
// // // // 			ref={ref}
// // // // 			onClick={(e) => {
// // // // 				e.preventDefault();
// // // // 				onClick(e);
// // // // 			}}
// // // // 			className="btn-icon btn btn-ghost btn-sm rounded-circle">
// // // // 			{children}
// // // // 		</Link>)
// // // // 	));

// // // // 	CustomToggle.displayName = 'CustomToggle';

// // // // 	const ActionMenu = () => {
// // // // 		return (
// // // // 			<Dropdown>
// // // // 				<Dropdown.Toggle as={CustomToggle}>
// // // // 					<i className="fe fe-more-vertical text-muted"></i>
// // // // 				</Dropdown.Toggle>
// // // // 				<Dropdown.Menu align="end">
// // // // 					<Dropdown.Header>Settings</Dropdown.Header>
// // // // 					<Dropdown.Item eventKey="1">Action</Dropdown.Item>
// // // // 					<Dropdown.Item eventKey="2">Another action</Dropdown.Item>
// // // // 					<Dropdown.Item eventKey="3">Something else here</Dropdown.Item>
// // // // 				</Dropdown.Menu>
// // // // 			</Dropdown>
// // // // 		);
// // // // 	};

// // // // 	return (
// // // // 		<Card className="h-100">
// // // // 				<Card.Header className="card-header d-flex justify-content-between align-items-center">
// // // // 				<h4 className="mb-0">Current Jobs</h4>
// // // // 				<div>
// // // // 				<Link href="/dashboard/jobs/list-jobs" className="ms-auto">
// // // // 				View All
// // // // 				</Link>
// // // // 				</div>
// // // // 			</Card.Header>
// // // // 			<Table hover responsive className="text-nowrap mb-0 table-centered">
// // // // 				<thead className="table-light">
// // // // 					<tr>
// // // // 						<th>Jobs</th>
// // // // 						<th>End Date</th>
// // // // 						<th>Status</th>
// // // // 						<th>Progress</th>
// // // // 						<th>Assignee</th>
// // // // 						<th>Action</th>
// // // // 					</tr>
// // // // 				</thead>
// // // // 				<tbody>
// // // // 					{UpcomingTaskListData.map((item, index) => {
// // // // 						return (
// // // // 							<tr key={index}>
// // // // 								<td className="align-middle">{item.task}</td>
// // // // 								<td className="align-middle">{item.enddate}</td>
// // // // 								<td className="align-middle">
// // // // 									<span className={`badge bg-light-${item.statuscolor} text-${item.statuscolor}`}>
// // // // 										{item.status}
// // // // 									</span>
// // // // 								</td>
// // // // 								<td className="align-middle">
// // // // 									<ProgressChart value={item.progress} />
// // // // 								</td>
// // // // 								<td className="align-middle">
// // // // 									<Image
// // // // 										src={item.assignee}
// // // // 										alt=""
// // // // 										className="avatar avatar-xs rounded-circle"
// // // // 									/>
// // // // 								</td>
// // // // 								<td className="align-middle">
// // // // 									<ActionMenu />
// // // // 								</td>
// // // // 							</tr>
// // // // 						);
// // // // 					})}
// // // // 				</tbody>
// // // // 			</Table>
// // // // 		</Card>
// // // // 	);
// // // // };
// // // // export default UpcomingTaskList;
