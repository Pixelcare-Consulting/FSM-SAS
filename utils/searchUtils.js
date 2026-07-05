import { getWorkerViewPath } from './workerRoutes';

// Update the highlightText function - removed HTML highlighting
function highlightText(text, searchTerm) {
  if (!text || !searchTerm) return text || '';
  
  // Remove existing highlight tags if they exist
  text = text.replace(/\[\[HIGHLIGHT\]\]|\[\[\/HIGHLIGHT\]\]/g, '');
  
  // Return plain text without HTML
  return text;
}

// Add this CSS to your global styles or component
const searchHighlightStyle = `
  .search-highlight {
    background-color: #fff3cd;
    padding: 0.1rem 0.2rem;
    border-radius: 0.2rem;
    font-weight: 500;
  }
`;

/** Quick dropdown: reserve rows for masterlist leads so they are not drowned out by customer matches */
function cappedQuickSearchResults(results, limit = 18, leadSlots = 5) {
  const leadsOnly = results.filter((r) => r.type === 'lead');
  const rest = results.filter((r) => r.type !== 'lead');
  const takeL = Math.min(leadsOnly.length, leadSlots);
  const takeRest = Math.min(rest.length, Math.max(0, limit - takeL));
  const merged = [...leadsOnly.slice(0, takeL), ...rest.slice(0, takeRest)];
  merged.sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
  );
  return merged.slice(0, limit);
}

function countsBySearchCategory(results) {
  return {
    customers: results.filter((r) => r.type === 'customer').length,
    leads: results.filter((r) => r.type === 'lead').length
  };
}

export const globalQuickSearch = async (db, searchQuery, isQuickSearch = false) => {
  const q = String(searchQuery || '').trim();
  const empty = isQuickSearch
    ? []
    : { results: [], totalCount: 0, counts: { customers: 0, leads: 0 } };

  if (!q) {
    return empty;
  }

  const fetchOpts = {
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    credentials: 'include',
    signal: AbortSignal.timeout(isQuickSearch ? 25000 : 120000)
  };

  try {
    const quickParam = isQuickSearch ? '&quick=1' : '';
    const res = await fetch(
      `/api/search/global-masterlist?q=${encodeURIComponent(q)}${quickParam}`,
      fetchOpts
    );
    const payload = res.ok ? await res.json() : { results: [], totalCount: 0, counts: {} };
    const results = payload.results || [];

    if (isQuickSearch) {
      return cappedQuickSearchResults(results);
    }

    return {
      results,
      totalCount: payload.totalCount ?? results.length,
      counts:
        payload.counts && Object.keys(payload.counts).length > 0
          ? payload.counts
          : countsBySearchCategory(results)
    };
  } catch (error) {
    console.error('Error in globalQuickSearch:', error);
    return isQuickSearch ? [] : { results: [], totalCount: 0, counts: { customers: 0, leads: 0 } };
  }
};

const renderHighlightedText = (text) => {
    if (!text) return '';
    
    const parts = text.split(/\[\[HIGHLIGHT\]\]|\[\[\/HIGHLIGHT\]\]/);
    
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return (
          <span 
            key={index}
            className="bg-light-primary text-primary"
            style={{ 
              padding: '0.1rem 0.3rem',
              borderRadius: '0.2rem',
              fontWeight: '600'
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

// Add these helper functions
const getCategoryConfig = (type) => {
  const configs = {
    customer: {
      highlightBg: '#e6f4ff',
      highlightText: '#0066cc',
      icon: 'fe-users'
    },
    worker: {
      highlightBg: '#e6ffe6',
      highlightText: '#008000',
      icon: 'fe-user-check'
    },
    job: {
      highlightBg: '#fff3e6',
      highlightText: '#cc6600',
      icon: 'fe-briefcase'
    },
    followUp: {
      highlightBg: '#ffe6e6',
      highlightText: '#cc0000',
      icon: 'fe-clock'
    }
  };
  
  return configs[type.toLowerCase()] || configs.customer;
};

const getTypeLabel = (type) => {
  const labels = {
    customer: 'Customer',
    worker: 'Worker',
    job: 'Job',
    followUp: 'Follow-up'
  };
  
  return labels[type] || type;
};

// Add this helper function for subtitles
const getSubtitleForType = (type, data, searchQuery) => {
  switch (type) {
    case 'customer':
      return `${data.CardCode || 'No ID'} | ${data.Phone1 || 'No Phone'}`;
    case 'worker':
      return `${data.workerId || 'No ID'} | ${data.role || 'No Role'} | ${data.status || 'Active'}`;
    case 'job':
      return `${data.jobID || 'No ID'} | ${data.jobStatus || 'No Status'} | ${data.customerName || 'No Customer'}`;
    case 'followUp':
      return `${data.type || 'No Type'} | ${data.status || 'No Status'} | Job: ${data.jobID || 'No Job'}`;
    default:
      return '';
  }
};

// Add this helper function at the top of your file
const getLinkForType = (type, id, data) => {
  switch (type) {
    case 'customer':
      return `/dashboard/customers/${data.CardCode || id}`;
    case 'worker':
      return getWorkerViewPath(data.workerId || id);
    case 'job':
      return `/dashboard/jobs/${data.jobID || id}`;
    case 'followUp':
      return `/dashboard/jobs/${data.jobID}?followUp=${id}`;
    default:
      return '#';
  }
};



// Update the search processing function
const processSearchResults = (doc, col, searchQuery) => {
  const data = doc.data();
  let title = '';
  
  switch (col.type) {
    case 'worker':
      // Properly format worker name from parts
      title = [
        data.firstName || '',
        data.middleName || '',
        data.lastName || ''
      ].filter(Boolean).join(' ') || data.fullName || 'Unnamed Worker';
      break;
      
    case 'followUp':
      // Clean up followUp title
      title = data.type || 'Follow-up';
      if (data.notes) {
        title += `: ${data.notes}`;
      }
      break;
      
    case 'job':
      title = data.jobName || 'Untitled Job';
      break;
      
    case 'customer':
      title = data.CardName || data.customerName || 'Unnamed Customer';
      break;
      
    default:
      title = data.title || 'Untitled';
  }

  return {
    id: doc.id,
    type: col.type,
    title: highlightText(title, searchQuery),
    subtitle: getFormattedSubtitle(col.type, data),
    link: getLinkForType(col.type, doc.id, data),
    status: data.status || data.jobStatus,
    email: data.email || data.EmailAddress,
    address: getFormattedAddress(data),
    workerId: data.workerId || data.CardCode,
    role: data.role || data.jobType
  };
};

// Add helper function to format subtitle
const getFormattedSubtitle = (type, data) => {
  switch (type) {
    case 'worker':
      return `${data.workerId || 'No ID'} | ${data.role || 'Worker'} | ${data.status || 'Active'}`;
    case 'job':
      return `${data.jobID || 'No ID'} | ${data.customerName || 'No Customer'}`;
    case 'followUp':
      return `${data.type || 'Follow-up'} | ${data.status || 'No Status'} | ${data.jobID || 'No Job'}`;
    case 'customer':
      return `${data.CardCode || 'No ID'} | ${data.Phone1 || 'No Phone'}`;
    default:
      return '';
  }
};

// Add helper function to format address
const getFormattedAddress = (data) => {
  if (!data) return '';
  
  const addressParts = [
    data.Street,
    data.Block,
    data.City,
    data.ZipCode
  ].filter(Boolean);
  
  return addressParts.length > 0 ? addressParts.join(', ') : '';
};

// import { getSupabaseClient } from '../lib/supabase/client';

// // Update the highlightText function - removed yellow highlight
// function highlightText(text, searchTerm) {
//   if (!text || !searchTerm) return text || '';
  
//   // Remove existing highlight tags if they exist
//   text = text.replace(/\[\[HIGHLIGHT\]\]|\[\[\/HIGHLIGHT\]\]/g, '');
  
//   // Return text without highlighting
//   return text;
// }

// const fetchCustomers = async (searchQuery, limit = null) => {
//     try {
//       const queryParams = new URLSearchParams({
//         search: searchQuery,
//         ...(limit && { limit: limit.toString() })
//       });

//       const response = await fetch(`/api/getCustomersList?${queryParams}`, {
//         headers: {
//           'Cache-Control': 'no-cache',
//           'Pragma': 'no-cache'
//         },
//         signal: AbortSignal.timeout(5000) // 5 second timeout
//       });

//       if (!response.ok) {
//         throw new Error(`API returned ${response.status}`);
//       }

//       // First try to get the response as text
//       const textResponse = await response.text();
      
//       try {
//         // Then parse it as JSON
//         return JSON.parse(textResponse);
//       } catch (parseError) {
//         console.error('Invalid JSON response:', textResponse);
//         return { customers: [] };
//       }
//     } catch (error) {
//       if (error.name === 'TimeoutError') {
//         console.warn('Customer API request timed out');
//       } else {
//         console.warn('Error fetching customers:', error);
//       }
//       return { customers: [] };
//     }
//   };

//   /**
//    * Global Quick Search Function
//    * 
//    * Searches across multiple entities:
//    * 
//    * CUSTOMERS (SAP):
//    * - Customer Name (CardName)
//    * - BP Code (CardCode)
//    * - Address fields (Address, Street, Block, City, ZipCode)
//    * 
//    * JOBS:
//    * - Job Number (job_number)
//    * - Job Title/Name (title, job_name)
//    * - Description (description, jobDescription)
//    * - Status (status)
//    * - Customer Name (customer.customer_name)
//    * 
//    * WORKERS:
//    * - Full Name (full_name)
//    * - Email (email)
//    * 
//    * FOLLOW-UPS:
//    * - Notes (notes)
//    * - Type (type)
//    * - Status (status)
//    */
//   export const globalQuickSearch = async (db, searchQuery, isQuickSearch = false) => {
//     const results = [];
//     if (!searchQuery || !searchQuery.trim()) {
//       return isQuickSearch ? [] : { results: [], totalCount: 0, counts: { customers: 0, workers: 0, jobs: 0, followUps: 0 } };
//     }
//     const searchQueryLower = searchQuery.trim().toLowerCase();

//     try {
//       // Search SAP customers with better error handling
//       let sapCustomers = { customers: [] };
//       try {
//         const response = await fetch(`/api/getCustomersList?search=${encodeURIComponent(searchQuery)}${isQuickSearch ? '&limit=10' : ''}`, {
//           headers: {
//             'Cache-Control': 'no-cache',
//             'Pragma': 'no-cache'
//           },
//           signal: AbortSignal.timeout(5000)
//         });

//         if (!response.ok) {
//           throw new Error(`API returned ${response.status}`);
//         }

//         const textResponse = await response.text();
//         sapCustomers = JSON.parse(textResponse);
//       } catch (error) {
//         console.warn('Error fetching customers:', error);
//       }

//       // Process customers
//       if (sapCustomers?.customers?.length) {
//         sapCustomers.customers.forEach(customer => {
//           if (customer.CardName?.toLowerCase().includes(searchQueryLower) ||
//               customer.CardCode?.toLowerCase().includes(searchQueryLower) ||
//               customer.Address?.toLowerCase().includes(searchQueryLower) ||
//               customer.Street?.toLowerCase().includes(searchQueryLower) ||
//               customer.Block?.toLowerCase().includes(searchQueryLower) ||
//               customer.ZipCode?.toLowerCase().includes(searchQueryLower) ||
//               customer.City?.toLowerCase().includes(searchQueryLower)) {
            
//             const addressParts = [
//               customer.Street,
//               customer.Block,
//               customer.City,
//               customer.ZipCode
//             ].filter(Boolean);
//             const formattedAddress = addressParts.join(', ');

//             results.push({
//               id: customer.CardCode,
//               type: 'customer',
//               title: customer.CardName || 'Unnamed Customer', // Plain text, no highlighting
//               subtitle: `${customer.CardCode || 'N/A'} | ${customer.Phone1 || 'No Tel'}`, // Simplified subtitle
//               address: formattedAddress || 'No Address',
//               link: `/dashboard/customers/${customer.CardCode}`,
//               rawTitle: customer.CardName || 'Unnamed Customer',
//               isSAPCustomer: true,
//               contractStatus: customer.U_Contract === 'Y' ? 'With Contract' : 'No Contract',
//               email: customer.EmailAddress,
//               phone: customer.Phone1,
//               bpCode: customer.CardCode,
//               name: customer.CardName,
//               tel: customer.Phone1,
//               address: formattedAddress
//             });
//           }
//         });
//       }

//       // Search Supabase tables (jobs, technicians, followups)
//       const supabase = getSupabaseClient();
//       if (!supabase) {
//         console.warn('[Search] Supabase client not available - cannot search jobs, workers, or follow-ups');
//       } else {
//         console.log(`[Search] Starting Supabase search for: "${searchQuery}"`);
//         try {
//           // Search Jobs - fetch all and filter client-side for better compatibility
//           console.log(`[Search] Querying Supabase jobs table...`);
//           let jobsQuery = supabase
//             .from('jobs')
//             .select(`
//               *,
//               customer:customer_id(customer_name, customer_code),
//               location:location_id(location_name, address, street, city, state_province, zip_code)
//             `)
//             .is('deleted_at', null)
//             .order('created_at', { ascending: false });
          
//           // Increase limit for better search coverage
//           // For quick search, fetch more records to filter
//           // For full search, fetch all records (or a very high limit)
//           if (isQuickSearch) {
//             jobsQuery = jobsQuery.limit(200); // Increased from 50 to 200 for better coverage
//             console.log(`[Search] Quick search mode - limiting to 200 jobs`);
//           } else {
//             jobsQuery = jobsQuery.limit(1000); // Fetch up to 1000 jobs for full search
//             console.log(`[Search] Full search mode - limiting to 1000 jobs`);
//           }

//           const { data: jobs, error: jobsError } = await jobsQuery;
          
//           if (jobsError) {
//             console.error('[Search] Error fetching jobs from Supabase:', jobsError);
//             console.error('[Search] Error details:', JSON.stringify(jobsError, null, 2));
//             // Continue processing even if there's an error - jobs might still be returned
//           }
          
//           if (jobs && Array.isArray(jobs)) {
//             console.log(`[Search] Successfully fetched ${jobs.length} jobs from Supabase`);
//             // Log first few job numbers for debugging
//             const sampleJobNumbers = jobs.slice(0, 5).map(j => j?.job_number).filter(Boolean);
//             if (sampleJobNumbers.length > 0) {
//               console.log(`[Search] Sample job numbers: ${sampleJobNumbers.join(', ')}`);
//             }
//           } else {
//             console.warn(`[Search] No jobs returned from Supabase (jobs: ${jobs}, error: ${jobsError?.message || 'none'})`);
//           }
          
//           // Process jobs if we have any, even if there was a minor error
//           if (jobs && Array.isArray(jobs) && jobs.length > 0) {
//             console.log(`[Search] Filtering ${jobs.length} jobs for query: "${searchQuery}"`);
//             const filteredJobs = jobs.filter(job => {
//               if (!job || typeof job !== 'object') return false; // Skip null/undefined/invalid jobs
              
//               try {
//                 // Get all searchable fields - handle all possible field name variations
//                 const jobTitle = String(job.title || job.job_name || job.subject || job.name || '').toLowerCase().trim();
//                 const jobNumber = String(job.job_number || job.jobNumber || job.job_no || job.jobNo || '').toLowerCase().trim();
//                 const status = String(job.status || job.jobStatus || '').toLowerCase().trim();
//                 const priority = String(job.priority || '').toLowerCase().trim();
//                 const customerName = String(job.customer?.customer_name || job.customerName || '').toLowerCase().trim();
//                 const customerCode = String(job.customer?.customer_code || job.customerCode || '').toLowerCase().trim();
                
//                 // Search in description - strip HTML tags for better matching
//                 const jobDescription = String(job.description || job.jobDescription || job.desc || '')
//                   .replace(/<[^>]*>/g, '') // Remove HTML tags
//                   .replace(/\s+/g, ' ') // Normalize whitespace
//                   .toLowerCase()
//                   .trim();
                
//                 // Search in location fields
//                 const locationName = String(job.location?.location_name || job.location?.name || '').toLowerCase().trim();
//                 const locationAddress = String(job.location?.address || '').toLowerCase().trim();
//                 const locationStreet = String(job.location?.street || '').toLowerCase().trim();
//                 const locationCity = String(job.location?.city || '').toLowerCase().trim();
                
//                 // Check if search query matches any field (case-insensitive partial match)
//                 const matches = jobTitle.includes(searchQueryLower) ||
//                                jobNumber.includes(searchQueryLower) ||
//                                status.includes(searchQueryLower) ||
//                                priority.includes(searchQueryLower) ||
//                                customerName.includes(searchQueryLower) ||
//                                customerCode.includes(searchQueryLower) ||
//                                jobDescription.includes(searchQueryLower) ||
//                                locationName.includes(searchQueryLower) ||
//                                locationAddress.includes(searchQueryLower) ||
//                                locationStreet.includes(searchQueryLower) ||
//                                locationCity.includes(searchQueryLower);
                
//                 return matches;
//               } catch (error) {
//                 console.warn('[Search] Error filtering job:', error, job);
//                 return false;
//               }
//             }).slice(0, isQuickSearch ? 10 : undefined);
            
//             console.log(`[Search] Filtered ${filteredJobs.length} matching jobs out of ${jobs.length} total jobs for query: "${searchQuery}"`);
            
//             if (filteredJobs.length > 0) {
//               console.log(`[Search] ✓ Found ${filteredJobs.length} matching jobs - adding to results`);
//             } else {
//               console.log(`[Search] ✗ No jobs matched the search query "${searchQuery}"`);
//               // Debug: log why jobs didn't match
//               if (jobs.length > 0) {
//                 const sampleJob = jobs[0];
//                 console.log(`[Search] Sample job data for debugging:`, {
//                   title: sampleJob.title,
//                   job_number: sampleJob.job_number,
//                   description: sampleJob.description?.substring(0, 50) || 'no description',
//                   customer: sampleJob.customer?.customer_name || 'no customer',
//                   searchQuery: searchQueryLower
//                 });
//               }
//             }
            
//             filteredJobs.forEach(job => {
//               const jobTitle = job.title || job.job_name || 'Untitled Job';
//               const customerName = job.customer?.customer_name || '';
              
//               // Format address from location
//               const location = job.location || {};
//               const addressParts = [
//                 location.address,
//                 location.street,
//                 location.city,
//                 location.state_province,
//                 location.zip_code
//               ].filter(Boolean);
//               const formattedAddress = addressParts.length > 0 ? addressParts.join(', ') : 'No Address';
              
//               // Format appointment date/time
//               let appointmentDateTime = 'No Appointment';
//               if (job.scheduled_start) {
//                 const startDate = new Date(job.scheduled_start);
//                 const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
//                 const timeStr = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
//                 appointmentDateTime = `${dateStr} ${timeStr}`;
//                 if (job.scheduled_end) {
//                   const endDate = new Date(job.scheduled_end);
//                   const endTimeStr = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
//                   appointmentDateTime += ` - ${endTimeStr}`;
//                 }
//               }
              
//               results.push({
//                 id: job.id,
//                 type: 'job',
//                 title: jobTitle, // Plain text, no highlighting
//                 subtitle: `${job.job_number || 'No ID'} | ${customerName || 'No Customer'}`, // Simplified subtitle
//                 link: `/dashboard/jobs/${job.id}`, // Use job.id instead of job_number to fix loading issue
//                 rawTitle: jobTitle,
//                 status: job.status,
//                 date: job.created_at,
//                 customerName: customerName,
//                 priority: job.priority,
//                 jobNumber: job.job_number,
//                 address: formattedAddress,
//                 appointmentDateTime: appointmentDateTime
//               });
//             });
//           }

//           // Search Technicians (Workers)
//           let techniciansQuery = supabase
//             .from('technicians')
//             .select(`
//               *,
//               user:user_id(username, email)
//             `)
//             .is('deleted_at', null)
//             .order('created_at', { ascending: false });
          
//           if (isQuickSearch) {
//             techniciansQuery = techniciansQuery.limit(50); // Fetch more to filter
//           }

//           const { data: technicians, error: techniciansError } = await techniciansQuery;
          
//           if (!techniciansError && technicians) {
//             const filteredTechnicians = technicians.filter(technician => {
//               const fullName = (technician.full_name || '').toLowerCase();
//               const email = (technician.email || technician.user?.email || '').toLowerCase();
              
//               return fullName.includes(searchQueryLower) ||
//                      email.includes(searchQueryLower);
//             }).slice(0, isQuickSearch ? 10 : undefined);
            
//             filteredTechnicians.forEach(technician => {
//               const fullName = technician.full_name || '';
//               const email = technician.email || technician.user?.email || '';
              
//               results.push({
//                 id: technician.id,
//                 type: 'worker',
//                 title: highlightText(fullName || 'Unnamed Worker', searchQuery),
//                 subtitle: `${technician.user?.username || email || 'No ID'} | ${technician.role || 'Worker'}`,
//                 link: `/dashboard/workers/${technician.id}`,
//                 rawTitle: fullName || 'Unnamed Worker',
//                 status: technician.status || 'Active',
//                 email: email,
//                 workerID: technician.user?.username || email
//               });
//             });
//           }

//           // Search Follow-ups
//           let followUpsQuery = supabase
//             .from('followups')
//             .select(`
//               *,
//               job:job_id(
//                 job_number,
//                 title,
//                 customer:customer_id(customer_name)
//               )
//             `)
//             .is('deleted_at', null)
//             .order('created_at', { ascending: false });
          
//           if (isQuickSearch) {
//             followUpsQuery = followUpsQuery.limit(50); // Fetch more to filter
//           }

//           const { data: followUps, error: followUpsError } = await followUpsQuery;
          
//           if (!followUpsError && followUps) {
//             const filteredFollowUps = followUps.filter(followUp => {
//               const notes = (followUp.notes || '').toLowerCase();
//               const type = (followUp.type || '').toLowerCase();
//               const status = (followUp.status || '').toLowerCase();
              
//               return notes.includes(searchQueryLower) ||
//                      type.includes(searchQueryLower) ||
//                      status.includes(searchQueryLower);
//             }).slice(0, isQuickSearch ? 10 : undefined);
            
//             filteredFollowUps.forEach(followUp => {
//               const notes = followUp.notes || '';
//               const jobNumber = followUp.job?.job_number || followUp.job_id;
//               const customerName = followUp.job?.customer?.customer_name || '';
              
//               results.push({
//                 id: followUp.id,
//                 type: 'followUp',
//                 title: highlightText(notes || followUp.type || 'Untitled Follow-up', searchQuery),
//                 subtitle: `${highlightText(followUp.type || 'No Type', searchQuery)} | ${followUp.status || 'No Status'} | Job: ${jobNumber || 'N/A'}`,
//                 link: `/dashboard/jobs/${jobNumber}?followUp=${followUp.id}`,
//                 rawTitle: notes || followUp.type || 'Untitled Follow-up',
//                 status: followUp.status,
//                 date: followUp.created_at,
//                 jobID: jobNumber,
//                 jobName: followUp.job?.title || 'Untitled Job',
//                 customerName: customerName
//               });
//             });
//           }
//         } catch (supabaseError) {
//           console.warn('Error searching Supabase tables:', supabaseError);
//         }
//       }

//       // Sort results
//       results.sort((a, b) => {
//         const typeOrder = { customer: 1, job: 2, worker: 3, followUp: 4 };
//         return typeOrder[a.type] - typeOrder[b.type];
//       });

//       // Return different formats based on search type
//       if (isQuickSearch) {
//         return results.slice(0, 10);
//       }

//       return {
//         results,
//         totalCount: results.length,
//         counts: {
//           customers: results.filter(r => r.type === 'customer').length,
//           workers: results.filter(r => r.type === 'worker').length,
//           jobs: results.filter(r => r.type === 'job').length,
//           followUps: results.filter(r => r.type === 'followUp').length
//         }
//       };

//     } catch (error) {
//       console.error('Error in globalQuickSearch:', error);
//       return isQuickSearch ? [] : {
//         results: [],
//         totalCount: 0,
//         counts: { customers: 0, workers: 0, jobs: 0, followUps: 0 }
//       };
//     }
//   };

// const renderHighlightedText = (text) => {
//     if (!text) return '';
    
//     const parts = text.split(/\[\[HIGHLIGHT\]\]|\[\[\/HIGHLIGHT\]\]/);
    
//     return parts.map((part, index) => {
//       if (index % 2 === 1) {
//         return (
//           <span 
//             key={index}
//             className="bg-light-primary text-primary"
//             style={{ 
//               padding: '0.1rem 0.3rem',
//               borderRadius: '0.2rem',
//               fontWeight: '600'
//             }}
//           >
//             {part}
//           </span>
//         );
//       }
//       return part;
//     });
//   };

// // Add these helper functions
// const getCategoryConfig = (type) => {
//   const configs = {
//     customer: {
//       highlightBg: '#e6f4ff',
//       highlightText: '#0066cc',
//       icon: 'fe-users'
//     },
//     worker: {
//       highlightBg: '#e6ffe6',
//       highlightText: '#008000',
//       icon: 'fe-user-check'
//     },
//     job: {
//       highlightBg: '#fff3e6',
//       highlightText: '#cc6600',
//       icon: 'fe-briefcase'
//     },
//     followUp: {
//       highlightBg: '#ffe6e6',
//       highlightText: '#cc0000',
//       icon: 'fe-clock'
//     }
//   };
  
//   return configs[type.toLowerCase()] || configs.customer;
// };

// const getTypeLabel = (type) => {
//   const labels = {
//     customer: 'Customer',
//     worker: 'Worker',
//     job: 'Job',
//     followUp: 'Follow-up'
//   };
  
//   return labels[type] || type;
// };

// // Add this helper function for subtitles
// const getSubtitleForType = (type, data, searchQuery) => {
//   switch (type) {
//     case 'customer':
//       return `${data.CardCode || 'No ID'} | ${data.Phone1 || 'No Phone'}`;
//     case 'worker':
//       return `${data.workerId || 'No ID'} | ${data.role || 'No Role'} | ${data.status || 'Active'}`;
//     case 'job':
//       return `${data.jobID || 'No ID'} | ${data.jobStatus || 'No Status'} | ${data.customerName || 'No Customer'}`;
//     case 'followUp':
//       return `${data.type || 'No Type'} | ${data.status || 'No Status'} | Job: ${data.jobID || 'No Job'}`;
//     default:
//       return '';
//   }
// };

// // Add this helper function at the top of your file
// const getLinkForType = (type, id, data) => {
//   switch (type) {
//     case 'customer':
//       return `/dashboard/customers/${data.CardCode || id}`;
//     case 'worker':
//       return `/workers/view/${data.workerId || id}`;
//     case 'job':
//       return `/dashboard/jobs/${data.jobID || id}`;
//     case 'followUp':
//       return `/dashboard/jobs/${data.jobID}?followUp=${id}`;
//     default:
//       return '#';
//   }
// };



// // Update the search processing function
// const processSearchResults = (doc, col, searchQuery) => {
//   const data = doc.data();
//   let title = '';
  
//   switch (col.type) {
//     case 'worker':
//       // Properly format worker name from parts
//       title = [
//         data.firstName || '',
//         data.middleName || '',
//         data.lastName || ''
//       ].filter(Boolean).join(' ') || data.fullName || 'Unnamed Worker';
//       break;
      
//     case 'followUp':
//       // Clean up followUp title
//       title = data.type || 'Follow-up';
//       if (data.notes) {
//         title += `: ${data.notes}`;
//       }
//       break;
      
//     case 'job':
//       title = data.jobName || 'Untitled Job';
//       break;
      
//     case 'customer':
//       title = data.CardName || data.customerName || 'Unnamed Customer';
//       break;
      
//     default:
//       title = data.title || 'Untitled';
//   }

//   return {
//     id: doc.id,
//     type: col.type,
//     title: highlightText(title, searchQuery),
//     subtitle: getFormattedSubtitle(col.type, data),
//     link: getLinkForType(col.type, doc.id, data),
//     status: data.status || data.jobStatus,
//     email: data.email || data.EmailAddress,
//     address: getFormattedAddress(data),
//     workerId: data.workerId || data.CardCode,
//     role: data.role || data.jobType
//   };
// };

// // Add helper function to format subtitle
// const getFormattedSubtitle = (type, data) => {
//   switch (type) {
//     case 'worker':
//       return `${data.workerId || 'No ID'} | ${data.role || 'Worker'} | ${data.status || 'Active'}`;
//     case 'job':
//       return `${data.jobID || 'No ID'} | ${data.customerName || 'No Customer'}`;
//     case 'followUp':
//       return `${data.type || 'Follow-up'} | ${data.status || 'No Status'} | ${data.jobID || 'No Job'}`;
//     case 'customer':
//       return `${data.CardCode || 'No ID'} | ${data.Phone1 || 'No Phone'}`;
//     default:
//       return '';
//   }
// };

// // Add helper function to format address
// const getFormattedAddress = (data) => {
//   if (!data) return '';
  
//   const addressParts = [
//     data.Street,
//     data.Block,
//     data.City,
//     data.ZipCode
//   ].filter(Boolean);
  
//   return addressParts.length > 0 ? addressParts.join(', ') : '';
// };