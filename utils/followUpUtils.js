// import { db } from "../firebase";
// import { 
//   collection, 
//   addDoc, 
//   updateDoc, 
//   doc, 
//   serverTimestamp,
//   increment,
//   getDoc
// } from "firebase/firestore";
// import { toast } from "react-toastify";

// export const createFollowUp = async ({
//   type,
//   jobId,
//   jobName,
//   customerId,
//   customerName,
//   technicianId,
//   technicianName,
//   notes,
//   priority = "Normal",
//   dueDate = null
// }) => {
//   try {
//     // Start a new follow-up document
//     const followUpData = {
//       type, // 'Appointment', 'Repair', 'Contract', 'Verify Customer'
//       jobId,
//       jobName,
//       customerId,
//       customerName,
//       technicianId,
//       technicianName,
//       notes,
//       priority,
//       dueDate,
//       status: "Logged", // Initial status
//       createdAt: serverTimestamp(),
//       updatedAt: serverTimestamp(),
//       assignedCSOId: null,
//       assignedCSOName: null,
//       history: [{
//         action: "Created",
//         timestamp: new Date().toISOString(),
//         userId: technicianId,
//         userName: technicianName,
//         notes: `Follow-up ${type} created`
//       }]
//     };

//     // Add the follow-up document
//     const followUpRef = await addDoc(collection(db, "followUps"), followUpData);

//     // Update the job's substatus and followUp count
//     const jobRef = doc(db, "jobs", jobId);
//     await updateDoc(jobRef, {
//       [`subStatus.${type.toLowerCase()}`]: true,
//       followUpCount: increment(1),
//       lastFollowUp: serverTimestamp(),
//       // Add the follow-up reference to the job
//       followUps: {
//         [followUpRef.id]: {
//           type,
//           status: "Logged",
//           createdAt: new Date().toISOString()
//         }
//       }
//     });

//     // Show success notification
//     toast.success(
//       <div>
//         <div className="fw-bold">Follow-up Created</div>
//         <div className="text-muted small">{type} follow-up has been created</div>
//       </div>,
//       {
//         position: "top-right",
//         autoClose: 3000,
//       }
//     );

//     return followUpRef.id;

//   } catch (error) {
//     console.error("Error creating follow-up:", error);
//     toast.error("Failed to create follow-up");
//     throw error;
//   }
// };

// export const updateFollowUpStatus = async (followUpId, newStatus, csoId = null, csoName = null, notes = "") => {
//   try {
//     const followUpRef = doc(db, "followUps", followUpId);
    
//     const updateData = {
//       status: newStatus,
//       updatedAt: serverTimestamp(),
//       history: {
//         action: "Status Update",
//         timestamp: new Date().toISOString(),
//         userId: csoId,
//         userName: csoName,
//         notes: notes || `Status updated to ${newStatus}`
//       }
//     };

//     if (csoId && newStatus === "In Progress") {
//       updateData.assignedCSOId = csoId;
//       updateData.assignedCSOName = csoName;
//     }

//     await updateDoc(followUpRef, updateData);

//     // Update job substatus if follow-up is completed or cancelled
//     if (newStatus === "Closed" || newStatus === "Cancelled") {
//       // Get the follow-up data to access the jobId and type
//       const followUpDoc = await getDoc(followUpRef);
//       const followUpData = followUpDoc.data();
      
//       const jobRef = doc(db, "jobs", followUpData.jobId);
//       await updateDoc(jobRef, {
//         [`subStatus.${followUpData.type.toLowerCase()}`]: false,
//         followUpCount: increment(-1),
//         [`followUps.${followUpId}.status`]: newStatus,
//         [`followUps.${followUpId}.completedAt`]: serverTimestamp()
//       });
//     }

//     toast.success(
//       <div>
//         <div className="fw-bold">Follow-up Updated</div>
//         <div className="text-muted small">Status changed to {newStatus}</div>
//       </div>,
//       {
//         position: "top-right",
//         autoClose: 3000,
//       }
//     );

//   } catch (error) {
//     console.error("Error updating follow-up:", error);
//     toast.error("Failed to update follow-up status");
//     throw error;
//   }
// };
