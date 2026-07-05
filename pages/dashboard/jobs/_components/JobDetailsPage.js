import { useRouter } from "next/router";
import { useEffect, useState, Fragment, useRef, useCallback, useMemo } from "react";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { pickMasterlistContactRow } from "../../../../lib/jobs/pickMasterlistSiteContact";
import { jobService, followUpService, jobMediaService } from "../../../../lib/supabase/database";
import { emitFollowUpStakeholderNotifications } from "../../../../lib/notifications/jobStakeholderNotificationsClient";
import { uploadFile, getDownloadURL, deleteFile } from "../../../../lib/supabase/storage";
import { toTelHref, phoneLinkRow } from "../../../../lib/utils/toTelHref";
import { savePdfBlob, parsePdfFilenameFromHeader } from "../../../../lib/utils/savePdfBlob";
import { normalizeRichTextHtml } from "../../../../lib/utils/normalizeRichTextHtml";
import styles from "../ViewJobs.module.css"; // Import your CSS module
import richTextStyles from "../../../../styles/richTextContent.module.css";
import {
  Row,
  Col,
  Card,
  Image,
  OverlayTrigger,
  Tooltip,
  Breadcrumb,
  ListGroup,
  Form,
  Button,
  Nav,
  Modal,
  Pagination,
  InputGroup,
  Badge,
  Container,
  Table,
  Alert,
} from "react-bootstrap";
import {
  Calendar4,
  XCircle,
  PlayCircle,
  Check,
  ClipboardCheck,
  FileText,
  QuestionCircle,
  Search,
  Tags,
  Plus,
  X,
  Clock,
  TelephoneFill,
  PersonFill,
  Whatsapp,
  Printer,
  Envelope,
  PhoneFill,
  Bell,
  GeoAltFill,
  BellFill,
  Headset,
  BoxArrowUpRight,
  ThreeDotsVertical,
  ChevronUp,
  ChevronDown,
  Trash,
  Image as ImageIcon,
  CalendarCheck,
  Images,
  CreditCard2Front,
  Send,
} from "react-bootstrap-icons";
import { CustomCountryFlag } from "components/flags/CountryFlags";
import {
  FaPencilAlt, // For edit button
  FaTrash, // For delete button
  FaTools, // For equipment stat card
  FaCheckCircle, // For tasks stat card
  FaMapMarkerAlt, // For equipment location icon
  FaIndustry, // For equipment brand icon
  FaBarcode, // For equipment model icon
  FaWhatsapp,
  FaHashtag,
  FaCalendarCheck,
  FaCalendarTimes,
  FaStickyNote,
  FaLayerGroup,
  FaQrcode,
} from "react-icons/fa";
import { GoogleMap, InfoWindow, useLoadScript } from "@react-google-maps/api"; // Google Map import
import JobDetailsAdvancedMarkers, {
  computeTechnicianMapPosition,
} from "./JobDetailsAdvancedMarkers";
import { getGoogleMapsScriptLibraries } from "../../../../lib/googleMapsScriptLibraries";
import { getAddressNotesFromDetailsMap } from "../../../../lib/utils/addressNotes";
import { sanitizeAddressPart } from "../../../../lib/utils/formatPortalBpAddress";
import {
  resolveJobDisplayAddress,
  formatLocationRecordAsSingleLine as formatJobLocationLine,
} from "../../../../lib/jobs/resolveJobDisplayAddress";
import {
  formatSingaporeTimeHm,
  getSingaporeCalendarParts,
  toSingaporeYmd,
} from "../../../../lib/utils/singaporeDateTime";

// Default avatar path
const defaultAvatar = "/images/avatar/NoProfile.png";
import Link from "next/link"; // Add this import
import NextImage from "next/image";
import Cookies from "js-cookie";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import isToday from "date-fns/isToday";
import isYesterday from "date-fns/isYesterday";
import isSameYear from "date-fns/isSameYear";
import { AllTechnicianNotesTable } from "../../../../components/AllTechnicianNotesTable";
import Swal from 'sweetalert2';
import toast from 'react-hot-toast';
import ReactQuillEditor from '../../../../widgets/editor/ReactQuillEditor';
import 'quill/dist/quill.snow.css';
import DOMPurify from 'dompurify'; // Add this for sanitizing HTML
import FollowUpModal from '../../../../components/FollowUpModal';
import JobServiceCallSalesOrder from '../../../../components/jobs/JobServiceCallSalesOrder';
import { buildAuditChanges, clientAuditLog } from '../../../../utils/clientAuditLog';
import {
  buildFollowUpSnapshot,
  buildTaskSnapshot,
} from '../../../../utils/auditSnapshots';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import format from "date-fns/format";
// Removed Firebase auth import - using Supabase
import { fetchFollowUpTypes } from '../../../../utils/followUpSettings';
import { fetchJobStatuses, getDefaultJobStatuses, getJobStatusColorFromList, getJobStatusLabelFromList } from '../../../../utils/jobStatusSettings';
import { emitJobCompletedEmail, emitSendTemplateEmail, emitDispatchEventEmail } from '../../../../lib/notifications/transactionalJobEmailClient';
import { showJobCompletedEmailToast } from '../../../../lib/email/jobEmailToastMessages';
import { getTechnicianStatusLabel, getTechnicianStatusColor } from '../../../../lib/scheduler/technicianSchedulerUtils';
import StatusBadge from '../../../../components/StatusBadge';
import FollowUpLegend from '../../../../components/FollowUpLegend';
import { QRCodeSVG } from 'qrcode.react';


// Helper function to fetch worker details from Supabase
const fetchWorkerDetails = async (workerIds) => {
  const workersData = [];
  if (workerIds && workerIds.length > 0) {
    const supabase = getSupabaseClient();
    if (!supabase) return workersData;
    
    try {
      const { data: technicians, error } = await supabase
        .from('technicians')
        .select(`
          *,
          users(*)
        `)
        .in('id', workerIds)
        .is('deleted_at', null);
      
      if (error) {
        console.error('Error fetching workers:', error);
        return workersData;
      }
      
      return technicians || [];
    } catch (error) {
      console.error('Error fetching worker details:', error);
      return workersData;
    }
  }
  return workersData;
};

/**
 * Map center from a `locations` row, `location_technicians` row, or nested coordinates object.
 */
const getLatLngFromLocationRecord = (record) => {
  if (!record || typeof record !== "object") return null;
  const parsePair = (latRaw, lngRaw) => {
    if (latRaw == null || lngRaw == null) return null;
    const latStr = String(latRaw).trim();
    const lngStr = String(lngRaw).trim();
    if (!latStr || !lngStr) return null;
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };
  let pair = parsePair(record.current_latitude, record.current_longitude);
  if (pair) return pair;
  pair = parsePair(record.destination_latitude, record.destination_longitude);
  if (pair) return pair;
  const c = record.coordinates;
  if (c && typeof c === "object") {
    pair = parsePair(c.latitude ?? c.lat, c.longitude ?? c.lng);
    if (pair) return pair;
  }
  return null;
};

// Add this helper function near the top with other helper functions
const formatTime = (timeString) => {
  if (!timeString) return "N/A";
  // Convert 24h format to 12h format with AM/PM
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

/** End of work window from `job_schedule` duration; may differ from `scheduled_end` until both are synced. */
const getWorkWindowEndFromJobDuration = (job) => {
  if (!job?.scheduled_start) return null;
  const start = new Date(job.scheduled_start);
  if (Number.isNaN(start.getTime())) return null;
  const hasHours =
    job.estimatedDurationHours !== undefined && job.estimatedDurationHours !== null;
  const hasMinutes =
    job.estimatedDurationMinutes !== undefined && job.estimatedDurationMinutes !== null;
  if (!hasHours && !hasMinutes) return null;
  const h = hasHours ? Math.max(0, Number(job.estimatedDurationHours) || 0) : 0;
  const m = hasMinutes ? Math.max(0, Number(job.estimatedDurationMinutes) || 0) : 0;
  if (h === 0 && m === 0) return null;
  return new Date(start.getTime() + (h * 60 + m) * 60 * 1000);
};

const formatTechnicianDateTime = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const timeLower = format(d, "h:mm a").replace(" AM", " am").replace(" PM", " pm");
  if (isToday(d)) {
    return `Today at ${timeLower}`;
  }
  if (isYesterday(d)) {
    return `Yesterday at ${timeLower}`;
  }
  if (isSameYear(d, new Date())) {
    return `${format(d, "d MMM")} at ${timeLower}`;
  }
  return `${format(d, "d MMM yyyy")} at ${timeLower}`;
};

/** Full stamp for tooltips (24h + seconds) */
const formatTechnicianDateTimePrecise = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "d MMM yyyy, HH:mm:ss");
};

/** CSO monitoring: GPS older than this is flagged as stale */
const CSO_STALE_GPS_MS = 45 * 60 * 1000;

/** Rows from `jobAttendance` tied to this assignment (explicit technician_job_id or legacy null link). */
const getAttendanceRowsForTechnicianJob = (attendanceRows, technicianJobId, technicianId) => {
  if (!Array.isArray(attendanceRows) || attendanceRows.length === 0) return [];
  return attendanceRows.filter((r) => {
    if (technicianJobId && r.technician_job_id === technicianJobId) return true;
    if (
      technicianId &&
      r.technician_id === technicianId &&
      (r.technician_job_id == null || r.technician_job_id === "")
    ) {
      return true;
    }
    return false;
  });
};

const getLatestAttendanceForTechnicianJob = (attendanceRows, technicianJobId, technicianId) => {
  const rows = getAttendanceRowsForTechnicianJob(attendanceRows, technicianJobId, technicianId);
  if (!rows.length) return null;
  return rows.reduce((best, r) => {
    if (!best) return r;
    return new Date(r.clock_in) > new Date(best.clock_in) ? r : best;
  }, null);
};

/** Map Supabase job_tasks rows to UI taskList shape. Never fabricate createdAt. */
const mapJobTasksToTaskList = (jobTasks) =>
  (jobTasks || []).map((task, index) => ({
    taskID: task.id || `task-${index}`,
    taskName: task.task_name || '',
    taskDescription: task.task_description || '',
    isPriority: task.is_required || false,
    isDone: task.is_completed === true,
    completedByTechnicianId: task.completed_by_technician_id || null,
    completedByName:
      (Array.isArray(task.completed_by_technician)
        ? task.completed_by_technician[0]?.full_name
        : task.completed_by_technician?.full_name) || null,
    createdAt: task.created_at || null,
    completionDate: null,
  }));

const JOB_REALTIME_DEBOUNCE_MS = 400;

/** Merge flat jobs-row realtime payload without dropping nested relations. */
const mergeJobHeaderFromRow = (prevJob, row) => {
  if (!prevJob || !row) return prevJob;
  return {
    ...prevJob,
    ...row,
    jobNo: row.job_number ?? prevJob.jobNo,
    jobName: row.title ?? prevJob.jobName,
    jobStatus: row.status ?? prevJob.jobStatus,
    jobType: row.category ?? prevJob.jobType,
    jobDescription: row.description ?? prevJob.jobDescription,
    description: row.description ?? prevJob.description,
    technician_jobs: prevJob.technician_jobs,
    job_tasks: prevJob.job_tasks,
    job_equipments: prevJob.job_equipments,
    taskList: prevJob.taskList,
    customer: prevJob.customer,
    location: prevJob.location,
    service_call: prevJob.service_call,
    sales_order: prevJob.sales_order,
    contact: prevJob.contact,
    payment_profile: prevJob.payment_profile,
    created_by_user: prevJob.created_by_user,
  };
};

const getCsoGpsSummary = (techLocationData) => {
  if (!techLocationData?.tracked_at) {
    return { text: "No GPS fix yet", stale: true };
  }
  const tracked = new Date(techLocationData.tracked_at);
  const ageMs = Date.now() - tracked.getTime();
  const relative = formatDistanceToNow(tracked, { addSuffix: true });
  const stale = ageMs > CSO_STALE_GPS_MS;
  return {
    text: stale ? `Stale — ${relative}` : `Updated ${relative}`,
    stale,
  };
};

const getCsoOpenMapsUrl = (techLocationData, jobLocation) => {
  const lat =
    techLocationData?.current_latitude ??
    techLocationData?.destination_latitude ??
    jobLocation?.current_latitude ??
    jobLocation?.destination_latitude;
  const lng =
    techLocationData?.current_longitude ??
    techLocationData?.destination_longitude ??
    jobLocation?.current_longitude ??
    jobLocation?.destination_longitude;
  if (lat == null || lng == null) return null;
  const nlat = Number(lat);
  const nlng = Number(lng);
  if (Number.isNaN(nlat) || Number.isNaN(nlng)) return null;
  return `https://www.google.com/maps?q=${nlat},${nlng}`;
};

const buildActorInfo = (userRecord = null, technicianRecord = null, accountLabel = null) => {
  const fullName =
    accountLabel ||
    technicianRecord?.full_name ||
    userRecord?.full_name ||
    userRecord?.username ||
    null;
  const email =
    technicianRecord?.email ||
    userRecord?.email ||
    userRecord?.username ||
    null;
  const username = userRecord?.username || null;

  if (!fullName && !email && !username) {
    return null;
  }

  return {
    fullName,
    email,
    username,
    accountLabel,
  };
};

const getActorDisplayLabel = (actor) => {
  if (!actor) return "";
  return actor.fullName || actor.accountLabel || actor.email || actor.username || "";
};

// Add these helper functions before the JobDetails component
const getJobStatusName = (status) => {
  if (!status) return "Unknown Status";
  
  switch (status.toUpperCase()) {
    // Database status values
    case "PENDING":
      return "Pending";
    case "IN_PROGRESS":
      return "In Progress";
    case "UPCOMING":
      return "Upcoming";
    case "OVERDUE":
      return "Overdue";
    case "WAITING":
      return "Waiting";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    // Legacy status values (for backward compatibility)
    case "CREATED":
      return "Created";
    case "CONFIRMED":
      return "Confirmed";
    case "REPEATED":
      return "Repeated";
    case "JOB STARTED":
      return "In Progress";
    case "JOB COMPLETE":
      return "Completed";
    case "INPROGRESS":
      return "In Progress";
    case "IN PROGRESS":
      return "In Progress";
    case "VALIDATE":
      return "Validate";
    case "SCHEDULED":
      return "Scheduled";
    default:
      // Return the original status if it doesn't match, or "Unknown Status" if empty
      return status || "Unknown Status";
  }
};

// Optional: Add this for status styling
const getStatusColor = (status) => {
  if (!status) return "secondary";
  
  switch (status.toUpperCase()) {
    // Database status values
    case "PENDING":
      return "secondary"; // grey
    case "IN_PROGRESS":
      return "warning"; // orange
    case "UPCOMING":
      return "info"; // light blue
    case "OVERDUE":
      return "danger"; // red
    case "WAITING":
      return "warning"; // orange
    case "COMPLETED":
      return "success"; // green
    case "CANCELLED":
      return "danger"; // red
    // Legacy status values (for backward compatibility)
    case "CREATED":
      return "secondary"; // grey
    case "CONFIRMED":
      return "primary"; // blue
    case "REPEATED":
      return "info"; // light blue
    case "JOB STARTED":
    case "INPROGRESS":
    case "IN PROGRESS":
      return "warning"; // orange
    case "JOB COMPLETE":
      return "success"; // green
    case "VALIDATE":
      return "info"; // light blue
    case "SCHEDULED":
      return "dark"; // dark grey
    default:
      return "secondary"; // grey
  }
};

// Update getPriorityColor function to handle numeric priorities
const getPriorityColor = (priority) => {
  switch (priority) {
    case 1: return '#198754'; // Low - green
    case 2: return '#0d6efd'; // Normal - blue
    case 3: return '#fd7e14'; // High - orange
    case 4: return '#dc3545'; // Urgent - red
    default: return '#6c757d'; // Default - grey
  }
};

// Helper function to convert country name to country code
const getCountryCode = (country) => {
  if (!country) return '';
  
  // If it's already a 2-letter code, return it
  if (country.length === 2 && /^[A-Z]{2}$/.test(country.toUpperCase())) {
    return country.toUpperCase();
  }
  
  // Map common country names to codes
  const countryMap = {
    'singapore': 'SG',
    'united kingdom': 'GB',
    'uk': 'GB',
    'united states': 'US',
    'usa': 'US',
    'malaysia': 'MY',
    'indonesia': 'ID',
    'thailand': 'TH',
    'philippines': 'PH',
    'vietnam': 'VN',
    'china': 'CN',
    'japan': 'JP',
    'south korea': 'KR',
    'australia': 'AU',
    'new zealand': 'NZ',
  };
  
  return countryMap[country.toLowerCase()] || country;
};

/** Masterlist stores "-" as placeholder when splitting names in PATCH handlers. */
const stripMasterlistNamePlaceholder = (s) => {
  const t = String(s || "").trim();
  if (t === "-" || t === "—") return "";
  return t;
};

const mapMasterlistContactToJobContact = (contact) => {
  if (!contact) return null;
  const fn = stripMasterlistNamePlaceholder(contact.first_name);
  const mn = stripMasterlistNamePlaceholder(contact.middle_name);
  const ln = stripMasterlistNamePlaceholder(contact.last_name);
  const full = [fn, mn, ln].filter(Boolean).join(" ").trim();
  return {
    contactID: contact.id,
    contactFullname: full,
    firstName: fn || undefined,
    middleName: mn || undefined,
    lastName: ln || undefined,
    phoneNumber: contact.tel1 != null ? String(contact.tel1).trim() : "",
    mobilePhone: contact.tel2 != null ? String(contact.tel2).trim() : "",
    email: contact.email != null ? String(contact.email).trim() : "",
  };
};

/**
 * One-line address from customer_location, locations row, or SAP-style nested `address` object.
 * Mirrors the "Location" info block (customerLocation || job.location).
 */
const formatLocationRecordAsSingleLine = (loc) => {
  if (!loc || typeof loc !== "object") return "";
  const building = sanitizeAddressPart(loc.building);
  const block = sanitizeAddressPart(loc.block);
  const countryName = sanitizeAddressPart(loc.country_name || loc.country);
  const countryCode = getCountryCode(countryName);
  const zipCode = sanitizeAddressPart(loc.zip_code);
  const city = sanitizeAddressPart(loc.city);
  const state = sanitizeAddressPart(loc.state || loc.state_province);

  const numberedStreet = [loc.street_number, loc.street]
    .map((p) => sanitizeAddressPart(p))
    .filter(Boolean)
    .join(" ");

  let streetAddress = "";
  const rawAddr = loc.street ?? loc.address ?? loc.location_name ?? loc.locationName;
  if (typeof rawAddr === "string") {
    streetAddress = sanitizeAddressPart(rawAddr);
  } else if (rawAddr && typeof rawAddr === "object") {
    const a = rawAddr;
    const nested = [
      a.streetNo || a.street_number,
      a.streetAddress || a.street,
      a.block,
      a.buildingNo || a.building,
      a.city,
      a.stateProvince || a.state,
      a.postalCode || a.zip_code,
      a.country,
    ]
      .map((p) => sanitizeAddressPart(p))
      .filter(Boolean);
    streetAddress = nested.join(", ");
  }

  if (!streetAddress && numberedStreet) {
    streetAddress = numberedStreet;
  }

  const formattedCountry = countryCode === "SG" ? "Singapore" : (countryName || "");
  const fullAddressParts = [streetAddress, building, block, city, state, formattedCountry, zipCode].filter(Boolean);
  return fullAddressParts.join(", ");
};

/** Same strings the map can geocode: schedule row, then customer site, then job-linked location. */
const buildGeocodableAddressForJob = (normalizedJob) => {
  if (!normalizedJob || typeof normalizedJob !== "object") return "";
  if (normalizedJob.scheduleAddress && String(normalizedJob.scheduleAddress).trim()) {
    return String(normalizedJob.scheduleAddress).trim();
  }
  const fromCustomer = formatLocationRecordAsSingleLine(normalizedJob.customerLocation);
  if (fromCustomer) return fromCustomer;
  return formatLocationRecordAsSingleLine(normalizedJob.location);
};

// Add this helper function near the top with other helpers
const geocodeAddress = async (address) => {
  const q = typeof address === "string" ? address.trim() : "";
  if (!q) return null;

  if (typeof window !== "undefined" && window.google?.maps?.Geocoder) {
    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: q }, (results, status) => {
        if (
          status === window.google.maps.GeocoderStatus.OK &&
          results?.[0]?.geometry?.location
        ) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else {
          resolve(null);
        }
      });
    });
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        q
      )}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
    );
    const data = await response.json();

    if (data.status === "OK" && data.results?.[0]) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
};

const JOB_MEDIA_BUCKET = 'job_service_media';

const JobDetails = () => {
  // Move all useState declarations to the top
  const router = useRouter();
  const rawJobId = router.query?.jobId;
  const jobId = router.isReady
    ? (Array.isArray(rawJobId) ? rawJobId[0] : rawJobId)
    : undefined;
  const [job, setJob] = useState(null);
  const [jobFetchLoading, setJobFetchLoading] = useState(true);
  const [jobUuid, setJobUuid] = useState(null); // Store the actual UUID for queries
  const [sendingCompletionEmail, setSendingCompletionEmail] = useState(false);
  const [showSendCompletionEmailConfirm, setShowSendCompletionEmailConfirm] = useState(false);
  const [manualEmailTemplateSlug, setManualEmailTemplateSlug] = useState('job_completed');
  const [manualEmailSendMode, setManualEmailSendMode] = useState('template');
  const [manualEmailTriggerId, setManualEmailTriggerId] = useState('');
  const [emailTemplateOptions, setEmailTemplateOptions] = useState([]);
  const [emailEventOptions, setEmailEventOptions] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [location, setLocation] = useState(null);
  const [technicianNotes, setTechnicianNotes] = useState([]);
  const [newTechnicianNote, setNewTechnicianNote] = useState("");
  const [editingNote, setEditingNote] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [workerComments, setWorkerComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [mapKey, setMapKey] = useState(0); // Add this line
  const [isMapScriptLoaded, setIsMapScriptLoaded] = useState(false);
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    libraries: getGoogleMapsScriptLibraries(),
  });
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [currentNotesPage, setCurrentNotesPage] = useState(1);
  const [currentCommentsPage, setCurrentCommentsPage] = useState(1);
  const notesPerPage = 3;
  const commentsPerPage = 5;
  const [searchTerm, setSearchTerm] = useState("");
  const [showTagModal, setShowTagModal] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([
    "Important",
    "Follow-up",
    "Resolved",
    "Pending",
    "Question",
  ]);
  const [newTag, setNewTag] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [descriptionEditorKey, setDescriptionEditorKey] = useState(0);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [newTask, setNewTask] = useState({
    taskName: '',
    taskDescription: '',
    isPriority: false,
    assignedTo: '',
    isDone: false
  });
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [taskInputs, setTaskInputs] = useState([{
    taskName: '',
    taskDescription: '',
    isPriority: false,
    isDone: false,
    completionDate: null
  }]);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [isEditing, setIsEditing] = useState(null);
  // Add this state and useEffect to fetch follow-up types
  const [followUpTypes, setFollowUpTypes] = useState([]);
  const [jobStatuses, setJobStatuses] = useState(() => getDefaultJobStatuses());
  // Add this state at the top of your component
  const [isTechListExpanded, setIsTechListExpanded] = useState(true);
  // Add these states at the top of your component
  const [editingFollowUp, setEditingFollowUp] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [followUpToDelete, setFollowUpToDelete] = useState(null);
  const [isEquipmentListExpanded, setIsEquipmentListExpanded] = useState(true);
  const [expandedEquipments, setExpandedEquipments] = useState({});
  // Add these state variables at the top with other useState declarations
  const [jobImages, setJobImages] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [showImageModal, setShowImageModal] = useState(false);
  // Update the useEffect to include a loading state
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  // Payment Confirmation – use payment profiles from settings
  const [paymentProfiles, setPaymentProfiles] = useState([]);
  const [selectedPaymentProfileId, setSelectedPaymentProfileId] = useState(null);

  // Payment Confirmation state variables
  const [paymentDetails, setPaymentDetails] = useState({
    uen: '201019107ZDBS', // fallback until profile loads
    amount: '',
    editable: true,
    expiry: '',
    invNumber: '',
    company: 'SAS M&E PTE LTD',
  });
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [markPaidBankRef, setMarkPaidBankRef] = useState('');
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const paymentQrAutosaveRef = useRef(null);
  const paymentQrAutosaveSkipRef = useRef(true);
  const [qrCodeValue, setQrCodeValue] = useState('');
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(true);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const fileInputRef = useRef(null);
  const jobRealtimeDebounceRef = useRef(null);
  const [pendingImageFiles, setPendingImageFiles] = useState([]);
  const [imageDescriptions, setImageDescriptions] = useState({});
  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  
  // User state - must be declared before callbacks that use it
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserFullName, setCurrentUserFullName] = useState(null);
  const [currentUserActor, setCurrentUserActor] = useState(null);
  
  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const appendPendingFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    // Filter to only allow image files
    const imageFiles = files.filter(file => {
      return file.type?.startsWith("image/");
    });

    // Show error for non-image files
    const rejectedFiles = files.filter(file => !file.type?.startsWith("image/"));
    if (rejectedFiles.length > 0) {
      toast.error(`${rejectedFiles.length} file(s) rejected. Only image files (JPEG, PNG, etc.) are allowed.`);
    }

    if (!imageFiles.length) return;

    const newEntries = imageFiles.map((file, index) => {
      const key = `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`;
      return {
        key,
        file,
        preview: URL.createObjectURL(file), // All files are images now, so always create preview
      };
    });

    setPendingImageFiles((prev) => [...prev, ...newEntries]);
    setImageDescriptions((prev) => {
      const next = { ...prev };
      newEntries.forEach(({ key }) => {
        if (!(key in next)) next[key] = "";
      });
      return next;
    });
    setShowImageUploadModal(true);
  }, []);

  const resolveUploaderId = useCallback(async () => {
    if (currentUserId) return currentUserId;
    if (job?.created_by) return job.created_by;
    if (job?.createdBy?.id) return job.createdBy.id;
    const info = await getCurrentUserInfo().catch(() => null);
    return (
      info?.id ||
      info?.uid ||
      info?.workerId ||
      Cookies.get("uid") ||
      Cookies.get("workerId") ||
      null
    );
  }, [currentUserId, job]);

  useEffect(() => {
    return () => {
      pendingImageFiles.forEach((item) => {
        if (item.preview) {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
  }, [pendingImageFiles]);
  
  // PDF generation state
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [generatedPDFUrl, setGeneratedPDFUrl] = useState(null);
  
  // Chat system state
  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState("");
  const [isLoadingChat, setIsLoadingChat] = useState(true); // Start as true to show loading on initial mount
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [selectedChatImage, setSelectedChatImage] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const chatMessagesEndRef = useRef(null);
  
  // Technician locations state
  const [technicianLocations, setTechnicianLocations] = useState({});
  /** Attendance rows for this job (technician_job_id link) */
  const [jobAttendance, setJobAttendance] = useState([]);

  // Map marker click state
  const [selectedMarker, setSelectedMarker] = useState(null);

  /** customer_address_details: by address_name and by customer_location_id (FK) */
  const [addressDetailsMap, setAddressDetailsMap] = useState({});
  const [addressDetailsByLocationId, setAddressDetailsByLocationId] = useState({});

  useEffect(() => {
    if (!job?.customerCode) {
      setAddressDetailsMap({});
      setAddressDetailsByLocationId({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/customers/address-details/${encodeURIComponent(job.customerCode)}`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.success && json?.data) {
          setAddressDetailsMap(json.data);
          setAddressDetailsByLocationId(json.dataByCustomerLocationId || {});
        }
      } catch (err) {
        console.error("Error loading address details for job view:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job?.customerCode]);

  // Helper function to format date as DD/MM/YYYY
  const formatDateDDMMYYYY = (timestamp) => {
    if (!timestamp) return "N/A";
    
    // Handle string dates
    if (typeof timestamp === 'string') {
      timestamp = new Date(timestamp);
    }
    
    // Check if the date is valid
    if (!(timestamp instanceof Date) || isNaN(timestamp)) {
      return "N/A";
    }

    return timestamp.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Helper function to format date and time as DD/MM/YYYY HH:MM AM/PM
  const formatDateDDMMYYYYWithTime = (timestamp) => {
    if (!timestamp) return "N/A";
    
    // Handle string dates
    if (typeof timestamp === 'string') {
      timestamp = new Date(timestamp);
    }
    
    // Check if the date is valid
    if (!(timestamp instanceof Date) || isNaN(timestamp)) {
      return "N/A";
    }

    const dateStr = timestamp.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const timeStr = timestamp.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    return `${dateStr} - ${timeStr}`;
  };

  // Define constants
  const FOLLOW_UP_STATUSES = [
    'Logged',
    'In Progress',
    'Pending',
    'Completed',
    'Closed',
    'OPEN',
    'Cancelled'
  ];

    // Add this useEffect to fetch follow-up types
    useEffect(() => {
      const loadFollowUpTypes = async () => {
        const types = await fetchFollowUpTypes();
        setFollowUpTypes(types);
      };
  
      loadFollowUpTypes();
    }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const statuses = await fetchJobStatuses();
      if (mounted && Array.isArray(statuses) && statuses.length > 0) {
        setJobStatuses(statuses);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);
  



  useEffect(() => {
    // Retrieve email from cookies
    const emailFromCookie = Cookies.get("email");
    setUserEmail(emailFromCookie || "Unknown");
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    if (!jobId || typeof jobId !== "string") {
      setJobFetchLoading(false);
      setJob(null);
      setJobUuid(null);
      return;
    }

    let cancelled = false;
    setJobFetchLoading(true);
    setJob(null);
    setJobUuid(null);

    const fetchJob = async () => {
      try {
        setLocation(null);
        setJobAttendance([]);
        // Check if jobId is a UUID (contains hyphens and is 36 chars) or job_number
        const isUUID = jobId.includes('-') && jobId.length === 36;
        let jobData;

        if (isUUID) {
          jobData = await jobService.findById(jobId);
        } else {
          // Try to find by job_number
          jobData = await jobService.findByJobNumber(jobId);
        }

        if (cancelled) return;

        if (jobData) {
            // Store the job's UUID for use in subsequent queries
            setJobUuid(jobData.id);
            
            // Normalize job data to match component expectations
            const normalizedJob = {
              ...jobData,
              // Map job fields
              jobNo: jobData.job_number || jobData.jobNo,
              jobName: jobData.title || jobData.jobName,
              jobStatus: jobData.status || jobData.jobStatus,
              jobType: jobData.category || jobData.jobType || 'Maintenance',
              
              // Map description to jobDescription (component expects jobDescription)
              jobDescription: jobData.description || '',
              description: jobData.description || '',
              
              // Map customer data
              customerID: jobData.customer_id || jobData.customer?.id || jobData.customerID,
              customerName: jobData.customer?.customer_name || jobData.customerName,
              customerCode: jobData.customer?.customer_code || jobData.customerCode,
              customerPhone: jobData.customer?.phone_number || '',
              customerEmail: jobData.customer?.email || '',

              serviceCallNumber: jobData.service_call?.call_number ?? null,
              salesOrderNumber: jobData.sales_order?.document_number ?? null,
              
              // Map location data (embed is usually an object; guard array edge case)
              location: (() => {
                const loc = jobData.location;
                if (!loc) return {};
                if (Array.isArray(loc)) return loc[0] && typeof loc[0] === "object" ? loc[0] : {};
                return typeof loc === "object" ? loc : {};
              })(),
              
              // Extract time from scheduled dates (Asia/Singapore wall clock)
              startTime: jobData.scheduled_start
                ? formatSingaporeTimeHm(jobData.scheduled_start) || jobData.startTime
                : jobData.startTime,
              endTime: jobData.scheduled_end
                ? formatSingaporeTimeHm(jobData.scheduled_end) || jobData.endTime
                : jobData.endTime,
              startDate: jobData.scheduled_start
                ? toSingaporeYmd(jobData.scheduled_start) || jobData.startDate
                : jobData.startDate,
              endDate: jobData.scheduled_end
                ? toSingaporeYmd(jobData.scheduled_end) || jobData.endDate
                : jobData.endDate,
              
              // Map assigned workers from technician_jobs - only non-deleted, deduplicate by technician_id
              assignedWorkers: (() => {
                const technicianMap = new Map();
                (jobData.technician_jobs || [])
                  .filter((tj) => tj.deleted_at == null)
                  .forEach(tj => {
                  const techId = tj.technician_id || tj.technician?.id;
                  if (techId && !technicianMap.has(techId)) {
                    technicianMap.set(techId, {
                      workerId: techId,
                      technician_id: techId,
                      ...tj.technician,
                      ...tj
                    });
                  }
                });
                return Array.from(technicianMap.values());
              })(),
              
              // Map tasks from job_tasks (is_completed may be set by field app; task_completions refines below)
              taskList: mapJobTasksToTaskList(jobData.job_tasks),
              
              // Map equipments from job_equipments
              equipments: (jobData.job_equipments || []).map(je => {
                const eq = je.equipment || {};
                return {
                  id: eq.id || je.equipment_id,
                  itemName: eq.item_name || 'Unnamed Equipment',
                  itemCode: eq.item_code || '',
                  modelSeries: eq.model_series || '',
                  itemGroup: eq.item_group || '',
                  serialNo: eq.serial_number || '',
                  equipmentLocation: eq.equipment_location || '',
                  equipmentType: eq.equipment_type || '',
                  warrantyStartDate: eq.warranty_start_date || '',
                  warrantyEndDate: eq.warranty_end_date || '',
                  notes: eq.notes || je.notes || ''
                };
              }),
              
              // Keep original fields
              createdAt: jobData.created_at || jobData.createdAt,
              updatedAt: jobData.updated_at || jobData.updatedAt,
              scheduled_start: jobData.scheduled_start,
              scheduled_end: jobData.scheduled_end,
              
              // Payment QR code fields
              payment_qr_uen: jobData.payment_qr_uen,
              payment_qr_amount: jobData.payment_qr_amount,
              payment_qr_editable: jobData.payment_qr_editable,
              payment_qr_expiry: jobData.payment_qr_expiry,
              payment_qr_ref_number: jobData.payment_qr_ref_number,
              payment_qr_company: jobData.payment_qr_company,
              payment_qr_inv_number: jobData.payment_qr_inv_number,
              payment_qr_code_string: jobData.payment_qr_code_string,
              payment_status: jobData.payment_status || 'pending',
              sap_cm_number: jobData.sap_cm_number,
              sap_cm_status: jobData.sap_cm_status,
              sap_job_income: jobData.sap_job_income,
            };

            // Fetch job_schedule to get saved duration
            try {
              const supabase = getSupabaseClient();
              if (supabase) {
                const { data: jobSchedule } = await supabase
                  .from('job_schedule')
                  .select('*')
                  .eq('job_id', jobData.id)
                  .maybeSingle();
                
                if (jobSchedule && jobSchedule.dur && jobSchedule.dur_type === 'hours') {
                  // Parse duration from job_schedule (stored as decimal hours like "5.00")
                  const durDecimal = parseFloat(jobSchedule.dur);
                  if (!isNaN(durDecimal)) {
                    const hours = Math.floor(durDecimal);
                    const minutes = Math.round((durDecimal - hours) * 60);
                    normalizedJob.estimatedDurationHours = hours;
                    normalizedJob.estimatedDurationMinutes = minutes;
                    normalizedJob.manualDuration = true; // Mark as manually set
                  }
                }
                if (jobSchedule?.address && String(jobSchedule.address).trim()) {
                  normalizedJob.scheduleAddress = String(jobSchedule.address).trim();
                }
              }
            } catch (scheduleError) {
              console.error('Error fetching job_schedule:', scheduleError);
            }

            // Fetch customer_location first so masterlist contacts can match site (customer_location_id)
            if (normalizedJob.customerID) {
              try {
                const supabase = getSupabaseClient();
                if (supabase) {
                  let matchedCustLoc = null;
                  let customerLocations = [];

                  const { data: locRows } = await supabase
                    .from('customer_location')
                    .select('*')
                    .eq('customer_id', normalizedJob.customerID)
                    .order('site_id', { ascending: true });

                  customerLocations = locRows || [];
                  if (customerLocations.length > 0) {
                    const jobLocationId = normalizedJob.location?.id;

                    if (jobLocationId) {
                      matchedCustLoc = customerLocations.find((cl) => cl.location_id === jobLocationId);
                    }

                    if (!matchedCustLoc && normalizedJob.location?.location_name) {
                      const locName = String(normalizedJob.location.location_name).trim().toLowerCase();
                      matchedCustLoc = customerLocations.find((cl) => {
                        const sid = String(cl.site_id || '').trim().toLowerCase();
                        const bld = String(cl.building || '').trim().toLowerCase();
                        return (sid && locName.includes(sid)) || (bld && locName.includes(bld));
                      });
                    }

                    normalizedJob.customerLocation = matchedCustLoc || null;
                    normalizedJob.customerLocations = customerLocations;
                  }

                  const { data: contactsRows } = await supabase
                    .from('contacts')
                    .select('*')
                    .eq('customer_id', normalizedJob.customerID);

                  const siteContactOrder = [];
                  if (matchedCustLoc?.id) {
                    siteContactOrder.push(matchedCustLoc.id);
                  }
                  for (const cl of customerLocations) {
                    if (cl?.id && (!matchedCustLoc?.id || String(cl.id) !== String(matchedCustLoc.id))) {
                      siteContactOrder.push(cl.id);
                    }
                  }

                  let picked = null;
                  const savedContactId = jobData.contact_id || normalizedJob.contact_id;
                  if (savedContactId) {
                    if (jobData.contact && String(jobData.contact.id) === String(savedContactId)) {
                      picked = jobData.contact;
                    } else {
                      picked = (contactsRows || []).find(
                        (r) => String(r.id) === String(savedContactId),
                      );
                    }
                  }
                  if (!picked) {
                    picked = pickMasterlistContactRow(contactsRows || [], siteContactOrder);
                  }
                  if (picked) {
                    normalizedJob.contact = mapMasterlistContactToJobContact(picked);
                  }

                  if (normalizedJob.contact) {
                    if (!normalizedJob.contact.phoneNumber && normalizedJob.customerPhone) {
                      normalizedJob.contact.phoneNumber = String(normalizedJob.customerPhone).trim();
                    }
                    if (!normalizedJob.contact.email && normalizedJob.customerEmail) {
                      normalizedJob.contact.email = String(normalizedJob.customerEmail).trim();
                    }
                  } else if (normalizedJob.customerPhone || normalizedJob.customerEmail) {
                    normalizedJob.contact = {
                      contactID: 'portal-primary',
                      contactFullname: '',
                      firstName: '',
                      middleName: '',
                      lastName: '',
                      phoneNumber: normalizedJob.customerPhone ? String(normalizedJob.customerPhone).trim() : '',
                      mobilePhone: '',
                      email: normalizedJob.customerEmail ? String(normalizedJob.customerEmail).trim() : '',
                    };
                  }
                }
              } catch (contactError) {
                console.error('Error fetching contacts or location:', contactError);
              }
            }

            if (
              !normalizedJob.scheduleAddress &&
              !normalizedJob.customerLocation &&
              !(normalizedJob.location?.location_name || normalizedJob.location?.locationName) &&
              /\[AIFM:[^\]]+\]/.test(normalizedJob.description || '')
            ) {
              try {
                const resolveRes = await fetch('/api/jobs/resolve-addresses', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'same-origin',
                  body: JSON.stringify({ jobIds: [jobData.id] }),
                });
                if (resolveRes.ok) {
                  const resolveJson = await resolveRes.json();
                  const resolvedAddr = resolveJson.addresses?.[jobData.id];
                  if (resolvedAddr) {
                    normalizedJob.scheduleAddress = resolvedAddr;
                  }
                }
              } catch (resolveErr) {
                console.warn('Job address resolve from AIFM failed:', resolveErr);
              }
            }

            // Fetch follow-ups separately from followups table
            try {
              const followUps = await followUpService.getByJobId(jobData.id);
              if (followUps && followUps.length > 0) {
                // Fetch creator/status updater details from users and technicians.
                const actorUserIds = [...new Set(followUps
                  .flatMap(fu => [fu.user_id, fu.status_updated_by])
                  .filter(Boolean))];

                let userMapById = {};
                if (actorUserIds.length > 0) {
                  try {
                    const supabase = getSupabaseClient();
                    if (supabase) {
                      const { data: users } = await supabase
                        .from('users')
                        .select('id, username, role')
                        .in('id', actorUserIds)
                        .is('deleted_at', null);

                      if (users) {
                        users.forEach(user => {
                          userMapById[user.id] = user;
                        });
                      }
                    }
                  } catch (userError) {
                    console.error('Error fetching users for follow-ups:', userError);
                  }
                }

                let technicianMapByUserId = {};
                if (actorUserIds.length > 0) {
                  try {
                    const supabase = getSupabaseClient();
                    if (supabase) {
                      const { data: technicians } = await supabase
                        .from('technicians')
                        .select('user_id, full_name, email')
                        .in('user_id', actorUserIds)
                        .is('deleted_at', null);
                      
                      if (technicians) {
                        technicians.forEach(tech => {
                          technicianMapByUserId[tech.user_id] = {
                            full_name: tech.full_name,
                            email: tech.email
                          };
                        });
                      }
                    }
                  } catch (techError) {
                    console.error('Error fetching technicians for follow-ups (by user_id):', techError);
                  }
                }

                // Convert follow-ups array to object format expected by UI
                const followUpsObj = {};
                followUps.forEach(fu => {
                  const createdByUserInfo = fu.user_id ? (userMapById[fu.user_id] || fu.user) : null;
                  const createdByTechInfo = fu.user_id ? technicianMapByUserId[fu.user_id] : null;
                  const statusUpdatedByUserInfo = fu.status_updated_by ? userMapById[fu.status_updated_by] : null;
                  const statusUpdatedByTechInfo = fu.status_updated_by ? technicianMapByUserId[fu.status_updated_by] : null;
                  
                  followUpsObj[fu.id] = {
                    id: fu.id,
                    jobID: fu.job_id,
                    jobName: normalizedJob.jobName,
                    customerID: normalizedJob.customerID,
                    customerName: normalizedJob.customerName,
                    type: fu.type,
                    status: fu.status,
                    priority: fu.priority,
                    notes: fu.notes || '',
                    dueDate: fu.due_date,
                    createdAt: fu.created_at,
                    updatedAt: fu.updated_at,
                    createdBy: buildActorInfo(createdByUserInfo, createdByTechInfo),
                    updatedBy: buildActorInfo(
                      statusUpdatedByUserInfo,
                      statusUpdatedByTechInfo,
                      fu.status_updated_by_account || null
                    ),
                    statusUpdatedBy: fu.status_updated_by || null,
                    statusUpdatedByAccount: fu.status_updated_by_account || null
                  };
                });
                normalizedJob.followUps = followUpsObj;
                normalizedJob.followUpCount = followUps.length;
              } else {
                normalizedJob.followUps = {};
                normalizedJob.followUpCount = 0;
              }
            } catch (followUpError) {
              console.error('Error fetching follow-ups:', followUpError);
              normalizedJob.followUps = {};
              normalizedJob.followUpCount = 0;
            }

            // Fetch task completions (audit rows per technician_job + job_task)
            try {
              const supabase = getSupabaseClient();
              if (supabase && normalizedJob.taskList && normalizedJob.taskList.length > 0) {
                const taskIds = normalizedJob.taskList.map(t => t.taskID).filter(Boolean);
                if (taskIds.length > 0) {
                  const { data: completions } = await supabase
                    .from('task_completions')
                    .select('*')
                    .in('job_task_id', taskIds);

                  if (completions && completions.length > 0) {
                    normalizedJob.taskList = normalizedJob.taskList.map(task => {
                      const taskCompletions = completions.filter(c => c.job_task_id === task.taskID);
                      const hasCompletionRows = taskCompletions.length > 0;
                      const isCompletedFromRows = taskCompletions.some(c => c.is_completed);
                      const isDone = hasCompletionRows ? isCompletedFromRows : Boolean(task.isDone);
                      const completedRow = taskCompletions.find(c => c.is_completed);
                      return {
                        ...task,
                        isDone,
                        completionDate: isDone ? (completedRow?.completed_at || null) : null,
                        completions: taskCompletions.map(c => ({
                          technicianJobId: c.technician_job_id,
                          isCompleted: c.is_completed,
                          completedAt: c.completed_at,
                          notes: c.completion_notes
                        }))
                      };
                    });
                  }
                }
              }
            } catch (taskError) {
              console.error('Error fetching task completions:', taskError);
            }

            // Set createdBy - fetch from users and technicians tables
            if (jobData.created_by) {
              try {
                const supabase = getSupabaseClient();
                if (supabase) {
                  // Get username from users table
                  const { data: user, error: userError } = await supabase
                    .from('users')
                    .select('id, username')
                    .eq('id', jobData.created_by)
                    .is('deleted_at', null)
                    .single();
                  
                  // Get full_name from technicians table (if the user is a technician)
                  const { data: technician, error: techError } = await supabase
                    .from('technicians')
                    .select('user_id, full_name')
                    .eq('user_id', jobData.created_by)
                    .is('deleted_at', null)
                    .single();
                  
                  normalizedJob.createdBy = {
                    fullName: technician?.full_name || user?.username || 'Unknown',
                    email: technician?.email || user?.username || 'Unknown',
                    username: user?.username || 'Unknown'
                  };
                } else {
                  // Fallback if supabase not available
                  normalizedJob.createdBy = {
                    fullName: jobData.created_by_user?.username || 'Unknown',
                    email: jobData.created_by_user?.username || 'Unknown',
                    username: jobData.created_by_user?.username || 'Unknown'
                  };
                }
              } catch (error) {
                console.error('Error fetching created_by user info:', error);
                // Fallback to username from relationship if available
                normalizedJob.createdBy = {
                  fullName: jobData.created_by_user?.username || 'Unknown',
                  email: jobData.created_by_user?.username || 'Unknown',
                  username: jobData.created_by_user?.username || 'Unknown'
                };
              }
            } else {
              normalizedJob.createdBy = null;
            }

            if (cancelled) return;
            setJob(normalizedJob);
            setEditedDescription(normalizedJob.jobDescription || normalizedJob.description || '');

            // Expand all equipment cards by default
            if (normalizedJob.equipments && normalizedJob.equipments.length > 0) {
              const expandedState = {};
              normalizedJob.equipments.forEach((_, index) => {
                expandedState[index] = true;
              });
              setExpandedEquipments(expandedState);
            }

            let technicianLocationsMap = null;
            // Extract worker IDs and fetch worker details
            const assignedWorkers = normalizedJob.assignedWorkers || [];
            if (Array.isArray(assignedWorkers) && assignedWorkers.length > 0) {
              const workerIds = assignedWorkers.map(w => w.workerId || w.technician_id).filter(Boolean);
              if (workerIds.length > 0) {
                const workerData = await fetchWorkerDetails(workerIds);
                setWorkers(workerData);
                
                // Fetch technician locations from location_technicians table
                try {
                  const supabase = getSupabaseClient();
                  if (supabase) {
                    // Get technician IDs (not user IDs)
                    const technicianIds = assignedWorkers
                      .map(w => w.technician_id || w.id)
                      .filter(Boolean);
                    
                    if (technicianIds.length > 0) {
                      // Fetch latest location for each technician
                      const { data: locationData, error: locationError } = await supabase
                        .from('location_technicians')
                        .select('*')
                        .in('technician_id', technicianIds)
                        .order('tracked_at', { ascending: false });
                      
                      if (!locationError && locationData) {
                        // Group by technician_id and get the latest location for each
                        const locationsMap = {};
                        locationData.forEach(loc => {
                          const techId = loc.technician_id;
                          if (!locationsMap[techId] || new Date(loc.tracked_at) > new Date(locationsMap[techId].tracked_at)) {
                            locationsMap[techId] = loc;
                          }
                        });
                        technicianLocationsMap = locationsMap;
                        setTechnicianLocations(locationsMap);
                      }
                    }
                  }
                } catch (locationErr) {
                  console.warn('Error fetching technician locations:', locationErr);
                }
              }
            }

            // Attendance: prefer rows linked to technician_job_id; also include punches with null assignment if technician is on this job
            try {
              const supabaseAtt = getSupabaseClient();
              if (supabaseAtt && jobData?.id) {
                const activeTj = (jobData.technician_jobs || []).filter((tj) => tj.deleted_at == null);
                const tjIds = activeTj.map((tj) => tj.id).filter(Boolean);
                const techIds = [...new Set(activeTj.map((tj) => tj.technician_id).filter(Boolean))];
                if (tjIds.length > 0 || techIds.length > 0) {
                  let attQuery = supabaseAtt
                    .from("attendance")
                    .select(
                      `
                      id,
                      clock_in,
                      clock_out,
                      duration_minutes,
                      notes,
                      technician_job_id,
                      technician_id,
                      technician:technician_id(full_name)
                    `
                    )
                    .order("clock_in", { ascending: false });
                  if (tjIds.length > 0 && techIds.length > 0) {
                    attQuery = attQuery.or(
                      `technician_job_id.in.(${tjIds.join(",")}),and(technician_id.in.(${techIds.join(",")}),technician_job_id.is.null)`
                    );
                  } else if (tjIds.length > 0) {
                    attQuery = attQuery.in("technician_job_id", tjIds);
                  } else {
                    attQuery = attQuery
                      .in("technician_id", techIds)
                      .is("technician_job_id", null);
                  }
                  const { data: attRows, error: attErr } = await attQuery;
                  if (attErr) {
                    console.warn("Error fetching job attendance:", attErr);
                    setJobAttendance([]);
                  } else {
                    setJobAttendance(attRows || []);
                  }
                } else {
                  setJobAttendance([]);
                }
              } else {
                setJobAttendance([]);
              }
            } catch (attCatch) {
              console.warn("Error fetching job attendance:", attCatch);
              setJobAttendance([]);
            }

            let mapCenter = getLatLngFromLocationRecord(normalizedJob.location);
            if (!mapCenter && technicianLocationsMap && typeof technicianLocationsMap === "object") {
              for (const row of Object.values(technicianLocationsMap)) {
                mapCenter = getLatLngFromLocationRecord(row);
                if (mapCenter) break;
              }
            }
            let mapCenterFromGeocode = false;
            if (!mapCenter) {
              const query = buildGeocodableAddressForJob(normalizedJob);
              if (query) {
                try {
                  const geo = await geocodeAddress(query);
                  if (geo) {
                    mapCenter = geo;
                    mapCenterFromGeocode = true;
                  }
                } catch (geoErr) {
                  console.warn("Geocode for job map failed:", geoErr);
                }
              }
            }
            setLocation(mapCenter);
            if (mapCenter && mapCenterFromGeocode) {
              setMapKey((k) => k + 1);
            }

            // Notes and comments - you may need to fetch these separately or add to job query
            setTechnicianNotes(jobData.technicianNotes || []);
            setWorkerComments(jobData.workerComments || []);
            setImages(jobData.images || []);
            
            // Payment Confirmation: use payment profile (job's or default)
            const jobNo = jobData.job_number || jobData.jobNo || '';
            const jobEnd = jobData.scheduled_end || jobData.endDate;
            const expiryFromJob = jobEnd
              ? new Date(jobEnd).toISOString().slice(0, 10).replace(/-/g, '')
              : '';
            // Fetch payment profiles to resolve effective profile
            let profiles = [];
            try {
              const { data: profileData } = await getSupabaseClient()
                .from('payment_profiles')
                .select('*')
                .is('deleted_at', null)
                .order('sort_order', { ascending: true });
              profiles = profileData || [];
              setPaymentProfiles(profiles);
            } catch (e) {
              console.warn('Could not fetch payment profiles:', e);
            }
            const effectiveProfile = jobData.payment_profile_id && profiles.find(p => p.id === jobData.payment_profile_id)
              ? profiles.find(p => p.id === jobData.payment_profile_id)
              : profiles.find(p => p.is_default) || profiles[0];
            const uenForQr = effectiveProfile?.paynow_uen_qr || effectiveProfile?.paynow_uen || jobData.payment_qr_uen || '201019107ZDBS';
            const companyName = effectiveProfile?.pay_to || jobData.payment_qr_company || 'SAS M&E PTE LTD';
            setSelectedPaymentProfileId(effectiveProfile?.id || null);
            setPaymentStatus(jobData.payment_status || 'pending');
            paymentQrAutosaveSkipRef.current = true;
            setPaymentDetails({
              uen: uenForQr,
              company: companyName,
              invNumber: jobData.payment_qr_inv_number || jobNo,
              expiry: jobData.payment_qr_expiry || expiryFromJob,
              amount: jobData.payment_qr_amount != null ? String(jobData.payment_qr_amount) : '',
              editable: jobData.payment_qr_editable !== undefined ? jobData.payment_qr_editable : true,
            });
            if (jobData.payment_qr_code_string) {
              setQrCodeValue(jobData.payment_qr_code_string);
            }
          } else {
            setJob(null);
            setJobUuid(null);
          }
        } catch (error) {
          console.error("Error fetching job:", error);
          setJob(null);
          setJobUuid(null);
        } finally {
          if (!cancelled) {
            setJobFetchLoading(false);
          }
        }
      };

    fetchJob();
    return () => {
      cancelled = true;
    };
  }, [jobId, router.isReady]);

  const resolvePaymentQrRefNumber = useCallback((invNumber, jobNumber) => {
    const trimmed = String(invNumber || '').trim();
    if (trimmed) return trimmed;
    return String(jobNumber || '').trim();
  }, []);

  useEffect(() => {
    if (paymentQrAutosaveSkipRef.current) {
      paymentQrAutosaveSkipRef.current = false;
      return;
    }

    const jobIdForUpdate = jobUuid || job?.id;
    if (!jobIdForUpdate) return;

    if (paymentQrAutosaveRef.current) {
      clearTimeout(paymentQrAutosaveRef.current);
    }

    paymentQrAutosaveRef.current = setTimeout(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const expiryValue = paymentDetails.expiry || null;
      const amountValue = paymentDetails.amount !== '' && paymentDetails.amount != null
        ? parseInt(paymentDetails.amount, 10)
        : null;
      const invValue = String(paymentDetails.invNumber || '').trim() || null;

      const payload = {
        payment_qr_expiry: expiryValue,
        payment_qr_amount: Number.isFinite(amountValue) ? amountValue : null,
        payment_qr_inv_number: invValue || resolvePaymentQrRefNumber('', job?.job_number),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('jobs').update(payload).eq('id', jobIdForUpdate);
      if (error) {
        console.error('Error autosaving payment QR fields:', error);
        return;
      }

      setJob((prev) => (prev ? { ...prev, ...payload } : prev));
    }, 500);

    return () => {
      if (paymentQrAutosaveRef.current) {
        clearTimeout(paymentQrAutosaveRef.current);
      }
    };
  }, [
    paymentDetails.expiry,
    paymentDetails.amount,
    paymentDetails.invNumber,
    jobUuid,
    job?.id,
    job?.job_number,
    resolvePaymentQrRefNumber,
  ]);

  const handleMarkJobPaid = useCallback(async () => {
    const jobIdForUpdate = jobUuid || job?.id;
    if (!jobIdForUpdate) return;

    const amountCents = paymentDetails.amount !== '' && paymentDetails.amount != null
      ? parseInt(paymentDetails.amount, 10)
      : job?.payment_qr_amount;

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error('Enter a valid payment amount before marking as paid.');
      return;
    }

    setMarkPaidLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobIdForUpdate}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount_cents: amountCents,
          bank_reference: markPaidBankRef.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to mark job as paid');
      }

      const nextStatus = data.payment_status || 'paid';
      setPaymentStatus(nextStatus);
      setJob((prev) => (prev ? { ...prev, payment_status: nextStatus } : prev));
      setShowMarkPaidModal(false);
      setMarkPaidBankRef('');
      toast.success(nextStatus === 'partial' ? 'Partial payment recorded' : 'Job marked as paid');
    } catch (error) {
      console.error('Mark paid error:', error);
      toast.error(error?.message || 'Failed to mark job as paid');
    } finally {
      setMarkPaidLoading(false);
    }
  }, [jobUuid, job?.id, job?.payment_qr_amount, paymentDetails.amount, markPaidBankRef]);

  // If job data loaded before Google Maps script, or REST geocode failed, resolve pin when Maps is ready.
  useEffect(() => {
    if (!isLoaded || loadError || !job?.id) return;
    if (location) return;

    const fromJob = getLatLngFromLocationRecord(job.location);
    if (fromJob) {
      setLocation(fromJob);
      return;
    }

    const query = buildGeocodableAddressForJob(job);
    if (!query) return;

    let cancelled = false;
    (async () => {
      const geo = await geocodeAddress(query);
      if (!cancelled && geo) {
        setLocation(geo);
        setMapKey((k) => k + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, loadError, job, location]);

  // Debounced jobs realtime — patch header fields; avoid full nested graph refetch.
  useEffect(() => {
    if (!jobUuid) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const applyHeaderRefresh = async (payload) => {
      const newRow = payload?.new;
      if (newRow && payload.eventType === "UPDATE") {
        setJob((prevJob) => mergeJobHeaderFromRow(prevJob, newRow));
        return;
      }

      try {
        const jobData = await jobService.findHeaderById(jobUuid);
        if (jobData) {
          setJob((prevJob) => {
            if (!prevJob) return prevJob;
            return {
              ...prevJob,
              ...jobData,
              jobNo: jobData.job_number || prevJob.jobNo,
              jobName: jobData.title || prevJob.jobName,
              jobStatus: jobData.status || prevJob.jobStatus,
              jobType: jobData.category || prevJob.jobType,
              jobDescription: jobData.description ?? prevJob.jobDescription,
              description: jobData.description ?? prevJob.description,
              technician_jobs: prevJob.technician_jobs,
              job_tasks: prevJob.job_tasks,
              job_equipments: prevJob.job_equipments,
              taskList: prevJob.taskList,
            };
          });
        }
      } catch (error) {
        console.error("Error updating job header:", error);
      }
    };

    const channel = supabase
      .channel(`job-${jobUuid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${jobUuid}`
        },
        (payload) => {
          console.log('Job update received:', payload.eventType);
          if (jobRealtimeDebounceRef.current) {
            clearTimeout(jobRealtimeDebounceRef.current);
          }
          jobRealtimeDebounceRef.current = setTimeout(() => {
            applyHeaderRefresh(payload);
          }, JOB_REALTIME_DEBOUNCE_MS);
        }
      )
      .subscribe();

    return () => {
      if (jobRealtimeDebounceRef.current) {
        clearTimeout(jobRealtimeDebounceRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [jobUuid]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatMessagesEndRef.current && isChatOpen && !isChatMinimized) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen, isChatMinimized]);

  // Fetch current user info for admin messages
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const userInfo = await getCurrentUserInfo();
        const resolvedId = userInfo?.id || userInfo?.uid || userInfo?.workerId;
        if (resolvedId) {
          setCurrentUserId(resolvedId);
          
          // Fetch full_name from technicians table
          const supabase = getSupabaseClient();
          if (supabase) {
            const { data: user } = await supabase
              .from('users')
              .select('id, username, role')
              .eq('id', resolvedId)
              .is('deleted_at', null)
              .maybeSingle();

            const { data: technician, error: techError } = await supabase
              .from('technicians')
              .select('user_id, full_name, email')
              .eq('user_id', resolvedId)
              .is('deleted_at', null)
              .maybeSingle();

            const actor = buildActorInfo(user, !techError ? technician : null, userInfo?.name || userInfo?.email || null) || {
              fullName: userInfo?.name || userInfo?.email || null,
              email: userInfo?.email || null,
              username: null,
              accountLabel: userInfo?.name || userInfo?.email || null
            };

            setCurrentUserActor(actor);
            setCurrentUserFullName(actor.fullName || actor.email || null);
          }
        }
      } catch (error) {
        console.warn('Error fetching current user info:', error);
      }
    };
    
    fetchCurrentUser();
  }, []);

  const resolveStatusUpdater = useCallback(async () => {
    const userInfo = await getCurrentUserInfo().catch(() => null);
    const resolvedId =
      currentUserId ||
      userInfo?.id ||
      userInfo?.uid ||
      userInfo?.workerId ||
      null;

    if (currentUserActor) {
      return {
        statusUpdatedBy: resolvedId,
        actor: currentUserActor,
      };
    }

    let actor = null;
    const supabase = getSupabaseClient();

    if (supabase && resolvedId) {
      try {
        const { data: user } = await supabase
          .from('users')
          .select('id, username, role')
          .eq('id', resolvedId)
          .is('deleted_at', null)
          .maybeSingle();

        const { data: technician } = await supabase
          .from('technicians')
          .select('user_id, full_name, email')
          .eq('user_id', resolvedId)
          .is('deleted_at', null)
          .maybeSingle();

        actor = buildActorInfo(user, technician, userInfo?.name || userInfo?.email || null);
      } catch (error) {
        console.warn('Could not resolve follow-up status updater:', error);
      }
    }

    if (!actor) {
      actor = {
        fullName: currentUserFullName || userInfo?.name || userInfo?.email || null,
        email: userInfo?.email || null,
        username: null,
        accountLabel: userInfo?.name || userInfo?.email || null,
      };
    }

    if (actor) {
      setCurrentUserActor(actor);
    }

    return {
      statusUpdatedBy: resolvedId,
      actor,
    };
  }, [currentUserActor, currentUserFullName, currentUserId]);

  const handleSendCompletionEmail = useCallback(async () => {
    if (!jobUuid || sendingCompletionEmail) return;
    setSendingCompletionEmail(true);
    try {
      let result;
      if (manualEmailSendMode === 'event' && manualEmailTriggerId) {
        result = await emitDispatchEventEmail({
          jobId: jobUuid,
          triggerId: manualEmailTriggerId,
          force: true,
        });
      } else {
        const slug = manualEmailTemplateSlug || 'job_completed';
        result =
          slug === 'job_completed'
            ? await emitJobCompletedEmail({ jobId: jobUuid, force: true })
            : await emitSendTemplateEmail({
                jobId: jobUuid,
                templateSlug: slug,
                force: true,
              });
      }
      showJobCompletedEmailToast(toast, result, job?.contact?.email || '');
      setShowSendCompletionEmailConfirm(false);
    } finally {
      setSendingCompletionEmail(false);
    }
  }, [
    jobUuid,
    sendingCompletionEmail,
    job?.contact?.email,
    manualEmailTemplateSlug,
    manualEmailSendMode,
    manualEmailTriggerId,
  ]);

  useEffect(() => {
    if (!showSendCompletionEmailConfirm) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/email-templates', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const opts = (data.templates || [])
          .filter((t) => !t.deleted_at && t.is_active !== false)
          .map((t) => ({ slug: t.slug, name: t.name }));
        const events = (data.bindings || [])
          .filter((b) => b.enabled !== false && b.template_id)
          .map((b) => ({
            triggerId: b.trigger_id,
            label: b.label || b.trigger_id,
          }));
        if (!cancelled) {
          setEmailTemplateOptions(opts);
          setEmailEventOptions(events);
          if (events.length) {
            setManualEmailTriggerId((prev) => prev || events[0].triggerId);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showSendCompletionEmailConfirm]);

  useEffect(() => {
    const fetchData = async () => {
      const effectiveJobId = jobUuid || job?.id;
      if (!effectiveJobId) {
        setIsLoadingImages(false);
        return;
      }

      setIsLoadingImages(true);
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setIsLoadingImages(false);
          setJobImages([]);
          return;
        }

        const allMedia = await jobMediaService.getByJobId(effectiveJobId, supabase);
        const mediaRecords = (allMedia || []).filter(
          (r) => (r.media_type || 'image') !== 'pdf'
        );

        const userIds = [...new Set(mediaRecords.map((r) => r.created_by).filter(Boolean))];
        let technicianMap = {};
        if (userIds.length > 0) {
          const { data: technicians } = await supabase
            .from('technicians')
            .select('user_id, full_name')
            .in('user_id', userIds);
          if (technicians) {
            technicians.forEach((tech) => {
              technicianMap[tech.user_id] = tech.full_name;
            });
          }
        }

        const imagesData = mediaRecords.map((record) => {
          const urlParts = record.image_url?.split('/') || [];
          const filename = record.filename || urlParts[urlParts.length - 1] || `file-${record.id?.substring(0, 8) || 'img'}`;
          const createdByFullName = record.created_by
            ? (technicianMap[record.created_by] || record.created_by_user?.username || record.created_by)
            : null;
          return {
            id: record.id,
            name: filename,
            url: record.image_url,
            description: record.description || '',
            timestamp: record.created_at ? formatDateDDMMYYYYWithTime(record.created_at) : '',
            media_type: record.media_type || 'image',
            technician_job_id: record.technician_job_id,
            job_id: record.job_id,
            created_by: record.created_by,
            created_by_full_name: createdByFullName
          };
        });
        setJobImages(imagesData);
      } catch (error) {
        console.error('Error fetching images from job_media:', error);
        setJobImages([]);
      } finally {
        setIsLoadingImages(false);
      }
    };

    fetchData();
  }, [jobUuid, job?.id]);
  
  // Fetch chat messages from job_technician_admin_messages table
  useEffect(() => {
    if (!jobUuid) return;
    
    let channel = null;
    const supabase = getSupabaseClient();
    
    const fetchChatMessages = async () => {
      if (!supabase) {
        console.warn('Supabase client not available, skipping chat message fetch');
        setIsLoadingChat(false);
        return; // Don't clear messages if supabase is not available
      }
      
      // Validate jobUuid before querying
      if (!jobUuid || typeof jobUuid !== 'string') {
        console.warn('Invalid jobUuid, skipping chat message fetch:', jobUuid);
        setIsLoadingChat(false);
        return; // Don't clear messages if jobUuid is invalid
      }
      
      setIsLoadingChat(true);
      try {
          // First, try a simple query to check if messages exist (without relationships)
          // This helps us determine if the issue is with relationships or the query itself
          const { data: simpleMessages, error: simpleError } = await supabase
            .from('job_technician_admin_messages')
            .select('id, job_id, created_at')
            .eq('job_id', jobUuid)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(1);
          
          // If simple query fails, don't proceed with the full query
          if (simpleError) {
            console.error('Error checking for messages existence:', simpleError);
            console.error('Error details:', {
              message: simpleError.message,
              details: simpleError.details,
              hint: simpleError.hint,
              code: simpleError.code
            });
            toast.error(`Failed to load messages: ${simpleError.message}`);
            setIsLoadingChat(false);
            return; // Don't clear existing messages on error
          }
          
          // Now try the full query with relationships
          // If this fails, we'll fall back to the simple query
          let messages = null;
          let error = null;
          
          // Use select('*') only to avoid PostgREST embed ambiguity (technicians vs users); we enrich with separate queries
          const result = await supabase
            .from('job_technician_admin_messages')
            .select('*')
            .eq('job_id', jobUuid)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });
          
          messages = result.data;
          error = result.error;

          if (error) {
            console.error('Error fetching chat messages:', error);
            console.error('Error details:', {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code
            });
            toast.error(`Failed to load messages: ${error.message}`);
            setIsLoadingChat(false);
            return; // Don't clear existing messages on error - keep what we have
          }
          
          // Defensive check: only proceed if messages is explicitly an array
          // null or undefined means the query failed, so don't clear existing messages
          if (messages === null || messages === undefined) {
            console.warn('Messages query returned null/undefined, preserving existing messages');
            setIsLoadingChat(false);
            return; // Don't clear existing messages
          }
          
          console.log('Fetched messages (raw):', messages);
          console.log('Messages type:', Array.isArray(messages) ? 'array' : typeof messages);
          console.log('Messages length:', Array.isArray(messages) ? messages.length : 'N/A');
          
            // Always set messages, even if empty array (no messages is valid)
            // If we have messages, enrich them with names
            if (Array.isArray(messages) && messages.length > 0) {
              // Get all unique technician_job_ids
              const technicianJobIds = [...new Set(messages
                .map(msg => msg.technician_job_id)
                .filter(Boolean))];
              
              // Fetch technician_jobs with technicians
              let technicianMap = {};
              if (technicianJobIds.length > 0) {
                try {
                  const { data: technicianJobs, error: techJobError } = await supabase
                    .from('technician_jobs')
                    .select(`
                      id,
                      technician_id,
                      technician:technician_id(
                        id,
                        full_name
                      )
                    `)
                    .in('id', technicianJobIds)
                    .is('deleted_at', null);
                  
                  if (!techJobError && technicianJobs) {
                    technicianJobs.forEach(tj => {
                      if (tj.technician?.full_name) {
                        technicianMap[tj.id] = tj.technician.full_name;
                      }
                    });
                    console.log('Technician map:', technicianMap);
                  } else if (techJobError) {
                    console.error('Error fetching technician jobs:', techJobError);
                    // Continue without technician names - don't fail the whole fetch
                  }
                } catch (techError) {
                  console.error('Exception fetching technician jobs:', techError);
                  // Continue without technician names
                }
              }
              
              // Fetch admin usernames by admin_id (separate query to avoid PostgREST embed ambiguity with technicians)
              const adminIds = [...new Set(messages.map(m => m.admin_id).filter(Boolean))];
              let adminUserMap = {};
              if (adminIds.length > 0) {
                try {
                  const { data: adminUsers, error: adminErr } = await supabase
                    .from('users')
                    .select('id, username')
                    .in('id', adminIds)
                    .is('deleted_at', null);
                  if (!adminErr && adminUsers) {
                    adminUsers.forEach(u => { adminUserMap[u.id] = u; });
                  }
                } catch (e) {
                  console.warn('Error fetching admin users for messages:', e);
                }
              }
              
              // Enrich messages with technician and admin names
              const enrichedMessages = messages.map(msg => {
                const enriched = { ...msg };
                
                // For technician messages, ensure we have full_name
                if (msg.sender_type === 'TECHNICIAN' && msg.technician_job_id) {
                  if (!enriched.technician_job) {
                    enriched.technician_job = {};
                  }
                  if (!enriched.technician_job.technician) {
                    enriched.technician_job.technician = {};
                  }
                  
                  if (technicianMap[msg.technician_job_id]) {
                    enriched.technician_job.technician.full_name = technicianMap[msg.technician_job_id];
                  } else if (enriched.technician_job?.technician?.full_name) {
                    // keep existing
                  }
                }
                
                // For admin messages: use admin_id + adminUserMap (who actually chatted)
                if (msg.sender_type === 'ADMIN' && msg.job_id) {
                  if (!enriched.job) enriched.job = {};
                  if (!enriched.job.created_by_user) enriched.job.created_by_user = {};
                  const adminUser = msg.admin_id ? adminUserMap[msg.admin_id] : null;
                  if (msg.admin_id && adminUser) {
                    enriched.job.created_by_user.id = msg.admin_id;
                    enriched.job.created_by_user.full_name = adminUser.username || 'Admin';
                    enriched.job.created_by_user.username = adminUser.username;
                  } else {
                    enriched.job.created_by_user.full_name = 'Admin';
                    enriched.job.created_by_user.username = 'Admin';
                  }
                }
                
                return enriched;
              });
              
              console.log('Enriched messages:', enrichedMessages);
              setChatMessages(enrichedMessages);
            } else if (Array.isArray(messages) && messages.length === 0) {
              // Explicitly got an empty array from successful query - no messages exist
              console.log('No messages found in database for this job');
              setChatMessages([]);
            } else {
              // messages is not an array or has unexpected format
              console.warn('Unexpected messages format, preserving existing messages:', messages);
              // Don't clear existing messages if we can't parse the result
            }
        } catch (error) {
          console.error('Error fetching chat messages:', error);
          console.error('Error stack:', error.stack);
          // Don't clear existing messages on exception - keep what we have
          // This ensures messages persist even if there's a temporary error
          toast.error('Failed to refresh messages, showing cached messages');
        } finally {
          setIsLoadingChat(false);
        }
    };
    
    fetchChatMessages();
    
    // Set up real-time subscription for new messages
    if (supabase) {
      channel = supabase
        .channel(`job_messages_${jobUuid}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'job_technician_admin_messages',
            filter: `job_id=eq.${jobUuid}`
          }, 
          async (payload) => {
            if (payload.eventType === 'INSERT') {
              // Fetch the complete message with technician data and job's created_by user info
              const { data: fullMessage, error } = await supabase
                .from('job_technician_admin_messages')
                .select(`
                  *,
                  technician_job:technician_job_id(
                    technician_id,
                    technician:technician_id(
                      id,
                      full_name
                    )
                  ),
                  job:job_id(
                    id,
                    created_by
                  )
                `)
                .eq('id', payload.new.id)
                .single();
              
              if (!error && fullMessage) {
                // Enrich message with technician or admin name
                if (fullMessage.sender_type === 'TECHNICIAN' && fullMessage.technician_job_id) {
                    if (!fullMessage.technician_job?.technician?.full_name) {
                    const { data: technicianJob, error: techJobError } = await supabase
                      .from('technician_jobs')
                      .select(`
                        id,
                        technician_id,
                        technician:technician_id(
                          id,
                          full_name
                        )
                      `)
                      .eq('id', fullMessage.technician_job_id)
                      .single();
                    
                    if (!techJobError && technicianJob?.technician) {
                      if (!fullMessage.technician_job) {
                        fullMessage.technician_job = {};
                      }
                      if (!fullMessage.technician_job.technician) {
                        fullMessage.technician_job.technician = {};
                      }
                      fullMessage.technician_job.technician.full_name = technicianJob.technician.full_name;
                    }
                  }
                }
                
                // For admin messages: resolve name from admin_id (no embed)
                if (fullMessage.sender_type === 'ADMIN' && fullMessage.job_id) {
                  if (!fullMessage.job) fullMessage.job = {};
                  if (!fullMessage.job.created_by_user) fullMessage.job.created_by_user = {};
                  if (fullMessage.admin_id) {
                    fullMessage.job.created_by_user.id = fullMessage.admin_id;
                    const { data: u } = await supabase.from('users').select('id, username').eq('id', fullMessage.admin_id).is('deleted_at', null).single();
                    fullMessage.job.created_by_user.full_name = u?.username || 'Admin';
                    fullMessage.job.created_by_user.username = u?.username || 'Admin';
                  } else if (currentUserFullName) {
                    fullMessage.job.created_by_user.full_name = currentUserFullName;
                    fullMessage.job.created_by_user.username = currentUserFullName;
                    fullMessage.job.created_by_user.id = currentUserId;
                  } else {
                    fullMessage.job.created_by_user.full_name = 'Admin';
                    fullMessage.job.created_by_user.username = 'Admin';
                  }
                }
                
                // Check if message already exists to prevent duplicates
                setChatMessages(prev => {
                  const exists = prev.some(msg => msg.id === fullMessage.id);
                  if (exists) return prev;
                  return [...prev, fullMessage];
                });
              } else {
                // Fallback to payload.new if fetch fails
                setChatMessages(prev => {
                  const exists = prev.some(msg => msg.id === payload.new.id);
                  if (exists) return prev;
                  return [...prev, payload.new];
                });
              }
            } else if (payload.eventType === 'UPDATE') {
              // Fetch the complete message with technician data and job's created_by user info
              const { data: fullMessage, error } = await supabase
                .from('job_technician_admin_messages')
                .select(`
                  *,
                  technician_job:technician_job_id(
                    technician_id,
                    technician:technician_id(
                      id,
                      full_name
                    )
                  ),
                  job:job_id(
                    id,
                    created_by
                  )
                `)
                .eq('id', payload.new.id)
                .single();
              
              if (!error && fullMessage) {
                // Enrich message with technician or admin name
                if (fullMessage.sender_type === 'TECHNICIAN' && fullMessage.technician_job_id) {
                  if (!fullMessage.technician_job?.technician?.full_name) {
                    const { data: technicianJob, error: techJobError } = await supabase
                      .from('technician_jobs')
                      .select(`
                        id,
                        technician_id,
                        technician:technician_id(
                          id,
                          full_name
                        )
                      `)
                      .eq('id', fullMessage.technician_job_id)
                      .single();
                    
                    if (!techJobError && technicianJob?.technician) {
                      if (!fullMessage.technician_job) {
                        fullMessage.technician_job = {};
                      }
                      if (!fullMessage.technician_job.technician) {
                        fullMessage.technician_job.technician = {};
                      }
                      fullMessage.technician_job.technician.full_name = technicianJob.technician.full_name;
                    }
                  }
                }
                
                // For admin messages: resolve name from admin_id (no embed)
                if (fullMessage.sender_type === 'ADMIN' && fullMessage.job_id) {
                  if (!fullMessage.job) fullMessage.job = {};
                  if (!fullMessage.job.created_by_user) fullMessage.job.created_by_user = {};
                  if (fullMessage.admin_id) {
                    fullMessage.job.created_by_user.id = fullMessage.admin_id;
                    const { data: u } = await supabase.from('users').select('id, username').eq('id', fullMessage.admin_id).is('deleted_at', null).single();
                    fullMessage.job.created_by_user.full_name = u?.username || 'Admin';
                    fullMessage.job.created_by_user.username = u?.username || 'Admin';
                  } else if (currentUserFullName) {
                    fullMessage.job.created_by_user.full_name = currentUserFullName;
                    fullMessage.job.created_by_user.username = currentUserFullName;
                    fullMessage.job.created_by_user.id = currentUserId;
                  } else {
                    fullMessage.job.created_by_user.full_name = 'Admin';
                    fullMessage.job.created_by_user.username = 'Admin';
                  }
                }
                
                setChatMessages(prev => 
                  prev.map(msg => msg.id === fullMessage.id ? fullMessage : msg)
                );
              } else {
                // Fallback to payload.new if fetch fails
                setChatMessages(prev => 
                  prev.map(msg => msg.id === payload.new.id ? payload.new : msg)
                );
              }
            } else if (payload.eventType === 'DELETE') {
              setChatMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
            }
          }
        )
        .subscribe();
    }
    
    // Cleanup function - unsubscribe from channel when component unmounts or jobUuid changes
    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [jobUuid, currentUserFullName, currentUserId]);

  // Add this useEffect to fetch signatures
  useEffect(() => {
    const fetchSignatures = async () => {
      if (!jobUuid) return;

      try {
        setIsLoadingSignatures(true);
        console.log('Fetching signatures for job:', jobUuid);
        
        const supabase = getSupabaseClient();
        if (!supabase) {
          setIsLoadingSignatures(false);
          return;
        }

        // Get technician_jobs for this job first
        const { data: technicianJobs, error: tjError } = await supabase
          .from('technician_jobs')
          .select('id')
          .eq('job_id', jobUuid)
          .is('deleted_at', null);

        if (tjError) {
          console.error('Error fetching technician jobs:', tjError);
          setIsLoadingSignatures(false);
          return;
        }

        if (!technicianJobs || technicianJobs.length === 0) {
          setIsLoadingSignatures(false);
          return;
        }

        // Fetch signatures for all technician_jobs
        const technicianJobIds = technicianJobs.map(tj => tj.id);
        const { data: signaturesData, error: sigError } = await supabase
          .from('job_signatures')
          .select('*')
          .in('technician_job_id', technicianJobIds);

        if (sigError) {
          console.error('Error fetching signatures:', sigError);
        } else {
          // Transform to match expected format (array with type property)
          const signaturesArray = [];
          
          if (signaturesData && signaturesData.length > 0) {
            // Map signatures data to array format with type property
            signaturesData.forEach((sig, index) => {
              // Determine type based on signature_type field or position
              const signatureType = sig.signature_type || (index === 0 ? 'technician' : 'customer');
              
              signaturesArray.push({
                id: sig.id,
                type: signatureType,
                signatureURL: sig.signature_image_url,
                signedBy: sig.signed_by || sig.customer_name || 'Unknown',
                timestamp: sig.signed_at || sig.created_at
              });
            });
          }
          
          console.log('Fetched signatures:', signaturesArray);
          setSignatures(signaturesArray);
        }
      } catch (error) {
        console.error('Error fetching signatures:', error);
      } finally {
        setIsLoadingSignatures(false);
      }
    };

    fetchSignatures();
  }, [jobUuid]);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const addNewTaskInput = () => {
    setTaskInputs([...taskInputs, {
      taskName: '',
      taskDescription: '',
      isPriority: false,
      isDone: false,
      completionDate: null
    }]);
  };

  const removeTaskInput = (index) => {
    const newInputs = taskInputs.filter((_, i) => i !== index);
    setTaskInputs(newInputs);
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    console.log("Starting handleAddTask...");
    
    const validTasks = taskInputs.filter(task => task.taskName.trim());
    
    if (validTasks.length === 0) {
      console.log("Showing error toast");
      toast('Please enter at least one task name');
      return;
    }

    try {
      console.log("Adding tasks to Supabase...");
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      
      const tasksToInsert = validTasks.map((task, index) => ({
        job_id: jobId,
        task_name: task.taskName,
        task_description: task.taskDescription || '',
        task_order: (job.taskList?.length || 0) + index,
        is_required: task.isPriority || false
      }));

      const { data: insertedTasks, error: tasksError } = await supabase
        .from('job_tasks')
        .insert(tasksToInsert)
        .select('id, task_name, task_description, is_required, is_completed, completed_by_technician_id, created_at');

      if (tasksError) {
        console.error('Error inserting tasks:', tasksError);
        throw tasksError;
      }

      const newTasks = (insertedTasks || []).map((row) => ({
        taskID: row.id,
        taskName: row.task_name || '',
        taskDescription: row.task_description || '',
        isPriority: row.is_required || false,
        isDone: row.is_completed === true,
        completedByTechnicianId: row.completed_by_technician_id || null,
        completedByName: null,
        createdAt: row.created_at || null,
        completionDate: null,
      }));

      const updatedTasks = [...(job.taskList || []), ...newTasks];

      // Update local state immediately
      setJob(prevJob => ({
        ...prevJob,
        taskList: updatedTasks,
        updated_at: new Date().toISOString()
      }));

      // Reset form
      setTaskInputs([{
        taskName: '',
        taskDescription: '',
        isPriority: false,
        isDone: false
      }]);
      setShowNewTaskForm(false);

      const prevTaskCount = job.taskList?.length || 0;

      void clientAuditLog({
        action: 'JOB_UPDATE',
        category: 'job',
        entityType: 'job',
        entityId: jobUuid || job?.id || jobId,
        entityLabel: job?.job_number || jobId,
        description: `Added ${validTasks.length} task(s)`,
        changes: buildAuditChanges(
          { taskCount: prevTaskCount },
          {
            taskCount: prevTaskCount + validTasks.length,
            taskDescription: validTasks.map((t) => t.taskName).filter(Boolean).join(', '),
          },
        ),
      });

      console.log("Showing success toast");
      toast('Task added successfully!');

    } catch (error) {
      console.error("Error:", error);
      toast('Something went wrong');
    }
  };

  const renderJobTasks = () => {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h6 className={styles.sectionTitle}>
            <ClipboardCheck size={16} className={styles.titleIcon} />
            Job Tasks
          </h6>
          <div className="ms-auto d-flex align-items-center gap-3">
            <div className={styles.tasksMeta}>
              <Badge bg="light" text="dark" className={styles.taskCount}>
                {job.taskList?.length || 0} tasks
              </Badge>
              {job.taskList?.length > 0 && (
                <Badge bg="success" className={styles.completedCount}>
                  {job.taskList.filter(task => task.isDone).length} completed
                </Badge>
              )}
            </div>
            <Button
              variant="outline-primary"
              size="sm"
              className={styles.addTaskButton}
              onClick={() => setShowNewTaskForm(!showNewTaskForm)}
            >
              <Plus size={16} />
              {showNewTaskForm ? 'Cancel' : 'Add Task'}
            </Button>
          </div>
        </div>

        {showNewTaskForm && (
          <div className={styles.newTaskFormContainer}>
            <Form onSubmit={handleAddTask}>
              {taskInputs.map((task, index) => (
                <div key={index} className={styles.taskInputGroup}>
                  <div className={styles.taskInputHeader}>
                    <h6 className={styles.taskInputTitle}>Task {index + 1}</h6>
                    {index > 0 && (
                      <Button 
                        variant="link"
                        className={styles.removeTaskButton}
                        onClick={() => removeTaskInput(index)}
                      >
                        <X size={16} />
                      </Button>
                    )}
                  </div>
                  <Row className="g-3">
                    <Col xs={12}>
                      <Form.Control
                        as="textarea"
                        rows={4}
                        className={styles.taskNameInput}
                        placeholder="Enter task details (complaint, findings, work performed…)"
                        value={task.taskName}
                        onChange={(e) => {
                          const newInputs = [...taskInputs];
                          newInputs[index].taskName = e.target.value;
                          setTaskInputs(newInputs);
                        }}
                      />
                    </Col>
                    {/* <Col xs={12}>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        placeholder="Task description (optional)"
                        value={task.taskDescription}
                        onChange={(e) => {
                          const newInputs = [...taskInputs];
                          newInputs[index].taskDescription = e.target.value;
                          setTaskInputs(newInputs);
                        }}
                      />
                    </Col> */}
                    <Col xs={12}>
                      <Form.Check
                        type="checkbox"
                        label="Priority Task"
                        checked={task.isPriority}
                        onChange={(e) => {
                          const newInputs = [...taskInputs];
                          newInputs[index].isPriority = e.target.checked;
                          setTaskInputs(newInputs);
                        }}
                      />
                    </Col>
                  </Row>
                </div>
              ))}
              <div className={styles.taskFormActions}>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={addNewTaskInput}
                  className={styles.addAnotherButton}
                >
                  <Plus size={16} /> Add Another Task
                </Button>
                <Button type="submit" variant="primary">
                  Save Tasks
                </Button>
              </div>
            </Form>
          </div>
        )}

        <div className={styles.taskListContainer}>
          {(!job.taskList || job.taskList.length === 0) ? (
            <div className={styles.emptyTasks}>
              <ClipboardCheck size={24} />
              <p>No tasks added yet</p>
              <Button 
                variant="outline-primary" 
                size="sm"
                onClick={() => setShowNewTaskForm(true)}
              >
                Add Your First Task
              </Button>
            </div>
          ) : (
            <div className={styles.taskList}>
              {job.taskList.map((task) => (
                <div 
                  key={task.taskID} 
                  className={`${styles.taskItem} ${task.isDone ? styles.taskCompleted : ''}`}
                >
                  <div className={styles.taskContent}>
                    <div className={styles.checkboxWrapper}>
                      <Form.Check
                        type="checkbox"
                        checked={task.isDone}
                        onChange={() => handleToggleTaskComplete(task.taskID)}
                        id={`task-${task.taskID}`}
                        className={styles.taskCheckbox}
                      />
                      {task.isDone && (
                        <div className={styles.completedIndicator}>
                          <Check size={12} />
                        </div>
                      )}
                    </div>
                    <div className={styles.taskDetails}>
                      <div className={styles.taskHeader}>
                        <label 
                          htmlFor={`task-${task.taskID}`}
                          className={styles.taskName}
                        >
                          {task.taskName}
                        </label>
                        {task.isPriority && (
                          <Badge bg="danger" className={styles.priorityBadge}>
                            Priority
                          </Badge>
                        )}
                      </div>
                      <div className={styles.taskMeta}>
                        {task.completionDate && (
                          <div className={styles.completionInfo}>
                            <Badge bg="success" className={styles.completedBadge}>
                              <Check size={10} /> Completed
                            </Badge>
                            <span className={styles.completionDate}>
                              <Clock size={12} />
                              Completed: {formatDateTime(task.completionDate)}
                            </span>
                          </div>
                        )}
                        {task.isDone &&
                          (task.completedByName || task.completedByTechnicianId) && (
                            <span className={styles.completionDate} style={{ display: "block" }}>
                              Completed by:{" "}
                              <strong>
                                {task.completedByName ||
                                  (task.completedByTechnicianId
                                    ? `Technician (${String(task.completedByTechnicianId).slice(0, 8)}…)`
                                    : "")}
                              </strong>
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="link"
                    className={styles.deleteTaskButton}
                    onClick={() => handleDeleteTask(task.taskID, task.taskName)}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  };

  const toggleEquipment = (index) => {
    setExpandedEquipments(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const renderAssignedEquipments = () => {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h6 className={styles.sectionTitle}>
            <FaTools size={16} className={styles.titleIcon} />
            Assigned Equipments
          </h6>
          <div className="ms-auto">
            <span className={styles.equipmentCount}>
              {job.equipments?.length || 0} items
            </span>
          </div>
        </div>
        
        <div className={styles.equipmentList}>
          {job.equipments?.map((equipment, index) => (
            <div key={index} className={styles.equipmentCard}>
              <div 
                className={styles.equipmentHeader}
                onClick={() => toggleEquipment(index)}
              >
                <div className={styles.equipmentTitle}>
                  <h3 className={styles.equipmentName}>{equipment.itemName || 'Unnamed Equipment'}</h3>
                  {equipment.equipmentType && (
                    <Badge className={`${styles.typeBadge} ${styles[equipment.equipmentType.toLowerCase()]}`}>
                      {equipment.equipmentType}
                    </Badge>
                  )}
                </div>
                <button className={styles.collapseButton}>
                  {expandedEquipments[index] ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
              </div>
              
              <div className={`${styles.equipmentDetails} ${expandedEquipments[index] ? styles.expanded : styles.collapsed}`}>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <FaHashtag size={14} className={styles.detailIcon} />
                    <span className={styles.detailLabel}>Model:</span>
                    <span className={styles.detailValue}>{equipment.modelSeries || 'N/A'}</span>
                  </div>
                  
                  <div className={styles.detailItem}>
                    <FaBarcode size={14} className={styles.detailIcon} />
                    <span className={styles.detailLabel}>Item Code:</span>
                    <span className={styles.detailValue}>{equipment.itemCode || 'N/A'}</span>
                  </div>
                  
                  <div className={styles.detailItem}>
                    <FaLayerGroup size={14} className={styles.detailIcon} />
                    <span className={styles.detailLabel}>Group:</span>
                    <span className={styles.detailValue}>{equipment.itemGroup || 'N/A'}</span>
                  </div>
                  
                  <div className={styles.detailItem}>
                    <FaQrcode size={14} className={styles.detailIcon} />
                    <span className={styles.detailLabel}>Serial No:</span>
                    <span className={styles.detailValue}>{equipment.serialNo || 'N/A'}</span>
                  </div>

                  <div className={styles.detailItem}>
                    <FaMapMarkerAlt size={14} className={styles.detailIcon} />
                    <span className={styles.detailLabel}>Location:</span>
                    <span className={styles.detailValue}>{equipment.equipmentLocation || 'N/A'}</span>
                  </div>
                </div>

                {(equipment.warrantyStartDate || equipment.warrantyEndDate || equipment.notes) && (
                  <div className={styles.equipmentFooter}>
                    {(equipment.warrantyStartDate || equipment.warrantyEndDate) && (
                      <div className={styles.warrantyDates}>
                        <small>
                          <FaCalendarCheck size={12} />
                          Warranty Start: {equipment.warrantyStartDate || 'N/A'}
                        </small>
                        <small>
                          <FaCalendarTimes size={12} />
                          Warranty End: {equipment.warrantyEndDate || 'N/A'}
                        </small>
                      </div>
                    )}
                    {equipment.notes && (
                      <div className={styles.equipmentNotes}>
                        <FaStickyNote size={12} />
                        <span>{equipment.notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      const comment = {
        text: newComment,
        timestamp: new Date().toISOString(),
        worker: "Current Worker Name", // Replace with actual worker name
      };
      setWorkerComments([...workerComments, comment]);
      setNewComment("");
      // Here you would also update this in your database
    }
  };

  const handleAddTechnicianNote = async (e) => {
    e.preventDefault();
    if (newTechnicianNote.trim() === "") {
      toast.error("Please enter a note before adding.");
      return;
    }

    try {
      // TODO: Implement technician notes storage in Supabase
      // For now, storing in local state only
      // You may need to create a technician_notes table or use a JSONB field in jobs table
      const newNote = {
        id: `note-${Date.now()}`,
        content: newTechnicianNote,
        createdAt: new Date().toISOString(),
        userEmail: userEmail,
        updatedAt: new Date().toISOString(),
        tags: selectedTags,
      };

      setTechnicianNotes([...technicianNotes, newNote]);
      setNewTechnicianNote("");
      setSelectedTags([]);
      toast.success("Note added successfully!");
      
      // TODO: Save to Supabase when table is created
      // const supabase = getSupabaseClient();
      // await supabase.from('technician_notes').insert({...});
    } catch (error) {
      console.error("Error adding note:", error);
      toast.error("Error adding note. Please try again.");
    }
  };

  const handleDeleteTechnicianNote = async (noteId) => {
    try {
      // TODO: Implement technician notes deletion in Supabase
      // For now, removing from local state only
      setTechnicianNotes(technicianNotes.filter(note => note.id !== noteId));
      toast.success("Note deleted successfully!");
      
      // TODO: Delete from Supabase when table is created
      // const supabase = getSupabaseClient();
      // await supabase.from('technician_notes').delete().eq('id', noteId);
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Error deleting note. Please try again.");
    }
  };

  const handleEditTechnicianNote = async (updatedNote) => {
    if (updatedNote.content.trim() === "") {
      toast.error("Note content cannot be empty.");
      return;
    }

    try {
      // TODO: Implement technician notes update in Supabase
      // For now, updating local state only
      setTechnicianNotes(technicianNotes.map(note => 
        note.id === updatedNote.id 
          ? { ...note, content: updatedNote.content, tags: updatedNote.tags, updatedAt: new Date().toISOString() }
          : note
      ));
      setEditingNote(null);
      toast.success("Note updated successfully!");
      
      // TODO: Update in Supabase when table is created
      // const supabase = getSupabaseClient();
      // await supabase.from('technician_notes').update({...}).eq('id', updatedNote.id);
    } catch (error) {
      console.error("Error updating note:", error);
      toast.error("Error updating note. Please try again.");
    }
  };

  const handleTagSelection = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddNewTag = () => {
    if (newTag.trim() !== "" && !availableTags.includes(newTag.trim())) {
      const trimmedTag = newTag.trim();
      setAvailableTags((prev) => [...prev, trimmedTag]);
      setSelectedTags((prev) => [...prev, trimmedTag]);
      setNewTag("");
      toast.success(`New tag "${trimmedTag}" added successfully!`);
    }
  };

  const handleRemoveNewTag = (tagToRemove) => {
    setSelectedTags((prev) => prev.filter((tag) => tag !== tagToRemove));
    setAvailableTags((prev) => prev.filter((tag) => tag !== tagToRemove));
    toast.success(`Tag "${tagToRemove}" removed successfully!`);
  };

  const renderNotesAndComments = () => {
    if (showAllNotes) {
      return (
        <AllTechnicianNotesTable
          notes={technicianNotes}
          onClose={() => setShowAllNotes(false)}
          id={id}
        />
      );
    }

    // Filter notes based on search term
    const filteredNotes = technicianNotes.filter(
      (note) =>
        note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate pagination for notes
    const indexOfLastNote = currentNotesPage * notesPerPage;
    const indexOfFirstNote = indexOfLastNote - notesPerPage;
    const currentNotes = filteredNotes.slice(indexOfFirstNote, indexOfLastNote);
    const totalNotePages = Math.ceil(filteredNotes.length / notesPerPage);

    // Calculate pagination for comments
    const indexOfLastComment = currentCommentsPage * commentsPerPage;
    const indexOfFirstComment = indexOfLastComment - commentsPerPage;
    const currentComments = workerComments.slice(
      indexOfFirstComment,
      indexOfLastComment
    );
    const totalCommentPages = Math.ceil(
      workerComments.length / commentsPerPage
    );

    return (
      <>
        <h4 className="mb-3">Technician Notes</h4>

        <Card className="shadow-sm mb-4">
          <Card.Header className="bg-light">
            <h5 className="mb-0">Add Note</h5>
          </Card.Header>
          <Card.Body>
            <Form onSubmit={handleAddTechnicianNote}>
              <Form.Group className="mb-3">
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={newTechnicianNote}
                  onChange={(e) => setNewTechnicianNote(e.target.value)}
                  placeholder="Enter technician notes here..."
                />
              </Form.Group>
              <Button
                variant="outline-secondary"
                onClick={() => setShowTagModal(true)}
                className="mb-2 w-100"
              >
                <Tags /> Add Tags
              </Button>
              {selectedTags.length > 0 && (
                <div className="mb-2">
                  {selectedTags.map((tag, index) => (
                    <Badge key={index} bg="secondary" className="me-1">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              <Button variant="primary" type="submit" className="w-100">
                <Plus className="me-1" /> Add Note
              </Button>
            </Form>
          </Card.Body>
        </Card>

        <ListGroup variant="flush">
          <InputGroup className="mb-3">
            <InputGroup.Text>
              <Search />
            </InputGroup.Text>
            <Form.Control
              type="text"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </InputGroup>
          {currentNotes.map((note) => (
            <ListGroup.Item key={note.jobId} className="border-bottom py-3">
              <Row>
                {/* Left side: Note content, tags, and email */}
                <Col xs={9}>
                  {editingNote && editingNote.jobId === note.jobId ? (
                    <>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={editingNote.content}
                        onChange={(e) =>
                          setEditingNote({
                            ...editingNote,
                            content: e.target.value,
                          })
                        }
                      />
                      <Button
                        variant="outline-secondary"
                        onClick={() => setShowTagModal(true)}
                        className="mt-2"
                      >
                        <Tags /> Edit Tags
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="mb-1">{note.content}</p>
                      {note.tags && note.tags.length > 0 && (
                        <div className="mb-2">
                          {note.tags.map((tag, index) => (
                            <Badge key={index} bg="secondary" className="me-1">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <small className="text-muted d-block mt-2">
                        By: {note.userEmail}
                      </small>
                    </>
                  )}
                </Col>

                {/* Right side: Date and action buttons */}
                <Col xs={3} className="text-end">
                  <div className="mb-2">
                    <small className="text-muted d-block">
                      {note.createdAt.toLocaleString() || "Date not available"}
                    </small>
                  </div>

                  {editingNote && editingNote.id === note.id ? (
                    <div>
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleEditTechnicianNote(editingNote)}
                        className="me-1 mb-1"
                      >
                        Save
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingNote(null)}
                        className="mb-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => setEditingNote(note)}
                        className="me-1 mb-1"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => handleDeleteTechnicianNote(note.id)}
                        className="mb-1"
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </Col>
              </Row>
            </ListGroup.Item>
          ))}
        </ListGroup>

        {totalNotePages > 1 && (
          <Row className="mt-3">
            <Col>
              <Pagination className="justify-content-center">
                <Pagination.First
                  onClick={() => setCurrentNotesPage(1)}
                  disabled={currentNotesPage === 1}
                />
                <Pagination.Prev
                  onClick={() =>
                    setCurrentNotesPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentNotesPage === 1}
                />
                {[...Array(totalNotePages).keys()].map((number) => (
                  <Pagination.Item
                    key={number + 1}
                    active={number + 1 === currentNotesPage}
                    onClick={() => setCurrentNotesPage(number + 1)}
                  >
                    {number + 1}
                  </Pagination.Item>
                ))}
                <Pagination.Next
                  onClick={() =>
                    setCurrentNotesPage((prev) =>
                      Math.min(prev + 1, totalNotePages)
                    )
                  }
                  disabled={currentNotesPage === totalNotePages}
                />
                <Pagination.Last
                  onClick={() => setCurrentNotesPage(totalNotePages)}
                  disabled={currentNotesPage === totalNotePages}
                />
              </Pagination>
            </Col>
          </Row>
        )}

        {technicianNotes.length > notesPerPage && (
          <Button
            variant="primary"
            onClick={() => setShowAllNotes(true)}
            className="w-100 mt-3"
          >
            View All Technician Notes
          </Button>
        )}
      </>
    );
  };
  const renderSignatures = () => {
    const techSignature = signatures.find(sig => sig.type === 'technician');
    const customerSignature = signatures.find(sig => sig.type === 'customer');
  
    return (
      <div className={styles.signaturesSection}>
        <div className={styles.signatureGrid}>
          <div className={styles.signatureBox}>
            <p>Customer Signature:</p>
            {techSignature ? (
              <img src={techSignature.signatureURL} alt="Technician Signature" />
            ) : (
              <div className={styles.notSigned}>Not signed</div>
            )}
          </div>
          {/* <div className={styles.signatureBox}>
            <p>Customer Signature:</p>
            {customerSignature ? (
              <img src={customerSignature.signatureURL} alt="Customer Signature" />
            ) : (
              <div className={styles.notSigned}>Not signed</div>
            )}
          </div> */}
        </div>
      </div>
    );
  };

  // Function to send chat message — always via API so admin_id is set server-side for ADMIN
  const handleSendChatMessage = async () => {
    if (!newChatMessage.trim() || !jobId || isSendingMessage) return;
    
    setIsSendingMessage(true);
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      toast.error('Unable to connect to database');
      setIsSendingMessage(false);
      return;
    }
    
    try {
      const userRole = Cookies.get('role') || 'ADMIN';
      const senderType = userRole === 'TECHNICIAN' ? 'TECHNICIAN' : 'ADMIN';
      const technicianJobId = job?.assignedWorkers?.[0]?.technician_job_id ||
                              job?.assignedWorkers?.[0]?.id || null;
      const messageText = newChatMessage.trim();
      if (!messageText) {
        toast.error('Please enter a message');
        setIsSendingMessage(false);
        return;
      }

      const jobIdForApi = jobUuid || jobId;
      if (!jobIdForApi) {
        toast.error('Job not loaded yet');
        setIsSendingMessage(false);
        return;
      }

      let data = null;
      let error = null;
      const response = await fetch(`/api/jobs/${jobIdForApi}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          technician_job_id: technicianJobId,
          sender_type: senderType
        })
      });
      const result = await response.json();
      if (!response.ok) {
        error = { message: result.message || 'Failed to send message' };
      } else if (result.success && result.data) {
        data = result.data;
      } else {
        error = { message: result.message || 'No data returned' };
      }

      if (error) {
        console.error('Error sending message:', error);
        toast.error(`Failed to send message: ${error.message}`);
      } else {
        console.log('Message sent successfully:', data);
        setNewChatMessage('');
        // Add message to local state immediately, but check for duplicates
        if (data) {
          // Enrich message with technician or admin name
          let messageWithName = { ...data };
          
          // If this is a technician message, fetch technician name
          if (data.technician_job_id && data.sender_type === 'TECHNICIAN') {
            try {
              const { data: technicianJob, error: techJobError } = await supabase
                .from('technician_jobs')
                .select(`
                  id,
                  technician_id,
                  technician:technician_id(
                    id,
                    full_name
                  )
                `)
                .eq('id', data.technician_job_id)
                .single();
              
              if (!techJobError && technicianJob?.technician) {
                messageWithName.technician_job = {
                  technician_id: technicianJob.technician_id,
                  technician: {
                    id: technicianJob.technician.id,
                    full_name: technicianJob.technician.full_name
                  }
                };
              }
            } catch (techError) {
              console.warn('Error fetching technician name for new message:', techError);
            }
          }
          
          // If this is an admin message, use current logged-in user's name
          if (data.sender_type === 'ADMIN' && data.job_id) {
            // Use current user's full name (we just sent this message, so it's from us)
            if (currentUserFullName) {
              messageWithName.job = {
                created_by_user: {
                  id: currentUserId,
                  admin_id: currentUserId,
                  username: currentUserFullName,
                  full_name: currentUserFullName
                }
              };
            } else {
              messageWithName.job = {
                created_by_user: {
                  id: data.admin_id || null,
                  admin_id: data.admin_id || null,
                  username: 'Admin',
                  full_name: 'Admin'
                }
              };
            }
          }
          
          setChatMessages(prev => {
            // Check if message already exists to prevent duplicates
            const exists = prev.some(msg => msg.id === messageWithName.id);
            if (exists) return prev;
            return [...prev, messageWithName];
          });
        }
        toast.success('Message sent!');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Render floating chat button (only show when chat is closed)
  const renderFloatingChatButton = () => {
    if (isChatOpen) return null;
    
    return (
      <button
        className={styles.floatingChatButton}
        onClick={() => {
          setIsChatOpen(true);
          setIsChatMinimized(false);
        }}
        title="Open Job Messages"
      >
        <img src="/chat.png" alt="Chat" className={styles.floatingChatButtonIcon} />
        {chatMessages.length > 0 && (
          <span className={styles.chatBadge}>{chatMessages.length}</span>
        )}
      </button>
    );
  };

  // Render chat popup window
  const renderChatPopup = () => {
    if (!isChatOpen) return null;

    return (
      <div className={`${styles.chatPopup} ${isChatMinimized ? styles.chatMinimized : ''}`}>
        <div className={styles.chatPopupHeader}>
          <div className={styles.chatPopupTitle}>
            <span>Job Messages</span>
            {chatMessages.length > 0 && (
              <span className={styles.chatCountBadge}>{chatMessages.length}</span>
            )}
          </div>
          <div className={styles.chatPopupActions}>
            <button
              className={styles.chatPopupButton}
              onClick={() => setIsChatMinimized(!isChatMinimized)}
              title={isChatMinimized ? "Maximize" : "Minimize"}
              type="button"
              aria-label={isChatMinimized ? "Maximize" : "Minimize"}
            >
              {isChatMinimized ? (
                <ChevronUp size={18} className={styles.chatPopupButtonIcon} />
              ) : (
                <ChevronDown size={18} className={styles.chatPopupButtonIcon} />
              )}
            </button>
            <button
              className={styles.chatPopupButton}
              onClick={() => setIsChatOpen(false)}
              title="Close"
              type="button"
              aria-label="Close"
            >
              <X size={18} className={styles.chatPopupButtonIcon} />
            </button>
          </div>
        </div>
        
        {!isChatMinimized && (
          <>
            <div className={styles.chatMessagesContainer}>
              {isLoadingChat ? (
                <div className={styles.chatLoading}>Loading messages...</div>
              ) : chatMessages.length === 0 ? (
                <div className={styles.chatEmpty}>No messages yet. Start the conversation!</div>
              ) : (
                <div className={styles.chatMessages}>
                  {chatMessages.map((message) => {
                    const isAdmin = message.sender_type === 'ADMIN';
                    const isCurrentUser = (Cookies.get('role') || 'ADMIN') === message.sender_type;
                    
                    return (
                      <div 
                        key={message.id} 
                        className={`${styles.chatMessage} ${isCurrentUser ? styles.chatMessageOwn : ''}`}
                      >
                        <div className={styles.chatMessageHeader}>
                          <span className={styles.chatSender}>
                            {isAdmin 
                              ? (message.job?.created_by_user?.full_name || message.job?.created_by_user?.username || 'Admin')
                              : (message.technician_job?.technician?.full_name || 'Technician')}
                          </span>
                          <span className={styles.chatTime}>
                            {message.created_at 
                              ? format(new Date(message.created_at), 'MMM dd, HH:mm')
                              : ''}
                          </span>
                        </div>
                        <div className={styles.chatMessageBody}>
                          {/* Display image if image_url exists */}
                          {message.image_url && (
                            <div 
                              className={styles.chatImageContainer}
                              onClick={() => setSelectedChatImage(message.image_url)}
                            >
                              <img 
                                src={message.image_url} 
                                alt="Chat image" 
                                className={styles.chatImage}
                                onError={(e) => {
                                  console.error('Error loading chat image:', message.image_url);
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          {/* Display text message if it exists */}
                          {(message.message || message.message_text || message.content || message.text || message.msg) && (
                            <div className={styles.chatTextContent}>
                              {message.message || message.message_text || message.content || message.text || message.msg}
                            </div>
                          )}
                          {/* Show placeholder if neither image nor text exists */}
                          {!message.image_url && !(message.message || message.message_text || message.content || message.text || message.msg) && (
                            <div className={styles.chatTextContent}>No message content</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatMessagesEndRef} />
                </div>
              )}
            </div>
            
            <div className={styles.chatInputContainer}>
              <Form.Control
                as="textarea"
                rows={2}
                placeholder="Type your message..."
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChatMessage();
                  }
                }}
                className={styles.chatInput}
                disabled={isSendingMessage}
              />
              <Button
                variant="primary"
                onClick={handleSendChatMessage}
                disabled={!newChatMessage.trim() || isSendingMessage}
                className={styles.chatSendButton}
              >
                {isSendingMessage ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Envelope size={14} className="me-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </>
        )}
        
        {/* Image Modal for Chat Images */}
        <Modal 
          show={selectedChatImage !== null} 
          onHide={() => setSelectedChatImage(null)}
          size="lg"
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Chat Image</Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center">
            {selectedChatImage && (
              <img 
                src={selectedChatImage} 
                alt="Chat image" 
                style={{ 
                  maxWidth: '100%', 
                  height: 'auto',
                  borderRadius: '8px'
                }}
                onError={(e) => {
                  console.error('Error loading chat image in modal:', selectedChatImage);
                  e.target.style.display = 'none';
                }}
              />
            )}
          </Modal.Body>
        </Modal>
      </div>
    );
  };

  const handleTriggerImageUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const resetPendingUploads = () => {
    setPendingImageFiles([]);
    setImageDescriptions({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleJobImageUpload = (event) => {
    const fileList = event.target?.files;
    if (fileList?.length) {
      const files = Array.from(fileList);
      if (fileInputRef.current) fileInputRef.current.value = "";
      appendPendingFiles(files);
    }
  };

  const handleDescriptionChange = (key, value) => {
    setImageDescriptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCancelImageUpload = () => {
    setShowImageUploadModal(false);
    resetPendingUploads();
  };

  const handleRemovePendingFile = (key) => {
    setPendingImageFiles((prev) => {
      const target = prev.find((item) => item.key === key);
      if (target?.preview) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((item) => item.key !== key);
    });
    setImageDescriptions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleDropzoneDragOver = (event) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDropzoneDragLeave = (event) => {
    event.preventDefault();
    setIsDragActive(false);
  };

  const handleDropzoneDrop = (event) => {
    event.preventDefault();
    setIsDragActive(false);
    appendPendingFiles(event.dataTransfer.files);
  };

  const handleBrowseMoreFiles = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleConfirmImageUpload = async () => {
    if (!pendingImageFiles.length) return;

    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Supabase client not available");
      return;
    }

    const createdByUserId = await resolveUploaderId();

    if (!createdByUserId) {
      toast.error("Unable to determine current user for upload.");
      return;
    }

    setIsUploadingImages(true);
    try {
      const uploadedRecords = [];

      for (const item of pendingImageFiles) {
        const { file, key } = item;
        const description = imageDescriptions[key]?.trim() || "";
        const safeFileName = file.name.replace(/\s+/g, "_");
        const storagePath = `${jobId}/${Date.now()}-${safeFileName}`;
        const uploadResult = await uploadFile(JOB_MEDIA_BUCKET, storagePath, file, { upsert: false });
        // Omit media_type so the database uses its DEFAULT (avoids job_media_media_type_check / enum casing issues)
        const insertData = {
          job_id: jobId,
          image_url: uploadResult.url,
          filename: file.name,
          description: description || null,
          created_by: createdByUserId,
        };

        let { data: mediaRecord, error: mediaError } = await supabase
          .from("job_media")
          .insert(insertData)
          .select()
          .single();

        if (mediaError) {
          // If the description column hasn't been migrated yet, retry without it
          const missingDescriptionCol = mediaError.code === 'PGRST204' ||
            (mediaError.message && mediaError.message.toLowerCase().includes('description'));
          if (missingDescriptionCol) {
            console.warn('job_media.description column missing – run add_description_to_job_media.sql. Retrying without description.');
            const { description: _omit, ...insertWithoutDesc } = insertData;
            const retry = await supabase
              .from("job_media")
              .insert(insertWithoutDesc)
              .select()
              .single();
            mediaRecord = retry.data;
            mediaError = retry.error;
          }
        }

        if (mediaError) {
          console.error("Error inserting media record:", mediaError);
          if (mediaError.code === '23514') {
            toast.error("Database rejected the media type. Run the job_media migration (fix_job_media_media_type_constraint.sql) or contact support.");
            throw new Error(`Database constraint violation: ${mediaError.message}`);
          }
          throw mediaError;
        }

        uploadedRecords.push({
          id: mediaRecord.id,
          url: uploadResult.url,
          name: mediaRecord.filename || file.name,
          description: mediaRecord.description ?? description,
          timestamp: mediaRecord.created_at
            ? formatDateDDMMYYYYWithTime(mediaRecord.created_at)
            : new Date().toLocaleString(),
          uploadedBy: currentUserFullName || "You",
          media_type: mediaRecord?.media_type ?? "image",
          created_by: createdByUserId,
        });
      }

      const prevMediaCount = jobImages.length;

      setJobImages((prev) => [...uploadedRecords, ...prev]);
      void clientAuditLog({
        action: 'JOB_MEDIA_UPLOAD',
        category: 'job',
        entityType: 'job',
        entityId: jobUuid || job?.id || jobId,
        entityLabel: job?.job_number || jobId,
        description: `Uploaded ${uploadedRecords.length} media file(s)`,
        changes: buildAuditChanges(
          { mediaCount: prevMediaCount },
          {
            mediaCount: prevMediaCount + uploadedRecords.length,
            mediaFile: uploadedRecords.map((r) => r.name).join(', '),
          },
        ),
      });
      toast.success(
        `${uploadedRecords.length} file${uploadedRecords.length > 1 ? "s" : ""} uploaded`
      );
      setShowImageUploadModal(false);
      resetPendingUploads();
    } catch (error) {
      console.error("Error uploading job images:", error);
      toast.error("Failed to upload images");
    } finally {
      setIsUploadingImages(false);
    }
  };

  // Helper function to extract storage path from Supabase storage URL
  const extractStoragePath = (url) => {
    try {
      // Supabase storage URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const bucketIndex = pathParts.indexOf('public');
      if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
        // Return everything after the bucket name
        return pathParts.slice(bucketIndex + 2).join('/');
      }
      // Fallback: try to extract from the full path
      const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
      return match ? match[1] : null;
    } catch (error) {
      console.error('Error extracting storage path:', error);
      return null;
    }
  };

  const handleDeleteImage = async (image) => {
    // Show confirmation dialog
    const result = await Swal.fire({
      title: 'Delete Image?',
      text: `Are you sure you want to delete "${image.name || image.description || 'this image'}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        toast.error("Supabase client not available");
        return;
      }

      // Extract storage path from URL
      const storagePath = extractStoragePath(image.url);
      
      // Delete from storage if path is available
      if (storagePath) {
        try {
          await deleteFile(JOB_MEDIA_BUCKET, storagePath);
        } catch (storageError) {
          console.warn('Error deleting file from storage (continuing with DB delete):', storageError);
          // Continue with database deletion even if storage deletion fails
        }
      }

      // Delete from database
      await jobMediaService.delete(image.id);

      // Update local state - remove the deleted image immediately
      setJobImages((prev) => prev.filter((img) => img.id !== image.id));

      // Close modal if the deleted image was selected
      if (selectedImage && selectedImage.id === image.id) {
        setShowImageModal(false);
        setSelectedImage(null);
      }

      void clientAuditLog({
        action: 'JOB_MEDIA_DELETE',
        category: 'job',
        entityType: 'job',
        entityId: jobUuid || job?.id || jobId,
        entityLabel: job?.job_number || jobId,
        description: 'Job media deleted',
        changes: {
          mediaFile: { before: image.name, after: null },
          mediaCount: {
            before: jobImages.length,
            after: Math.max(0, jobImages.length - 1),
          },
        },
      });

      toast.success('Image deleted successfully');
    } catch (error) {
      console.error('Error deleting image:', error);
      toast.error(`Failed to delete image: ${error.message || 'Unknown error'}`);
    }
  };

  const renderImages = () => {
    // Helper function to check if media is a video
    const isVideo = (media) => {
      return media?.media_type === 'video' || 
             media?.url?.match(/\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/i) ||
             media?.name?.match(/\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/i);
    };

    return (
      <>
        <div className={styles.imagesSection}>
          {isLoadingImages ? (
            <div className={styles.emptyState}>Loading images...</div>
          ) : jobImages.length === 0 ? (
            <div className={styles.emptyState}>No images uploaded yet</div>
          ) : (
          <>
            <div className={styles.imageGrid}>
              {jobImages.map((image) => {
                const isVideoFile = isVideo(image);
                
                return (
                  <div 
                    key={image.id} 
                    className={`${styles.imageCard} ${isVideoFile ? styles.videoCard : ''}`}
                    style={{ position: 'relative' }}
                  >
                    {/* Delete button */}
                    <button
                      className={styles.deleteImageButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteImage(image);
                      }}
                      title={isVideoFile ? "Delete video" : "Delete image"}
                      aria-label={isVideoFile ? "Delete video" : "Delete image"}
                    >
                      <Trash size={16} />
                    </button>
                    
                    <div
                      onClick={() => {
                        setSelectedImage(image);
                        setShowImageModal(true);
                      }}
                      style={{ cursor: 'pointer' }}
                      className={styles.mediaContainer}
                    >
                      {isVideoFile ? (
                        <>
                          <div className={styles.videoThumbnail}>
                            <video 
                              src={image.url} 
                              className={styles.videoPreview}
                              muted
                              preload="metadata"
                            />
                            <div className={styles.videoPlayOverlay}>
                              <PlayCircle size={48} className={styles.playIcon} />
                            </div>
                            <div className={styles.videoBadge}>
                              <PlayCircle size={16} />
                              <span>Video</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <img src={image.url} alt={image.name || 'Job image'} />
                      )}
                      <div className={styles.imageCaption}>
                        <p className="text-muted small mb-0">{image.description || image.name}</p>
                        {image.timestamp && <small>{image.timestamp}</small>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Image/Video Modal */}
            <Modal 
              show={showImageModal} 
              onHide={() => {
                setShowImageModal(false);
                setSelectedImage(null);
              }}
              size="lg"
              centered
              className={styles.imageModal}
            >
              <Modal.Header closeButton>
                <Modal.Title>
                  {selectedImage && isVideo(selectedImage) ? 'Video Details' : 'Image Details'}
                </Modal.Title>
              </Modal.Header>
              <Modal.Body>
                {selectedImage && (
                  <div className={styles.modalImageContainer}>
                    {isVideo(selectedImage) ? (
                      <div className={styles.videoPlayerContainer}>
                        <video 
                          src={selectedImage.url} 
                          controls
                          className={styles.modalVideo}
                          autoPlay
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    ) : (
                      <NextImage
                        src={selectedImage.url}
                        alt={selectedImage.name || selectedImage.description || 'Job image'}
                        width={1600}
                        height={1200}
                        className={styles.modalImage}
                        sizes="(max-width: 991px) 100vw, 800px"
                      />
                    )}
                    <div className={styles.imageDetails}>
                      <div className={styles.detailRow}>
                        <strong>{isVideo(selectedImage) ? 'Video Name:' : 'Image Name:'}</strong>
                        <p>{selectedImage.name || 'N/A'}</p>
                      </div>
                      {selectedImage.description && (
                        <div className={styles.detailRow}>
                          <strong>Description:</strong>
                          <p>{selectedImage.description}</p>
                        </div>
                      )}
                      {selectedImage.timestamp && (
                        <div className={styles.detailRow}>
                          <strong>Uploaded:</strong>
                          <p>{selectedImage.timestamp}</p>
                        </div>
                      )}
                      {selectedImage.uploadedBy && (
                        <div className={styles.detailRow}>
                          <strong>Uploaded By:</strong>
                          <p>{selectedImage.uploadedBy}</p>
                        </div>
                      )}
                      {selectedImage.created_by_full_name && (
                        <div className={styles.detailRow}>
                          <strong>Created By:</strong>
                          <p>{selectedImage.created_by_full_name}</p>
                        </div>
                      )}
                      {selectedImage.category && (
                        <div className={styles.detailRow}>
                          <strong>Category:</strong>
                          <p>{selectedImage.category}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer>
                {selectedImage && (
                  <Button 
                    variant="danger" 
                    onClick={() => {
                      handleDeleteImage(selectedImage);
                    }}
                    className="me-auto"
                  >
                    <Trash className="me-2" />
                    Delete {isVideo(selectedImage) ? 'Video' : 'Image'}
                  </Button>
                )}
                {selectedImage?.url && (
                  <Button 
                    variant="primary" 
                    href={selectedImage.url} 
                    download
                    className={styles.downloadButton}
                  >
                    {isVideo(selectedImage) ? (
                      <>
                        <PlayCircle className="me-2" />
                        Download Video
                      </>
                    ) : (
                      <>
                        <Images className="me-2" />
                        Download Image
                      </>
                    )}
                  </Button>
                )}
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    setShowImageModal(false);
                    setSelectedImage(null);
                  }}
                >
                  Close
                </Button>
              </Modal.Footer>
            </Modal>
          </>
        )}
        </div>

        {/* Image Upload Modal - always in DOM so it opens when user selects files (even when no images yet) */}
        <Modal
          show={showImageUploadModal}
          onHide={handleCancelImageUpload}
          size="lg"
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Describe Uploads</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div
              className={`${styles.uploadDropzone} ${
                isDragActive ? styles.uploadDropzoneActive : ""
              }`}
              onDragOver={handleDropzoneDragOver}
              onDragLeave={handleDropzoneDragLeave}
              onDrop={handleDropzoneDrop}
              role="presentation"
            >
              <div className={styles.dropzoneIconWrapper}>
                <Images size={28} />
              </div>
              <p className="fw-semibold mb-1">Drag & drop images here</p>
              <p className="text-muted mb-2">JPEG, PNG, GIF, WebP up to 10MB each</p>
              <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
                <Button variant="outline-primary" size="sm" onClick={handleBrowseMoreFiles} disabled={isUploadingImages}>
                  Browse Files
                </Button>
                {pendingImageFiles.length > 0 && (
                  <span className="text-muted small">
                    {pendingImageFiles.length} file{pendingImageFiles.length > 1 ? "s" : ""} selected
                  </span>
                )}
              </div>
            </div>

            {pendingImageFiles.length > 0 ? (
              <div className={styles.pendingList}>
                {pendingImageFiles.map(({ key, file, preview }) => (
                  <div key={key} className={styles.uploadPreviewRow}>
                    <div className={styles.uploadPreviewThumb}>
                      {preview ? (
                        <img src={preview} alt={file.name} />
                      ) : (
                        <FileText size={32} />
                      )}
                    </div>
                    <div className={styles.uploadPreviewMeta}>
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <p className="mb-0 fw-semibold">{file.name}</p>
                        <small className="text-muted">{formatFileSize(file.size)}</small>
                      </div>
                      <Form.Control
                        type="text"
                        placeholder="Add a description (optional)"
                        value={imageDescriptions[key] ?? ""}
                        onChange={(e) => handleDescriptionChange(key, e.target.value)}
                        disabled={isUploadingImages}
                      />
                    </div>
                    <Button
                      variant="link"
                      className={styles.removePendingButton}
                      onClick={() => handleRemovePendingFile(key)}
                      disabled={isUploadingImages}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted text-center mb-0">No files selected yet.</p>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={handleCancelImageUpload} disabled={isUploadingImages}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmImageUpload}
              disabled={!pendingImageFiles.length || isUploadingImages}
            >
              {isUploadingImages ? "Uploading..." : "Upload"}
            </Button>
          </Modal.Footer>
        </Modal>
      </>
    );
  };
  const renderMap = () => {
    if (!isLoaded) {
      return (
        <div
          className="d-flex justify-content-center align-items-center"
          style={{ height: "350px" }}
        >
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading map...</span>
          </div>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="alert alert-danger" role="alert">
          Error loading Google Maps. Please check your API key and try again.
        </div>
      );
    }

    if (!location) {
      return (
        <div className="alert alert-warning" role="alert">
          No location data available for this job.
        </div>
      );
    }

    const jobMapLabel =
      job?.location?.location_name ||
      job?.location?.locationName ||
      (typeof job?.location?.address === "string" ? job.location.address : "") ||
      job?.scheduleAddress ||
      buildGeocodableAddressForJob(job) ||
      "Job Location";

    const mapOptions = {
      zoom: 15,
      center: location,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      mapId:
        process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ||
        "DEMO_MAP_ID",
    };

    const positionsRoughlyEqual = (a, b) =>
      a &&
      b &&
      typeof a.lat === "number" &&
      typeof b.lat === "number" &&
      Math.abs(a.lat - b.lat) < 1e-7 &&
      Math.abs(a.lng - b.lng) < 1e-7;

    // Get assigned technicians for markers
    const assignedTechnicians = job?.assignedWorkers || [];

    const selectedTechnicianForInfo =
      selectedMarker?.type === "technician"
        ? (() => {
            const idx = assignedTechnicians.findIndex(
              (t) => (t.technician_id || t.id) === selectedMarker.techId
            );
            if (idx < 0) return null;
            const technician = assignedTechnicians[idx];
            const { techLocation, techLocationData } =
              computeTechnicianMapPosition(
                technician,
                idx,
                assignedTechnicians,
                location,
                technicianLocations
              );
            const techName =
              technician.full_name || technician.fullName || "Technician";
            const techStatus = technician.assignment_status || "ASSIGNED";
            return {
              techLocation,
              techLocationData,
              techName,
              techStatus,
            };
          })()
        : null;

    return (
      <div style={{ height: "350px", width: "100%" }}>
        <GoogleMap
          key={mapKey}
          mapContainerStyle={{ width: "100%", height: "100%" }}
          options={mapOptions}
        >
          <JobDetailsAdvancedMarkers
            location={location}
            jobMapLabel={jobMapLabel}
            assignedTechnicians={assignedTechnicians}
            technicianLocations={technicianLocations}
            setSelectedMarker={setSelectedMarker}
          />

          {selectedMarker?.type === "job" &&
            positionsRoughlyEqual(selectedMarker.position, location) && (
              <InfoWindow
                onCloseClick={() => setSelectedMarker(null)}
                position={location}
              >
                <div
                  style={{
                    padding: "8px",
                    minWidth: "150px",
                    transition: "none",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "600",
                      fontSize: "14px",
                      color: "#1e293b",
                      marginBottom: "4px",
                    }}
                  >
                    📍 Job Location
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {jobMapLabel}
                  </div>
                </div>
              </InfoWindow>
            )}

          {selectedTechnicianForInfo && (
            <InfoWindow
              onCloseClick={() => setSelectedMarker(null)}
              position={selectedTechnicianForInfo.techLocation}
              options={{
                pixelOffset: new window.google.maps.Size(0, -10),
                disableAutoPan: false,
              }}
            >
              <div
                style={{
                  padding: "0",
                  minWidth: "220px",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  background: "white",
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  transition: "none",
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    padding: "12px 16px",
                    color: "white",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "rgba(255, 255, 255, 0.25)",
                        backdropFilter: "blur(10px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontWeight: "700",
                        fontSize: "16px",
                        border: "2px solid rgba(255, 255, 255, 0.3)",
                      }}
                    >
                      {selectedTechnicianForInfo.techName
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: "700",
                          fontSize: "15px",
                          marginBottom: "4px",
                          lineHeight: "1.2",
                        }}
                      >
                        {selectedTechnicianForInfo.techName}
                      </div>
                      <div
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: "600",
                          backgroundColor: "rgba(255, 255, 255, 0.25)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                        }}
                      >
                        {selectedTechnicianForInfo.techStatus}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: "12px 16px" }}>
                  {selectedTechnicianForInfo.techLocationData ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "8px",
                          fontSize: "12px",
                          color: "#64748b",
                        }}
                      >
                        <span style={{ fontSize: "14px" }}>📍</span>
                        <span>
                          {selectedTechnicianForInfo.techLocationData
                            .current_latitude &&
                          selectedTechnicianForInfo.techLocationData
                            .current_longitude
                            ? "Current Location"
                            : "Destination Location"}
                        </span>
                      </div>
                      {selectedTechnicianForInfo.techLocationData.tracked_at && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "12px",
                            color: "#64748b",
                          }}
                        >
                          <span style={{ fontSize: "14px" }}>🕐</span>
                          <span>
                            {new Date(
                              selectedTechnicianForInfo.techLocationData.tracked_at
                            ).toLocaleString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: true,
                            })}
                          </span>
                        </div>
                      )}
                      {(selectedTechnicianForInfo.techLocationData
                        .current_latitude ||
                        selectedTechnicianForInfo.techLocationData
                          .destination_latitude) && (
                        <div
                          style={{
                            marginTop: "8px",
                            paddingTop: "8px",
                            borderTop: "1px solid #e2e8f0",
                            fontSize: "11px",
                            color: "#94a3b8",
                            fontFamily: "monospace",
                          }}
                        >
                          {selectedTechnicianForInfo.techLocationData
                            .current_latitude ||
                            selectedTechnicianForInfo.techLocationData
                              .destination_latitude}
                          ,{" "}
                          {selectedTechnicianForInfo.techLocationData
                            .current_longitude ||
                            selectedTechnicianForInfo.techLocationData
                              .destination_longitude}
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        fontStyle: "italic",
                      }}
                    >
                      Location data not available
                    </div>
                  )}
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    );
  };

  // Update the calculateDuration function
  const calculateDuration = (startTime, endTime) => {
    // Always prioritize saved duration from job_schedule
    // Only auto-calculate if no saved duration exists
    if ((job?.estimatedDurationHours !== undefined && job?.estimatedDurationHours !== null) || 
        (job?.estimatedDurationMinutes !== undefined && job?.estimatedDurationMinutes !== null)) {
      const hours = job.estimatedDurationHours || 0;
      const minutes = job.estimatedDurationMinutes || 0;
      return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`;
    }

    // Fallback: calculate from start/end time only if no saved duration
    if (!startTime || !endTime) return "N/A";

    try {
      const [startHours, startMinutes] = startTime.split(":").map(Number);
      const [endHours, endMinutes] = endTime.split(":").map(Number);

      let totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
      
      // Handle cases where end time is on the next day
      if (totalMinutes < 0) {
        totalMinutes += 24 * 60;
      }

      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`;
    } catch (error) {
      console.error("Error calculating duration:", error);
      return "N/A";
    }
  };

  const renderAssignedWorkers = () => {
    if (!job?.assignedWorkers?.length) {
      return (
        <div className="text-muted">
          No technicians assigned
        </div>
      );
    }

    return (
      <div className={styles.techGrid}>
        {job.assignedWorkers.map((worker, index) => {
          // Get the worker details from the workers array we fetched
          const workerDetails = workers.find(w => w.workerId === worker.workerId);
          
          return (
            <div key={index} className={styles.techCard}>
              <div className={styles.techAvatar}>
                {workerDetails?.profilePicture ? (
                  <Image
                    src={workerDetails.profilePicture}
                    alt={workerDetails.fullName}
                    width={40}
                    height={40}
                    className={styles.avatarImage}
                  />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {workerDetails?.firstName?.[0] || 'T'}
                  </div>
                )}
                <div 
                  className={styles.statusIndicator} 
                  data-status={workerDetails?.isOnline ? 'online' : 'offline'} 
                />
              </div>
              
              <div className={styles.techInfo}>
                <div className={styles.techName}>
                  {workerDetails?.fullName || 'Unknown Technician'}
                </div>
                {/* Skills Section */}
                {workerDetails?.skills && workerDetails.skills.length > 0 && (
                  <div className={styles.skillsContainer}>
                    {workerDetails.skills.map((skill, idx) => (
                      <Badge 
                        key={idx} 
                        bg="light" 
                        text="dark" 
                        className={styles.skillBadge}
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Contact Actions */}
                <div className={styles.techActions}>
                  {workerDetails?.primaryPhone && (
                    <>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip>Call Primary: {workerDetails.primaryPhone}</Tooltip>}
                      >
                        <a href={toTelHref(workerDetails.primaryPhone) || '#'} className={styles.techAction}>
                          <TelephoneFill size={12} />
                        </a>
                      </OverlayTrigger>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip>WhatsApp: {workerDetails.primaryPhone}</Tooltip>}
                      >
                        <a
                          href={`https://wa.me/${workerDetails.primaryPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${styles.techAction} d-inline-flex align-items-center justify-content-center rounded-circle text-success text-decoration-none`}
                          style={{ width: 24, height: 24, backgroundColor: 'rgba(37, 211, 102, 0.15)' }}
                        >
                          <FaWhatsapp size={18} />
                        </a>
                      </OverlayTrigger>
                    </>
                  )}
                  {workerDetails?.secondaryPhone && (
                    <>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip>Call Secondary: {workerDetails.secondaryPhone}</Tooltip>}
                      >
                        <a href={toTelHref(workerDetails.secondaryPhone) || '#'} className={styles.techAction}>
                          <PhoneFill size={12} />
                        </a>
                      </OverlayTrigger>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip>WhatsApp: {workerDetails.secondaryPhone}</Tooltip>}
                      >
                        <a 
                          href={`https://wa.me/${workerDetails.secondaryPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.techAction}
                        >
                          <FaWhatsapp size={18} />
                        </a>
                      </OverlayTrigger>
                    </>
                  )}
                  {workerDetails?.email && (
                    <OverlayTrigger
                      placement="top"
                      overlay={<Tooltip>Email: {workerDetails.email}</Tooltip>}
                    >
                      <a href={`mailto:${workerDetails.email}`} 
                         className={styles.techAction}>
                        <Envelope size={12} />
                      </a>
                    </OverlayTrigger>
                  )}
                </div>

                {/* Additional Details */}
                <div className={styles.techDetails}>
                  <small className={styles.detailItem}>
                    <GeoAltFill size={12} className="me-1" />
                    {workerDetails?.address?.stateProvince || 'Location N/A'}
                  </small>
                  {workerDetails?.shortBio && (
                    <small className={styles.detailItem}>
                      <FileText size={12} className="me-1" />
                      {workerDetails.shortBio}
                    </small>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  // Update the renderPaymentAndSignatures function
  const renderPaymentAndSignatures = () => {
    return (
      <div className={styles.paymentSection}>
        {/* Payment Details */}
        {/* <div className={styles.paymentDetails}>
          <h6 className={styles.subsectionTitle}>Payment Details</h6>
          <div className={styles.paymentInfo}>
            <div className={styles.paymentRow}>
              <span>Payment Status:</span>
              <Badge bg={job.paymentStatus === 'Paid' ? 'success' : 'warning'}>
                {job.paymentStatus || 'Pending'}
              </Badge>
            </div>
            {job.paymentAmount && (
              <div className={styles.paymentRow}>
                <span>Amount:</span>
                <strong>${job.paymentAmount}</strong>
              </div>
            )}
            {job.paymentMethod && (
              <div className={styles.paymentRow}>
                <span>Method:</span>
                <span>{job.paymentMethod}</span>
              </div>
            )}
          </div>
        </div> */}

        {/* Signatures */}
        <div className={styles.signatures}>
          <div className={styles.signatureGrid}>
            {/* Customer Signature */}
            <div className={styles.signatureBox}>
              <label>Customer Signature:</label>
              <div className={styles.signatureLine}>
                {(() => {
                  const techSignature = Array.isArray(signatures) 
                    ? signatures.find(sig => sig.type === 'technician')
                    : signatures?.technician;
                  return techSignature ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={techSignature.signatureURL}
                        alt="Customer Signature"
                        className={styles.signatureImage}
                      />
                      <div className={styles.signatureMeta}>
                        <small>Signed by: {techSignature.signedBy}</small>
                        <small>{formatDateTime(techSignature.timestamp)}</small>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptySignature}>Not signed</div>
                  );
                })()}
              </div>
            </div>

            {/* Customer Signature */}
            {/* <div className={styles.signatureBox}>
              <label>Customer Signature:</label>
              <div className={styles.signatureLine}>
                {(() => {
                  const customerSignature = Array.isArray(signatures) 
                    ? signatures.find(sig => sig.type === 'customer')
                    : signatures?.customer;
                  return customerSignature ? (
                    <>
                      <img 
                        src={customerSignature.signatureURL} 
                        alt="Customer Signature" 
                        className={styles.signatureImage}
                      />
                      <div className={styles.signatureMeta}>
                        <small>Signed by: {customerSignature.signedBy}</small>
                        <small>{formatDateTime(customerSignature.timestamp)}</small>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptySignature}>Not signed</div>
                  );
                })()}
              </div>
            </div> */}
          </div>
        </div>
      </div>
    );
  };

  const handleEditDescription = async () => {
    try {
      setIsSavingDescription(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const previousDescription = job?.jobDescription || job?.description || '';
      const sanitizedDescription = DOMPurify.sanitize(
        normalizeRichTextHtml(editedDescription || ''),
        {
        USE_PROFILES: { html: true },
      });
      const updatedAt = new Date().toISOString();

      if (previousDescription === sanitizedDescription) {
        setIsEditingDescription(false);
        return;
      }

      const { error } = await supabase
        .from('jobs')
        .update({
          description: sanitizedDescription,
          updated_at: updatedAt,
        })
        .eq('id', jobUuid || job?.id);

      if (error) {
        throw error;
      }

      setJob((prevJob) => ({
        ...prevJob,
        jobDescription: sanitizedDescription,
        description: sanitizedDescription,
        updatedAt,
        updated_at: updatedAt,
      }));
      setEditedDescription(sanitizedDescription);
      setIsEditingDescription(false);
      void clientAuditLog({
        action: 'JOB_UPDATE',
        category: 'job',
        entityType: 'job',
        entityId: jobUuid || job?.id,
        entityLabel: job?.job_number || jobUuid || job?.id,
        description: 'Job description updated',
        changes: {
          description: {
            before: previousDescription || null,
            after: sanitizedDescription || null,
          },
        },
      });
      toast.success("Job description updated successfully!");
    } catch (error) {
      console.error("Error updating description:", error);
      toast.error("Error updating description. Please try again.");
    } finally {
      setIsSavingDescription(false);
    }
  };

  const startDescriptionEdit = (initialHtml = "") => {
    setEditedDescription(normalizeRichTextHtml(initialHtml));
    setDescriptionEditorKey((prev) => prev + 1);
    setIsEditingDescription(true);
  };

  const cancelDescriptionEdit = () => {
    setEditedDescription(
      normalizeRichTextHtml(job?.jobDescription || job?.description || ''),
    );
    setIsEditingDescription(false);
  };

  const handleToggleTaskComplete = async (taskID) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const prevTask = job.taskList.find((t) => t.taskID === taskID);

      const updatedTasks = job.taskList.map(task => {
        if (task.taskID === taskID) {
          const newStatus = !task.isDone;
          return {
            ...task,
            isDone: newStatus,
            completionDate: newStatus ? new Date().toISOString() : null
          };
        }
        return task;
      });

      // Update local state immediately
      setJob(prevJob => ({
        ...prevJob,
        taskList: updatedTasks,
        updated_at: new Date().toISOString()
      }));

      // TODO: Update task completion in task_completions table
      // For now, just updating local state
      // You'll need to find the job_task_id and technician_job_id to update task_completions

      const completedTask = updatedTasks.find(t => t.taskID === taskID);
      
      if (completedTask?.isDone) {
        void clientAuditLog({
          action: 'JOB_UPDATE',
          category: 'job',
          entityType: 'job',
          entityId: jobUuid || job?.id,
          entityLabel: job?.job_number || jobUuid,
          description: 'Task marked complete',
          changes: buildAuditChanges(
            buildTaskSnapshot({ ...prevTask, isDone: false }),
            buildTaskSnapshot(completedTask),
          ),
        });
        toast('Task completed!', {
          icon: '🎉',
          style: {
            borderRadius: '10px',
            background: '#333',
            color: '#fff',
          },
        });
      }

    } catch (error) {
      console.error('Error updating task:', error);
      toast('Failed to update task', {
        icon: '❌',
        style: {
          borderRadius: '10px',
          background: '#333',
          color: '#fff',
        },
      });
    }
  };

  // Update the showDeleteConfirmation function
  const showDeleteConfirmation = async (itemType) => {
    return Swal.fire({
      title: `Delete ${itemType}?`,
      text: 'This action cannot be undone',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#FF4747', // Bright red for delete
      cancelButtonColor: '#6C757D', // Gray for cancel
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      background: '#ffffff',
      customClass: {
        confirmButton: styles.confirmDeleteButton,
        cancelButton: styles.confirmCancelButton,
        title: styles.alertTitle,
        popup: styles.alertPopup,
        container: styles.alertContainer,
        actions: styles.alertActions
      }
    });
  };

  // Update handleDeleteFollowUp
  const handleDeleteFollowUp = async (followUpId) => {
    const result = await showDeleteConfirmation('Follow-up');
    
    if (result.isConfirmed) {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          throw new Error('Supabase client not available');
        }

        // Delete from followups table
        const { error } = await supabase
          .from('followups')
          .delete()
          .eq('id', followUpId)
          .eq('job_id', jobUuid);

        if (error) {
          throw error;
        }

        const deletedFollowUp = job.followUps?.[followUpId];

        // Update local state
        const updatedFollowUps = { ...job.followUps };
        delete updatedFollowUps[followUpId];
        
        setJob(prevJob => ({
          ...prevJob,
          followUps: updatedFollowUps,
          followUpCount: (prevJob.followUpCount || 1) - 1
        }));

        void clientAuditLog({
          action: 'FOLLOWUP_DELETE',
          category: 'job',
          entityType: 'followup',
          entityId: followUpId,
          entityLabel: job?.job_number || jobUuid,
          description: 'Follow-up deleted',
          changes: buildAuditChanges(
            buildFollowUpSnapshot(deletedFollowUp),
            buildFollowUpSnapshot(null),
          ),
        });

        toast.success('Follow-up deleted successfully');
      } catch (error) {
        console.error('Error deleting follow-up:', error);
        toast.error('Failed to delete follow-up');
      }
    }
  };

  // Update handleDeleteTask
  const handleDeleteTask = async (taskId) => {
    const result = await showDeleteConfirmation('Task');

    if (result.isConfirmed) {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          throw new Error('Supabase client not available');
        }

        const deletedTask = job.taskList.find((task) => task.taskID === taskId);
        const updatedTasks = job.taskList.filter(task => task.taskID !== taskId);

        const { error: deleteError } = await supabase
          .from('job_tasks')
          .delete()
          .eq('id', taskId);

        if (deleteError) {
          throw deleteError;
        }

        setJob(prevJob => ({
          ...prevJob,
          taskList: updatedTasks,
          updated_at: new Date().toISOString()
        }));

        void clientAuditLog({
          action: 'JOB_UPDATE',
          category: 'job',
          entityType: 'job',
          entityId: jobUuid || job?.id,
          entityLabel: job?.job_number || jobUuid,
          description: 'Task deleted',
          changes: buildAuditChanges(
            buildTaskSnapshot(deletedTask),
            buildTaskSnapshot(null),
          ),
        });

        toast.success('Task deleted successfully');
      } catch (error) {
        console.error('Error deleting task:', error);
        toast.error('Failed to delete task');
      }
    }
  };

  // Helper function to format the date
  const formatDateTime = (timestamp) => {
    if (!timestamp) return "N/A";
    
    // Handle string dates
    if (typeof timestamp === 'string') {
      timestamp = new Date(timestamp);
    }
    
    // Check if the date is valid
    if (!(timestamp instanceof Date) || isNaN(timestamp)) {
      return "N/A";
    }

    return timestamp.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(',', ' -');
  };

  // Update the renderJobDescription function
  const renderJobDescription = () => {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h6 className={styles.sectionTitle}>
            <FileText size={16} className={styles.titleIcon} />
            Job Description
          </h6>
          <div className="ms-auto d-flex align-items-center gap-3">
            <div className={styles.descriptionMeta}>
              <Badge bg="light" text="dark" className={styles.wordCount}>
                {job.jobDescription?.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length || 0} words
              </Badge>
              {job.updatedAt && (
                <span className={styles.lastEdited}>
                  <Clock size={12} />
                  Last edited {formatDateTime(job.updatedAt)}
                </span>
              )}
            </div>
            {!isEditingDescription && (
              <Button
                variant="link"
                size="sm"
                className={styles.editButton}
                onClick={() => startDescriptionEdit(job.jobDescription || job.description || '')}
              >
                <FaPencilAlt size={14} />
                <span>Edit</span>
              </Button>
            )}
          </div>
        </div>

        {isEditingDescription ? (
          <div className={styles.editDescription}>
            <div className={styles.descriptionQuillEditor}>
              <ReactQuillEditor
                key={descriptionEditorKey}
                initialValue={editedDescription}
                onDescriptionChange={setEditedDescription}
              />
            </div>
            <div className={styles.editActions}>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={cancelDescriptionEdit}
                disabled={isSavingDescription}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleEditDescription}
                disabled={isSavingDescription}
              >
                {isSavingDescription ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.descriptionContent}>
            {job.jobDescription ? (
              <div 
                className={`${styles.descriptionText} ${richTextStyles.richTextContent}`}
                dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(job.jobDescription) }}
              />
            ) : (
              <div className={styles.emptyDescription}>
                <FileText size={24} />
                <p>No description provided</p>
                <Button 
                  variant="outline-primary" 
                  size="sm"
                  onClick={() => startDescriptionEdit("")}
                >
                  Add Description
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  // Modify the FollowUpModal implementation to include an onSuccess callback
  // Note: This is now called with the created follow-up from handleCreateFollowUp
  // but we don't need to update state here since handleCreateFollowUp already does it
  const handleFollowUpSuccess = (newFollowUp) => {
    // State is already updated in handleCreateFollowUp, so we just log or do nothing
    // This prevents double state updates
    console.log('Follow-up created successfully:', newFollowUp);
  };

  if (!router.isReady || jobFetchLoading) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ height: "100vh" }}
      >
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!jobId || typeof jobId !== "string") {
    return (
      <Container className="py-5">
        <Alert variant="warning">This job link is invalid.</Alert>
        <Link href="/dashboard/jobs/list-jobs" className="btn btn-primary">
          Back to jobs list
        </Link>
      </Container>
    );
  }

  if (!job) {
    return (
      <Container className="py-5">
        <Alert variant="secondary">
          Job not found, it may have been removed, or you may not have permission to view it.
        </Alert>
        <Link href="/dashboard/jobs/list-jobs" className="btn btn-primary">
          Back to jobs list
        </Link>
      </Container>
    );
  }

  async function getCurrentUserInfo() {
    try {
      // Try to get user info from API endpoint first (more reliable)
      const response = await fetch("/api/getUserInfo", {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const responseData = await response.json();
        const { user } = responseData;
        if (user) {
          return {
            email: user.email || user.username || Cookies.get('email'),
            name: user.name || user.fullName || user.full_name || user.email || user.username || Cookies.get('email'),
            workerId: user.workerId || user.id || Cookies.get('workerId'),
            uid: user.uid || user.id || Cookies.get('uid'),
            id: user.id || user.uid || user.workerId || Cookies.get('uid')
          };
        }
      }
    } catch (error) {
      console.warn('Failed to fetch user info from API:', error);
    }

    // Fallback to cookies
    const email = Cookies.get('email');
    const workerId = Cookies.get('workerId');
    const uid = Cookies.get('uid');
    
    return {
      email: email || 'unknown@email.com',
      name: email || 'unknown@email.com',
      workerId: workerId || uid || 'UNKNOWN',
      uid: uid || workerId,
      id: uid || workerId
    };
  }

  const handleCreateFollowUp = async (followUpData) => {
    try {
      const supabase = getSupabaseClient();
      
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      // Get user_id - use API endpoint first (most reliable, server-side)
      let userId = null;
      let user = null;

      // Method 0: Use API endpoint to get user info (server-side, bypasses RLS)
      try {
        const response = await fetch("/api/getUserInfo", {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const responseData = await response.json();
          if (responseData.success && responseData.user) {
            // The API returns user.uid or user.workerId - try both
            const potentialUserId = responseData.user.uid || responseData.user.workerId || responseData.user.id;
            console.log('✅ Found user via API endpoint, trying ID:', potentialUserId);
            
            if (potentialUserId) {
              // Verify the user exists in database by fetching full details
              const { data: userData, error: verifyError } = await supabase
                .from('users')
                .select('id, username, role')
                .eq('id', potentialUserId)
                .is('deleted_at', null)
                .maybeSingle();
              
              if (userData) {
                user = userData;
                userId = userData.id;
                console.log('✅ Verified user in database:', userId);
              } else {
                console.warn('⚠️ User ID from API not found in database, using API ID directly:', verifyError);
                // If verification fails but API returned a valid ID, use it anyway
                // The API is server-side and more reliable than client-side queries
                if (potentialUserId && potentialUserId !== 'UNKNOWN') {
                  userId = potentialUserId;
                  console.log('✅ Using user ID from API response (database verification failed):', userId);
                } else {
                  // Try workerId if uid didn't work
                  if (responseData.user.workerId && responseData.user.workerId !== potentialUserId) {
                    const { data: userByWorkerId, error: workerError } = await supabase
                      .from('users')
                      .select('id, username, role')
                      .eq('id', responseData.user.workerId)
                      .is('deleted_at', null)
                      .maybeSingle();
                    
                    if (userByWorkerId) {
                      user = userByWorkerId;
                      userId = userByWorkerId.id;
                      console.log('✅ Found user by workerId from API:', userId);
                    } else {
                      // Use workerId from API if database lookup fails
                      if (responseData.user.workerId && responseData.user.workerId !== 'UNKNOWN') {
                        userId = responseData.user.workerId;
                        console.log('✅ Using workerId from API response (database verification failed):', userId);
                      } else {
                        console.warn('⚠️ WorkerId from API also not found, will try other methods');
                        userId = null; // Reset to try other methods
                      }
                    }
                  } else {
                    userId = null; // Reset to try other methods
                  }
                }
              }
            }
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.warn('⚠️ API endpoint returned error:', response.status, errorData);
        }
      } catch (apiError) {
        console.warn('⚠️ Failed to fetch user from API endpoint:', apiError);
      }

      // Method 1: Try to get user from Supabase auth session (if API didn't work)
      if (!userId) {
        try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (session?.user && !sessionError) {
            const authUserId = session.user.id;
            console.log('🔍 Trying Supabase auth session, looking up user by auth ID:', authUserId);
            
            const { data: userByAuthId, error: authError } = await supabase
              .from('users')
              .select('id, username, role')
              .eq('id', authUserId)
              .is('deleted_at', null)
              .maybeSingle();
            
            if (userByAuthId) {
              user = userByAuthId;
              userId = userByAuthId.id;
              console.log('✅ Found user by Supabase auth ID:', userId);
            } else if (session.user.email) {
              const { data: techByEmail, error: techEmailErr } = await supabase
                .from('technicians')
                .select('user_id')
                .eq('email', session.user.email)
                .is('deleted_at', null)
                .maybeSingle();

              if (techByEmail?.user_id) {
                const { data: userFromTech, error: emailError } = await supabase
                  .from('users')
                  .select('id, username, role')
                  .eq('id', techByEmail.user_id)
                  .is('deleted_at', null)
                  .maybeSingle();

                if (userFromTech) {
                  user = userFromTech;
                  userId = userFromTech.id;
                  console.log('✅ Found user via technician email (Supabase auth):', userId);
                } else {
                  console.warn('⚠️ Technician email matched but users row missing:', {
                    authId: authUserId,
                    email: session.user.email,
                    error: emailError,
                  });
                }
              } else {
                console.warn('⚠️ Supabase auth user not in users; no technician row for email:', {
                  authId: authUserId,
                  email: session.user.email,
                  error: authError || techEmailErr,
                });
              }
            }
          } else if (sessionError) {
            console.warn('⚠️ Error getting Supabase auth session:', sessionError);
          }
        } catch (authError) {
          console.warn('⚠️ Failed to get Supabase auth session:', authError);
        }
      }

      // Method 2: Try by uid/id from cookies/userInfo (if previous methods didn't work)
      if (!userId) {
        try {
          const userInfo = await getCurrentUserInfo();
          console.log('🔍 Looking up user with info from cookies:', {
            email: userInfo.email,
            workerId: userInfo.workerId,
            uid: userInfo.uid,
            id: userInfo.id
          });

          if (userInfo.uid && userInfo.uid !== 'UNKNOWN') {
            const { data: userById, error: idError } = await supabase
              .from('users')
              .select('id, username, role')
              .eq('id', userInfo.uid)
              .is('deleted_at', null)
              .maybeSingle();
            
            if (userById) {
              user = userById;
              userId = userById.id;
              console.log('✅ Found user by uid:', userId);
            } else if (idError) {
              console.warn('⚠️ Error finding user by uid:', idError);
            }
          }

          // Try by workerId if uid didn't work
          if (!userId && userInfo.workerId && userInfo.workerId !== 'UNKNOWN' && userInfo.workerId !== userInfo.uid) {
            const { data: userByWorkerId, error: workerError } = await supabase
              .from('users')
              .select('id, username, role')
              .eq('id', userInfo.workerId)
              .is('deleted_at', null)
              .maybeSingle();
            
            if (userByWorkerId) {
              user = userByWorkerId;
              userId = userByWorkerId.id;
              console.log('✅ Found user by workerId:', userId);
            } else if (workerError) {
              console.warn('⚠️ Error finding user by workerId:', workerError);
            }
          }

          // Try by email/username if still not found
          if (!userId && userInfo.email && userInfo.email !== 'unknown@email.com') {
            const { data: userByUsername, error: usernameError } = await supabase
              .from('users')
              .select('id, username, role')
              .eq('username', userInfo.email)
              .is('deleted_at', null)
              .maybeSingle();
            
            if (userByUsername) {
              user = userByUsername;
              userId = userByUsername.id;
              console.log('✅ Found user by username:', userId);
            } else {
              const { data: techByCookieEmail, error: techCookieErr } = await supabase
                .from('technicians')
                .select('user_id')
                .eq('email', userInfo.email)
                .is('deleted_at', null)
                .maybeSingle();

              let userByEmail = null;
              let emailError = techCookieErr;
              if (techByCookieEmail?.user_id) {
                const res = await supabase
                  .from('users')
                  .select('id, username, role')
                  .eq('id', techByCookieEmail.user_id)
                  .is('deleted_at', null)
                  .maybeSingle();
                userByEmail = res.data;
                emailError = res.error;
              }

              if (userByEmail) {
                user = userByEmail;
                userId = userByEmail.id;
                console.log('✅ Found user by technician email:', userId);
              } else {
                console.warn('⚠️ User not found by email/username:', userInfo.email, 'Errors:', { usernameError, emailError });
              }
            }
          }
        } catch (userInfoError) {
          console.warn('⚠️ Error getting user info:', userInfoError);
        }
      }
      
      // If still no userId found, use uid/workerId from cookies as last resort
      // This ensures we can still create follow-ups even if user lookup fails
      if (!userId) {
        const userInfo = await getCurrentUserInfo().catch(() => ({}));
        const uidFromCookie = Cookies.get('uid');
        const workerIdFromCookie = Cookies.get('workerId');
        
        // Use uid or workerId from cookies as fallback
        const fallbackUserId = uidFromCookie || workerIdFromCookie || userInfo?.uid || userInfo?.workerId || userInfo?.id;
        
        if (fallbackUserId && fallbackUserId !== 'UNKNOWN') {
          console.warn('⚠️ Using fallback user ID from cookies:', fallbackUserId);
          userId = fallbackUserId;
        } else {
          console.error('❌ Unable to find user after all attempts:', {
            userInfo,
            availableCookies: {
              email: Cookies.get('email'),
              workerId: Cookies.get('workerId'),
              uid: Cookies.get('uid')
            }
          });
          throw new Error('Unable to find user. Please ensure you are logged in correctly. If the problem persists, please contact support.');
        }
      }

      // Get technician_id if available
      let technicianId = null;
      if (job.assignedWorkers && job.assignedWorkers.length > 0) {
        const firstWorker = job.assignedWorkers[0];
        technicianId = firstWorker.workerId || firstWorker.technician_id || firstWorker.id;
      }

      // Convert numeric priority to string
      const priorityMap = {
        1: 'Low',
        2: 'Normal',
        3: 'High',
        4: 'Urgent'
      };
      const priorityString = typeof followUpData.priority === 'number' 
        ? priorityMap[followUpData.priority] || 'Normal'
        : followUpData.priority || 'Normal';

      // Create follow-up in Supabase with all required fields
      // Note: notes and due_date may need to be added to the followups table schema
      const followUpRecord = {
        job_id: jobId,
        user_id: userId, // Required field - must not be null
        technician_id: technicianId,
        type: followUpData.type,
        status: followUpData.status || 'Logged',
        priority: priorityString
        // notes and due_date will be added if the columns exist in the table
        // If they don't exist, Supabase will ignore them
      };
      
      // Add optional fields if they exist in the schema
      if (followUpData.notes !== undefined) {
        followUpRecord.notes = followUpData.notes || '';
      }
      if (followUpData.dueDate) {
        followUpRecord.due_date = followUpData.dueDate;
      }

      console.log('📝 Creating follow-up with data:', {
        job_id: followUpRecord.job_id,
        user_id: followUpRecord.user_id,
        technician_id: followUpRecord.technician_id,
        type: followUpRecord.type,
        status: followUpRecord.status,
        priority: followUpRecord.priority
      });

      let createdFollowUp;
      try {
        createdFollowUp = await followUpService.create(followUpRecord);
        console.log('✅ Follow-up created successfully:', createdFollowUp.id);
      } catch (createError) {
        console.error('❌ Error creating follow-up in database:', {
          message: createError.message,
          code: createError.code,
          details: createError.details,
          hint: createError.hint,
          followUpRecord
        });
        
        // Provide more specific error messages
        let errorMessage = 'Failed to create follow-up';
        if (createError.code === '23503') {
          errorMessage = 'Invalid user or job reference. Please refresh and try again.';
        } else if (createError.code === '23505') {
          errorMessage = 'A follow-up with these details already exists.';
        } else if (createError.message) {
          errorMessage = `Failed to create follow-up: ${createError.message}`;
        }
        
        throw new Error(errorMessage);
      }

      // Update the job's updated_at timestamp to reflect the change
      try {
        await jobService.update(jobId, {
          updated_at: new Date().toISOString()
        });
        console.log('✅ Job updated successfully after follow-up creation');
      } catch (jobUpdateError) {
        // Log but don't fail - the follow-up was created successfully
        console.warn('⚠️ Failed to update job timestamp:', jobUpdateError);
      }

      const jobNoForNotify = job.jobNo || job.jobNumber || job.job_number;
      const jobTitleForNotify = job.jobName || job.title || '';
      await emitFollowUpStakeholderNotifications({
        jobId,
        jobNumber: jobNoForNotify,
        jobTitle: jobTitleForNotify,
        followUpType: followUpData.type,
        notes: followUpData.notes,
        followUpTechnicianId: technicianId,
        createdByUserId: userId,
        dueDate: followUpData.dueDate || null,
      });

      // Fetch the created follow-up with relations to get user info
      const { data: followUpWithRelations, error: fetchError } = await supabase
        .from('followups')
        .select(`
          *,
          user:user_id(id, username),
          technician:technician_id(id, email, full_name)
        `)
        .eq('id', createdFollowUp.id)
        .single();

      if (fetchError) {
        console.warn('⚠️ Failed to fetch follow-up relations:', fetchError);
      }

      // Fetch technician info for the user who created the follow-up
      let createdByTechInfo = null;
      if (userId) {
        try {
          const { data: techInfo } = await supabase
            .from('technicians')
            .select('full_name, email')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .maybeSingle();
          
          if (techInfo) {
            createdByTechInfo = techInfo;
          }
        } catch (techError) {
          console.warn('⚠️ Failed to fetch technician info for createdBy:', techError);
        }
      }

      // Convert to the format expected by the UI
      const newFollowUp = {
        id: createdFollowUp.id,
        jobID: jobId,
        jobName: job.jobName,
        customerID: job.customerID,
        customerName: job.customerName,
        notes: followUpData.notes || '',
        type: followUpData.type,
        status: followUpData.status || 'Logged',
        priority: priorityString,
        dueDate: followUpData.dueDate,
        createdAt: createdFollowUp.created_at,
        updatedAt: createdFollowUp.updated_at,
        createdBy: buildActorInfo(followUpWithRelations?.user, createdByTechInfo),
        updatedBy: null,
        statusUpdatedBy: null,
        statusUpdatedByAccount: null
      };

      // Update local state
      setJob(prevJob => ({
        ...prevJob,
        followUps: {
          ...(prevJob.followUps || {}),
          [createdFollowUp.id]: newFollowUp
        },
        followUpCount: ((prevJob.followUpCount || 0) + 1),
        lastFollowUp: new Date()
      }));

      toast.success('Follow-up created successfully');
      void clientAuditLog({
        action: 'FOLLOWUP_CREATE',
        category: 'job',
        entityType: 'followup',
        entityId: createdFollowUp.id,
        entityLabel: job?.job_number || jobId,
        description: 'Follow-up created',
        changes: buildAuditChanges(
          buildFollowUpSnapshot(null),
          buildFollowUpSnapshot(newFollowUp),
        ),
      });
      setShowFollowUpModal(false);
      
      // Return the created follow-up for onSuccess callback
      return newFollowUp;
    } catch (error) {
      console.error('Error creating follow-up:', error);
      toast.error('Failed to create follow-up');
      throw error; // Re-throw so modal can handle it
    }
  };


  const handleStatusClick = (status) => {
    router.push(`/dashboard/follow-ups?status=${status}`);
  };

  const handleEditFollowUp = async (followUpId, updatedData) => {
    try {
      const beforeFollowUp = job.followUps[followUpId];
      const updateData = {
        ...updatedData,
        updated_at: new Date().toISOString()
      };

      await followUpService.update(followUpId, updateData);

      // Update local state
      const updatedFollowUp = {
        ...job.followUps[followUpId],
        ...updatedData,
        updatedAt: new Date().toISOString()
      };

      setJob(prevJob => ({
        ...prevJob,
        followUps: {
          ...prevJob.followUps,
          [followUpId]: updatedFollowUp
        }
      }));

      void clientAuditLog({
        action: 'FOLLOWUP_UPDATE',
        category: 'job',
        entityType: 'followup',
        entityId: followUpId,
        entityLabel: job?.job_number || jobUuid,
        description: 'Follow-up updated',
        changes: buildAuditChanges(
          buildFollowUpSnapshot(beforeFollowUp),
          buildFollowUpSnapshot(updatedFollowUp),
        ),
      });

      toast.success('Follow-up updated successfully');
      setIsEditing(null);
    } catch (error) {
      console.error('Error updating follow-up:', error);
      toast.error('Failed to update follow-up');
    }
  };

  const handleStatusChange = async (followUpId, newStatus) => {
    try {
      const beforeFollowUp = job?.followUps?.[followUpId];
      const { statusUpdatedBy, actor } = await resolveStatusUpdater();
      const statusUpdatedByAccount = getActorDisplayLabel(actor);
      const updateData = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (statusUpdatedBy) {
        updateData.status_updated_by = statusUpdatedBy;
      }
      if (statusUpdatedByAccount) {
        updateData.status_updated_by_account = statusUpdatedByAccount;
      }

      try {
        await followUpService.update(followUpId, updateData);
      } catch (error) {
        if (
          (updateData.status_updated_by || updateData.status_updated_by_account) &&
          /status_updated_by/i.test(error?.message || '')
        ) {
          delete updateData.status_updated_by;
          delete updateData.status_updated_by_account;
          await followUpService.update(followUpId, updateData);
        } else {
          throw error;
        }
      }

      // Update local state
      setJob(prevJob => ({
        ...prevJob,
        followUps: {
          ...prevJob.followUps,
          [followUpId]: {
            ...prevJob.followUps[followUpId],
            status: newStatus,
            updatedAt: new Date().toISOString(),
            updatedBy: actor || prevJob.followUps[followUpId]?.updatedBy || null,
            statusUpdatedBy: statusUpdatedBy || prevJob.followUps[followUpId]?.statusUpdatedBy || null,
            statusUpdatedByAccount: statusUpdatedByAccount || prevJob.followUps[followUpId]?.statusUpdatedByAccount || null
          }
        }
      }));
      
      void clientAuditLog({
        action: 'FOLLOWUP_UPDATE',
        category: 'job',
        entityType: 'followup',
        entityId: followUpId,
        entityLabel: job?.job_number || jobUuid,
        description: 'Follow-up status updated',
        changes: buildAuditChanges(
          buildFollowUpSnapshot(beforeFollowUp),
          buildFollowUpSnapshot({ ...beforeFollowUp, status: newStatus }),
        ),
      });

      setIsEditing(null);
      toast.success('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  // Add these handler functions
  const handleEditClick = (followUp) => {
    setEditingFollowUp({
      ...followUp,
      id: followUp.id || Object.keys(job.followUps).find(key => job.followUps[key] === followUp)
    });
    setIsEditing(followUp.id);
  };

  const handleEditSave = async (followUp) => {
    try {
      const existingFollowUp = job?.followUps?.[followUp.id];
      const didStatusChange = existingFollowUp?.status !== followUp.status;
      const didTypeChange = existingFollowUp?.type !== followUp.type;
      const shouldTrackAttendedBy = didStatusChange || didTypeChange;
      const updateData = {
        type: followUp.type,
        status: followUp.status,
        priority: followUp.priority,
        updated_at: new Date().toISOString()
      };

      let statusUpdater = null;
      if (shouldTrackAttendedBy) {
        statusUpdater = await resolveStatusUpdater();
        if (statusUpdater?.statusUpdatedBy) {
          updateData.status_updated_by = statusUpdater.statusUpdatedBy;
        }
        if (getActorDisplayLabel(statusUpdater?.actor)) {
          updateData.status_updated_by_account = getActorDisplayLabel(statusUpdater.actor);
        }
      }

      try {
        await followUpService.update(followUp.id, updateData);
      } catch (error) {
        if (
          (updateData.status_updated_by || updateData.status_updated_by_account) &&
          /status_updated_by/i.test(error?.message || '')
        ) {
          delete updateData.status_updated_by;
          delete updateData.status_updated_by_account;
          await followUpService.update(followUp.id, updateData);
        } else {
          throw error;
        }
      }

      // Update local state
      const updatedFollowUp = {
        ...followUp,
        updatedAt: new Date().toISOString(),
        updatedBy: shouldTrackAttendedBy
          ? (statusUpdater?.actor || existingFollowUp?.updatedBy || null)
          : (existingFollowUp?.updatedBy || followUp.updatedBy || null),
        statusUpdatedBy: shouldTrackAttendedBy
          ? (statusUpdater?.statusUpdatedBy || existingFollowUp?.statusUpdatedBy || null)
          : (existingFollowUp?.statusUpdatedBy || followUp.statusUpdatedBy || null),
        statusUpdatedByAccount: shouldTrackAttendedBy
          ? (getActorDisplayLabel(statusUpdater?.actor) || existingFollowUp?.statusUpdatedByAccount || null)
          : (existingFollowUp?.statusUpdatedByAccount || followUp.statusUpdatedByAccount || null)
      };

      setJob(prevJob => ({
        ...prevJob,
        followUps: {
          ...prevJob.followUps,
          [followUp.id]: updatedFollowUp
        }
      }));

      setEditingFollowUp(null);
      void clientAuditLog({
        action: 'FOLLOWUP_UPDATE',
        category: 'job',
        entityType: 'followup',
        entityId: followUp.id,
        entityLabel: job?.job_number || jobUuid,
        description: 'Follow-up updated',
        changes: buildAuditChanges(
          buildFollowUpSnapshot(existingFollowUp),
          buildFollowUpSnapshot(updatedFollowUp),
        ),
      });
      toast.success('Follow-up updated successfully');
    } catch (error) {
      console.error('Error updating follow-up:', error);
      toast.error('Failed to update follow-up');
    }
  };

  const handleDeleteClick = (followUp) => {
    setFollowUpToDelete(followUp);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!followUpToDelete) return;
    
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      // Soft delete by setting deleted_at
      await supabase
        .from('followups')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', followUpToDelete.id);

      // Update local state
      setJob(prevJob => {
        const newFollowUps = { ...prevJob.followUps };
        delete newFollowUps[followUpToDelete.id];
        return {
          ...prevJob,
          followUps: newFollowUps,
          followUpCount: Math.max(0, (prevJob.followUpCount || 0) - 1)
        };
      });

      setShowDeleteConfirm(false);
      setFollowUpToDelete(null);
      void clientAuditLog({
        action: 'FOLLOWUP_DELETE',
        category: 'job',
        entityType: 'followup',
        entityId: followUpToDelete.id,
        entityLabel: job?.job_number || jobUuid,
        description: 'Follow-up deleted',
        changes: buildAuditChanges(
          buildFollowUpSnapshot(followUpToDelete),
          buildFollowUpSnapshot(null),
        ),
      });
      toast.success('Follow-up deleted successfully');
    } catch (error) {
      console.error("Error deleting follow-up:", error);
      toast.error('Failed to delete follow-up');
    }
  };

  // Add this helper function for status badge colors
  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'logged':
        return '#FFD580';
      case 'in progress':
        return '#6A89CC';
      case 'pending':
        return '#CCCCCC';
      case 'completed':
      case 'closed':
        return '#77DD77';
      case 'open':
        return '#4A90E2';
      case 'cancelled':
        return '#FF6961';
      default:
        return '#f3f4f6';
    }
  };

  // Add or update the handleEditJob function
  const handleEditJob = () => {
    // Navigate to the edit page for this job
    router.push(`/dashboard/jobs/edit-jobs/${jobId}`);
  };

  // Handle PDF generation
  const handleGeneratePDF = async (forceRegenerate = false) => {
    const currentJobId = jobUuid || job?.id;
    if (!currentJobId) {
      toast.error('Job ID is missing');
      return;
    }

    // PDF is available for all job statuses

    // Check if payment QR code is generated
    if (!job?.payment_qr_code_string || !job?.payment_qr_uen) {
      toast.error('Payment QR code must be generated before creating PDF. Please go to the Payment Confirmation section and generate the QR code first.', {
        duration: 5000,
      });
      return;
    }

    setIsGeneratingPDF(true);
    setGeneratedPDFUrl(null);

    try {
      const params = new URLSearchParams({ download: '1' });
      if (forceRegenerate) {
        params.set('force', 'true');
      }

      const response = await fetch(`/api/jobs/${currentJobId}/generate-pdf?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        const data = contentType.includes('application/json')
          ? await response.json()
          : { error: 'Failed to generate PDF' };

        if (data.error && data.error.includes('Payment QR code')) {
          toast.error(data.error, { duration: 5000 });
        } else {
          throw new Error(data.error || 'Failed to generate PDF');
        }
        return;
      }

      if (!contentType.includes('application/pdf')) {
        throw new Error('Unexpected response when generating PDF');
      }

      const isCached = response.headers.get('X-PDF-Cached') === 'true';
      const fallbackFilename = `jobsheet-${currentJobId}.pdf`;
      const filename = parsePdfFilenameFromHeader(
        response.headers.get('content-disposition'),
        fallbackFilename
      );

      const blob = await response.blob();
      const saveResult = await savePdfBlob(blob, filename);

      if (saveResult.method === 'cancelled') {
        toast.info('PDF save cancelled.');
        return;
      }

      if (saveResult.method === 'download') {
        toast.success(
          isCached
            ? 'Existing PDF downloaded. In Firefox, use Properties → Unblock if Explorer preview is blocked.'
            : 'PDF downloaded. In Firefox, use Properties → Unblock if Explorer preview is blocked.',
          { duration: 6000 }
        );
        return;
      }

      toast.success(
        isCached
          ? 'Existing PDF saved. Explorer preview should work without Unblock.'
          : 'PDF saved. Explorer preview should work without Unblock.'
      );
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error(error.message || 'Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // First, update or add these helper functions
  const getStatusBadgeStyles = (status) => {
    switch (status?.toLowerCase()) {
      case 'logged':
        return {
          backgroundColor: '#FFD580',
          color: '#B8860B',
        };
      case 'in progress':
        return {
          backgroundColor: '#6A89CC',
          color: '#2E4A8C',
        };
      case 'pending':
        return {
          backgroundColor: '#CCCCCC',
          color: '#666666',
        };
      case 'completed':
        return {
          backgroundColor: '#77DD77',
          color: '#2D7A2D',
        };
      case 'closed':
        return {
          backgroundColor: '#77DD77',
          color: '#2D7A2D',
        };
      case 'open':
        return {
          backgroundColor: '#4A90E2',
          color: '#FFFFFF',
        };
      case 'cancelled':
        return {
          backgroundColor: '#FF6961',
          color: '#CC0000',
        };
      default:
        return {
          backgroundColor: '#f3f4f6',
          color: '#6b7280',
        };
    }
  };

  // Update the getTypeBadgeStyles function
  const getTypeBadgeStyles = (typeName) => {
    const typeObj = followUpTypes.find(t => t.name.toLowerCase() === typeName?.toLowerCase());
    
    if (typeObj) {
      return {
        backgroundColor: `${typeObj.color}20`, // Adding 20 for 12% opacity
        color: typeObj.color,
        border: `1px solid ${typeObj.color}`,
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontWeight: '500'
      };
    }
    
    // Fallback styles if type not found
    return {
      backgroundColor: '#E2E2E220',
      color: '#666',
      border: '1px solid #E2E2E2',
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '0.75rem',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontWeight: '500'
    };
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'logged': return 'fe-file-text';
      case 'in progress': return 'fe-loader';
      case 'pending': return 'fe-clock';
      case 'completed':
      case 'closed': return 'fe-check-circle';
      case 'open': return 'fe-unlock';
      case 'cancelled': return 'fe-x-circle';
      default: return 'fe-help-circle';
    }
  };


  return (
    <>
      <div className={styles.container}>
        <Row>
          <Col lg={12} md={12} sm={12}>
            <div
              style={{
                background: "linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)",
                padding: "1.5rem 2rem",
                borderRadius: "0 0 24px 24px",
                marginTop: "-39px",
                marginLeft: "10px",
                marginRight: "10px",
                marginBottom: "20px",
              }}
            >
              <div className="d-flex justify-content-between align-items-start">
                <div className="d-flex flex-column">
                  <div className="mb-3">
                    <h1
                      className="mb-2"
                      style={{
                        fontSize: "28px",
                        fontWeight: "600",
                        color: "#FFFFFF",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Job {job.jobNo}
                    </h1>
                    <JobServiceCallSalesOrder
                      serviceCallNumber={job.serviceCallNumber}
                      salesOrderNumber={job.salesOrderNumber}
                      variant="header"
                    />
                    <div 
                      className="d-flex align-items-center gap-2 mb-2"
                      style={{
                        fontSize: "13px", // Changed from 14px to 12px
                        color: "rgba(255, 255, 255, 0.8)",
                      }}
                    >
                      <PersonFill size={12} /> {/* Also reduced icon size from 14 to 12 */}
                      <span>Created by: {job.createdBy?.fullName || "System User"}</span>
                      <span className="mx-2">•</span>
                      <Calendar4 size={12} /> {/* Also reduced icon size from 14 to 12 */}
                      <span>Created: {job.createdAt ? formatDateTime(job.createdAt) : 'N/A'}</span>
                    </div>
                    <p
                      className="mb-2"
                      style={{
                        fontSize: "16px",
                        color: "rgba(255, 255, 255, 0.7)",
                        fontWeight: "400",
                        lineHeight: "1.5",
                      }}
                    >
                      View and manage job details, tasks, and progress
                    </p>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span className="badge bg-light text-dark">
                        {job.jobType || "Maintenance"}
                      </span>
                      <Badge
                        style={{
                          backgroundColor:
                            getJobStatusColorFromList(job.jobStatus, jobStatuses) ??
                            "var(--bs-secondary)",
                          color: "#fff",
                        }}
                      >
                        {getJobStatusLabelFromList(job.jobStatus, jobStatuses)}
                      </Badge>
                      {job.tags &&
                        job.tags.map((tag, index) => (
                          <Badge key={index} bg="secondary">
                            {tag}
                          </Badge>
                        ))}
                    </div>
                  </div>

                  <nav
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    <div className="d-flex align-items-center">
                      <i
                        className="fe fe-home"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      ></i>
                      <Link
                        href="/dashboard"
                        className="text-decoration-none ms-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        Dashboard
                      </Link>
                      <span
                        className="mx-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        /
                      </span>
                      <Link
                        href="/dashboard/jobs/list-jobs"
                        className="text-decoration-none"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        Jobs
                      </Link>
                      <span
                        className="mx-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        /
                      </span>
                      <span style={{ color: "#FFFFFF" }}>Job Details</span>
                    </div>
                  </nav>
                </div>

                {/* Right side buttons */}
                <div className="d-flex flex-column gap-2">
                  <OverlayTrigger
                    placement="bottom"
                    overlay={
                      <Tooltip>
                        {(() => {
                          if (isGeneratingPDF) {
                            return "PDF is being generated...";
                          }
                          if (!jobId) {
                            return "Job ID is missing";
                          }
                          if (!job?.payment_qr_code_string || !job?.payment_qr_uen) {
                            return "Payment QR code must be generated first. Go to Payment Confirmation section.";
                          }
                          return "Left-click: Generate/View PDF | Right-click: Force regenerate";
                        })()}
                      </Tooltip>
                    }
                  >
                    <span style={{ display: 'inline-block' }}>
                      <Button
                        variant="light"
                        className="d-flex align-items-center gap-2"
                        style={{
                          padding: "0.5rem 1rem",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                        }}
                        onClick={() => handleGeneratePDF(false)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (confirm('Regenerate PDF? This will create a new PDF even if one already exists.')) {
                            handleGeneratePDF(true);
                          }
                        }}
                        disabled={
                          isGeneratingPDF || 
                          !jobId || 
                          !job?.payment_qr_code_string ||
                          !job?.payment_qr_uen
                        }
                      >
                        {isGeneratingPDF ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Printer size={16} />
                            Generate PDF
                          </>
                        )}
                      </Button>
                    </span>
                  </OverlayTrigger>

                  <Button
                    variant="light"
                    className="d-flex align-items-center gap-2"
                    style={{
                      padding: "0.5rem 1rem",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    }}
                    onClick={handleEditJob}  // Changed from handleEditClick to handleEditJob
                  >
                    <FaPencilAlt size={16} />
                    Edit Job
                  </Button>
                </div>
              </div>
            </div>
          </Col>
        </Row>

        {/* Main content in a card layout */}
        <Card className={styles.mainCard}>
          <Card.Body>
            <div className={styles.contentGrid}>
              {/* Left Column */}
              <div className={styles.column}>
                {/* Customer Details */}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h6 className={styles.sectionTitle}>
                      <PersonFill className={styles.titleIcon} />
                      Customer Details
                    </h6>
                  </div>
                  <div className={styles.content}>
                    <div className={styles.customerDetails}>
                      {/* Customer Avatar and Name */}
                      <div className={styles.customerHeader}>
                        <div className={styles.avatarSection}>
                          <div className={styles.avatar}>{job.customerName?.[0] || 'P'}</div>
                          <div className={styles.customerMeta}>
                         
                            <h3 className={styles.customerName}>
                              <a href={`/customers/view/${job.customerCode}`} className={styles.customerName}>{job.customerName}</a>
                              </h3>
                            <span className={styles.businessBadge}>Business</span>
                          </div>
                        </div>
                      </div>

                      {/* Customer Information List */}
                      <div className={styles.infoList}>
                        {/* Contact Person */}
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>
                            <PersonFill size={14} className={styles.infoIcon} />
                            Contact Person
                          </div>
                          <div className={styles.infoValue}>
                            {job.contact?.contactFullname || 'Not specified'}
                          </div>
                        </div>

                        {/* Office Phone */}
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>
                            <TelephoneFill size={14} className={styles.infoIcon} />
                            Office Phone
                          </div>
                          <div className={styles.infoValue}>
                            {job.contact?.phoneNumber ? (
                              <div className={styles.contactActions}>
                                {(() => {
                                  const row = phoneLinkRow(job.contact.phoneNumber);
                                  return (
                                    <>
                                      <span>{row.label}</span>
                                      <div className={styles.actionButtons}>
                                        <a
                                          href={row.telHref || '#'}
                                          className={styles.actionIcon}
                                          title={row.telHref ? `Call ${row.label}` : undefined}
                                          onClick={(e) => !row.telHref && e.preventDefault()}
                                        >
                                          <TelephoneFill size={14} />
                                        </a>
                                        {row.waHref ? (
                                          <a
                                            href={row.waHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`${styles.actionIcon} text-success`}
                                          >
                                            <FaWhatsapp size={18} />
                                          </a>
                                        ) : null}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              'Not specified'
                            )}
                          </div>
                        </div>

                        {/* Mobile Phone */}
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>
                            <PhoneFill size={14} className={styles.infoIcon} />
                            Mobile Phone
                          </div>
                          <div className={styles.infoValue}>
                            {job.contact?.mobilePhone ? (
                              <div className={styles.contactActions}>
                                {(() => {
                                  const row = phoneLinkRow(job.contact.mobilePhone);
                                  return (
                                    <>
                                      <span>{row.label}</span>
                                      <div className={styles.actionButtons}>
                                        <a
                                          href={row.telHref || '#'}
                                          className={styles.actionIcon}
                                          title={row.telHref ? `Call ${row.label}` : undefined}
                                          onClick={(e) => !row.telHref && e.preventDefault()}
                                        >
                                          <TelephoneFill size={14} />
                                        </a>
                                        {row.waHref ? (
                                          <a
                                            href={row.waHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`${styles.actionIcon} text-success`}
                                          >
                                            <FaWhatsapp size={18} />
                                          </a>
                                        ) : null}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              'Not specified'
                            )}
                          </div>
                        </div>

                        {/* Email */}
                        {job.contact?.email && (
                          <div className={styles.infoItem}>
                            <div className={styles.infoLabel}>
                              <Envelope size={14} className={styles.infoIcon} />
                              Email
                            </div>
                            <div className={styles.infoValue}>
                              <div className={styles.contactActions}>
                                <span>{job.contact.email}</span>
                                <div className={styles.actionButtons}>
                                  <a
                                    href={`mailto:${job.contact.email}`}
                                    className={styles.actionIcon}
                                    title={`Email ${job.contact.email}`}
                                  >
                                    <Envelope size={14} />
                                  </a>
                                  <OverlayTrigger
                                    placement="top"
                                    overlay={<Tooltip>Send email</Tooltip>}
                                  >
                                    <button
                                      type="button"
                                      className={styles.actionIcon}
                                      onClick={() => setShowSendCompletionEmailConfirm(true)}
                                      disabled={sendingCompletionEmail}
                                      aria-label="Send email"
                                      title="Send email"
                                    >
                                      <Send size={14} />
                                    </button>
                                  </OverlayTrigger>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Location */}
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>
                            <GeoAltFill className={styles.titleIcon} />
                            Location
                          </div>
                          <div className={styles.infoValue}>
                            {(() => {
                              const scheduleAddress = sanitizeAddressPart(job.scheduleAddress);
                              const custLoc = job.customerLocation;
                              const locRecord = job.location;
                              const location = custLoc || locRecord;

                              const resolvedFullAddress =
                                resolveJobDisplayAddress(
                                  {
                                    description: job.description,
                                    scheduleAddress: job.scheduleAddress,
                                    location: locRecord,
                                    location_id: locRecord?.id,
                                  },
                                  {
                                    scheduleAddress: job.scheduleAddress,
                                    customerLocations: job.customerLocations,
                                  }
                                ) ||
                                formatJobLocationLine(custLoc) ||
                                formatJobLocationLine(locRecord);

                              const countryName = location?.country_name || location?.country || '';
                              const countryCode = getCountryCode(countryName);

                              if (!scheduleAddress && !resolvedFullAddress) {
                                return <span className="text-muted">No location specified</span>;
                              }

                              if (!location && scheduleAddress) {
                                return (
                                  <div>
                                    <div className="d-flex align-items-center mb-2">
                                      <GeoAltFill className="me-2 text-primary" size={14} />
                                      <span className="fw-bold text-primary text-uppercase">
                                        Service Location
                                      </span>
                                    </div>
                                    <div className="ms-4 text-muted">{scheduleAddress}</div>
                                  </div>
                                );
                              }

                              const addressParts = resolvedFullAddress
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean);
                              const displayAddress = addressParts[0] || resolvedFullAddress;
                              const fullAddress = resolvedFullAddress;

                              const isJobSite =
                                !!job.customerLocation ||
                                !!(job.location?.id || job.location?.location_name || job.location?.locationName);

                              return (
                                <div>
                                  <div className="d-flex align-items-center mb-2">
                                    <GeoAltFill className="me-2 text-primary" size={14} />
                                    <span className="fw-bold text-primary text-uppercase">
                                      {displayAddress}
                                    </span>
                                    <Badge bg="primary" className="ms-2">
                                      {isJobSite ? 'Service Location' : 'Default'}
                                    </Badge>
                                    {countryCode && (
                                      <div className="ms-2">
                                        <CustomCountryFlag country={countryCode} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="ms-4 text-muted">
                                    {fullAddress}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Address Notes (separate row, same as other contact fields) */}
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>
                            <FaStickyNote size={14} className={styles.infoIcon} />
                            Address Notes
                          </div>
                          <div className={styles.infoValue}>
                            {(() => {
                              const loc = job.customerLocation || job.location;
                              const text =
                                getAddressNotesFromDetailsMap(loc, addressDetailsMap, addressDetailsByLocationId) ||
                                loc?.AddressNotes ||
                                loc?.addressNotes ||
                                loc?.U_AddressNotes ||
                                "";
                              return (
                                <span className="text-muted" style={{ whiteSpace: "pre-wrap" }}>
                                  {String(text).trim() || "Not specified"}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                     
                      </div>
                    </div>
                  </div>
                </section>

                   {/* Job Description Section */}
                   {renderJobDescription()}

                   
                {/* Equipment List Section */}
                
                  {renderAssignedEquipments()}
              


                {/* Follow-ups Section */}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h6 className={styles.sectionTitle}>
                      <Bell size={16} className={styles.headerIcon} />
                      Follow-ups
                    </h6>
                    <button className={styles.actionButton} onClick={() => setShowFollowUpModal(true)}>
                      <Plus size={14} />
                      Add Follow-up
                    </button>
                  </div>

                  {/* Add Legend Component here */}
                  <FollowUpLegend followUpTypes={followUpTypes} />
                  
                  <div className={styles.followUpsList}>
                    {(!job.followUps || Object.keys(job.followUps).length === 0) ? (
                      <div className={styles.noFollowUps}>
                        <Bell size={24} className="text-muted mb-2" />
                        <p className="text-muted mb-0">No follow-ups yet</p>
                      </div>
                    ) : (
                      Object.entries(job.followUps)
                        .sort(([, a], [, b]) => new Date(b.createdAt) - new Date(a.createdAt))
                        .map(([id, followUp]) => {
                          const typeObj = followUpTypes.find(t => t.name === followUp.type);
                          const priorityColor = getPriorityColor(followUp.priority);
                          
                          return (
                            <div 
                              key={id} 
                              className={styles.followUpCard}
                              style={{ 
                                borderLeft: `4px solid ${priorityColor}`
                              }}
                            >
                              {editingFollowUp?.id === id ? (
                                <div className={styles.editForm}>
                                  <Form onSubmit={(e) => {
                                    e.preventDefault();
                                    handleEditSave({ ...editingFollowUp });
                                  }}>
                                    <Form.Group className="mb-3">
                                      <Form.Control
                                        as="textarea"
                                        value={editingFollowUp.notes}
                                        onChange={(e) => setEditingFollowUp({
                                          ...editingFollowUp,
                                          notes: e.target.value
                                        })}
                                      />
                                    </Form.Group>
                                    <Form.Group className="mb-3">
                                      <Form.Select
                                        value={editingFollowUp.status}
                                        onChange={(e) => setEditingFollowUp({
                                          ...editingFollowUp,
                                          status: e.target.value
                                        })}
                                        className={styles.select}
                                      >
                                        {FOLLOW_UP_STATUSES.map(status => (
                                          <option key={status} value={status}>{status}</option>
                                        ))}
                                      </Form.Select>
                                    </Form.Group>
                                    <Form.Group className="mb-3">
                                      <Form.Select
                                        value={editingFollowUp.type}
                                        onChange={(e) => setEditingFollowUp({
                                          ...editingFollowUp,
                                          type: e.target.value
                                        })}
                                        className={styles.select}
                                      >
                                        {followUpTypes.map(type => (
                                          <option key={type.id} value={type.name}>{type.name}</option>
                                        ))}
                                      </Form.Select>
                                    </Form.Group>
                                    <div className={styles.editActions}>
                                      <Button 
                                        variant="secondary" 
                                        onClick={() => setEditingFollowUp(null)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button 
                                        variant="primary" 
                                        type="submit"
                                      >
                                        Save
                                      </Button>
                                    </div>
                                  </Form>
                                </div>
                              ) : (
                                <>
                                  <div className={styles.followUpHeader}>
                                    <div className={styles.followUpStatus}>
                                      {/* Status badge without border */}
                                      <StatusBadge 
                                        status={followUp.status}
                                        icon={getStatusIcon(followUp.status)}
                                      />
                                      
                                      {/* Type badge with border */}
                                      <StatusBadge 
                                        type={followUp.type}
                                        color={typeObj?.color}
                                        withBorder={true}
                                      />
                                    </div>
                                    <div className={styles.followUpActions}>
                                      <Button
                                        variant="link"
                                        size="sm"
                                        onClick={() => handleEditClick(followUp)}
                                      >
                                        <FaPencilAlt size={14} />
                                      </Button>
                                      <Button
                                        variant="link"
                                        size="sm"
                                        onClick={() => handleDeleteFollowUp(id)}
                                      >
                                        <FaTrash size={14} />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className={styles.followUpContent}>
                                    <p className={styles.followUpNotes}>{followUp.notes}</p>
                                    <div className={styles.followUpMeta}>
                                      <div className={styles.metaItem}>
                                        <Calendar4 size={12} />
                                        <span>Due Date: {formatDateDDMMYYYY(followUp.dueDate)}</span>
                                      </div>
                                      <div className={styles.metaItem}>
                                        <Clock size={12} />
                                        <span>Created: {new Date(followUp.createdAt).toLocaleTimeString([], { 
                                          hour: '2-digit', 
                                          minute: '2-digit' 
                                        })}</span>
                                      </div>
                                      <div className={styles.metaItem}>
                                        <PersonFill size={12} />
                                        <span>Created By: {getActorDisplayLabel(followUp.createdBy) || 'Unknown'}</span>
                                      </div>
                                      <div className={styles.metaItem}>
                                        <PersonFill size={12} />
                                        <span>Attended By: {getActorDisplayLabel(followUp.updatedBy)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                </section>

              </div>

              {/* Right Column */}
              <div className={styles.column}>
                {/* Job Status and Schedule Info */}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h6 className={styles.sectionTitle}>
                      <CalendarCheck className={styles.titleIcon} />
                      Appointment Schedule
                    </h6>
                  </div>
                  <div className={styles.scheduleContent}>
                    {/* Date and Time Info */}
                    <div className={styles.scheduleBox}>
                      <div className={styles.dateBox}>
                        {job.scheduled_start ? (
                          <>
                            <div className={styles.month}>
                              {(getSingaporeCalendarParts(job.scheduled_start)?.monthShort || 'N/A').toUpperCase()}
                            </div>
                            <div className={styles.day}>
                              {getSingaporeCalendarParts(job.scheduled_start)?.day ?? '--'}
                            </div>
                            <div className={styles.year}>
                              {getSingaporeCalendarParts(job.scheduled_start)?.year ?? '----'}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={styles.month}>N/A</div>
                            <div className={styles.day}>--</div>
                            <div className={styles.year}>----</div>
                          </>
                        )}
                      </div>
                      
                      <div className={styles.scheduleInfo}>
                        <div className={styles.timeSlot}>
                          <Clock size={14} />
                          <span>
                            {(() => {
                              if (job.scheduled_start && job.scheduled_end) {
                                const startStr = formatSingaporeTimeHm(job.scheduled_start);
                                const endStr = formatSingaporeTimeHm(job.scheduled_end);
                                return `${formatTime(startStr)} - ${formatTime(endStr)}`;
                              }
                              if (job.startTime && job.endTime) {
                                return `${formatTime(job.startTime)} - ${formatTime(job.endTime)}`;
                              }
                              const workEnd = getWorkWindowEndFromJobDuration(job);
                              if (job.scheduled_start && workEnd) {
                                const startStr = formatSingaporeTimeHm(job.scheduled_start);
                                const endStr = formatSingaporeTimeHm(workEnd);
                                return `${formatTime(startStr)} - ${formatTime(endStr)}`;
                              }
                              return 'N/A - N/A';
                            })()}
                          </span>
                        </div>
                        <div className={styles.duration}>
                          <Clock size={14} />
                          <span>Duration: {
                            (job.estimatedDurationHours !== undefined && job.estimatedDurationHours !== null) ||
                            (job.estimatedDurationMinutes !== undefined && job.estimatedDurationMinutes !== null)
                              ? `${job.estimatedDurationHours || 0}h${job.estimatedDurationMinutes ? ` ${job.estimatedDurationMinutes}m` : ''}`
                              : 'N/A'
                          }</span>
                        </div>
                        <div className={styles.arrangedBy}>
                          <PersonFill size={14} />
                          <span>Arranged by: {job.createdBy?.fullName || job.createdBy?.full_name || 'System'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Assigned Technicians */}
                    <div className={styles.techSection}>
                      <div 
                        className={styles.techHeader} 
                        onClick={() => setIsTechListExpanded(!isTechListExpanded)}
                      >
                        <div className={styles.techHeaderLeft}>
                          <PersonFill size={14} />
                          <span>Assigned Technicians</span>
                          <span className={styles.techCount}>
                            ({job.assignedWorkers?.length || 0})
                          </span>
                        </div>
                        <button className={styles.collapseButton}>
                          {isTechListExpanded ? (
                            <ChevronUp size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </button>
                      </div>
                      
                      <div className={`${styles.techList} ${isTechListExpanded ? styles.expanded : styles.collapsed}`}>
                        {job.assignedWorkers?.length > 0 ? (
                          job.assignedWorkers.map((worker, index) => {
                            const workerDetails = workers.find(w => 
                              w.id === worker.workerId || 
                              w.id === worker.technician_id ||
                              w.technician_id === worker.workerId ||
                              w.technician_id === worker.technician_id
                            ) || worker;
                            const fullName = workerDetails?.full_name || workerDetails?.fullName || 
                              `${workerDetails?.first_name || ''} ${workerDetails?.last_name || ''}`.trim() || 
                              'Unknown Technician';
                            const workerId = workerDetails?.id || workerDetails?.workerId || worker.workerId || worker.technician_id;
                            return (
                              <div key={index} className={styles.techItem}>
                                <div className={styles.techProfile}>
                                  {workerDetails?.avatar_url || workerDetails?.profile_picture || workerDetails?.profilePicture ? (
                                    <Image 
                                      src={workerDetails.avatar_url || workerDetails.profile_picture || workerDetails.profilePicture} 
                                      alt={fullName}
                                      width={40}
                                      height={40}
                                      className={styles.techImage}
                                    />
                                  ) : (
                                    <div className={styles.techInitial}>
                                      {fullName[0]?.toUpperCase() || 'T'}
                                    </div>
                                  )}
                                  <div className={styles.techInfo}>
                                    <span className={styles.techName}>{fullName}</span>
                                  </div>
                                </div>
                                <div className={styles.techActions}>
                                  {(workerDetails?.phone_number || workerDetails?.primaryPhone) && (
                                    <>
                                      <a
                                        href={toTelHref(workerDetails.phone_number || workerDetails.primaryPhone) || '#'}
                                        className={styles.actionIcon}
                                      >
                                        <TelephoneFill size={14} />
                                      </a>
                                      <a
                                        href={`https://wa.me/${(workerDetails.phone_number || workerDetails.primaryPhone).replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`${styles.actionIcon} text-success`}
                                      >
                                        <FaWhatsapp size={18} />
                                      </a>
                                    </>
                                  )}
                                  {(workerDetails?.email || workerDetails?.users?.email) && (
                                    <a href={`mailto:${workerDetails.email || workerDetails.users?.email}`} className={styles.actionIcon}>
                                      <Envelope size={14} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className={styles.noTech}>No technicians assigned</div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Payment Confirmation Section */}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h6 className={styles.sectionTitle}>
                      <FaQrcode className={styles.titleIcon} />
                      Payment Confirmation
                    </h6>
                    <div className="ms-auto d-flex align-items-center gap-3">
                      <Badge
                        bg={
                          paymentStatus === 'paid'
                            ? 'success'
                            : paymentStatus === 'partial'
                              ? 'info'
                              : paymentStatus === 'failed'
                                ? 'danger'
                                : 'secondary'
                        }
                        text="light"
                        className="text-uppercase"
                      >
                        {paymentStatus === 'paid'
                          ? 'Paid'
                          : paymentStatus === 'partial'
                            ? 'Partial'
                            : paymentStatus === 'failed'
                              ? 'Failed'
                              : 'Pending'}
                      </Badge>
                      {paymentStatus !== 'paid' && (
                        <Form.Check
                          type="switch"
                          id="mark-paid-switch"
                          label="Mark as Paid"
                          className="mb-0"
                          checked={showMarkPaidModal}
                          onChange={(e) => setShowMarkPaidModal(e.target.checked)}
                          disabled={markPaidLoading}
                        />
                      )}
                    </div>
                  </div>
                  <div className={styles.paymentConfirmationContent}>
                    <div className={styles.paymentForm}>
                      <Form.Group className="mb-3">
                        <Form.Label>Payment Bank</Form.Label>
                        {paymentProfiles.length > 0 ? (
                          <>
                            <Form.Select
                              value={selectedPaymentProfileId || ''}
                              onChange={async (e) => {
                                const profileId = e.target.value || null;
                                setSelectedPaymentProfileId(profileId);
                                const profile = profileId ? paymentProfiles.find(p => p.id === profileId) : null;
                                if (profile) {
                                  setPaymentDetails(prev => ({
                                    ...prev,
                                    uen: profile.paynow_uen_qr || profile.paynow_uen || prev.uen,
                                    company: profile.pay_to || prev.company
                                  }));
                                }
                                if (jobUuid || job?.id) {
                                  const supabase = getSupabaseClient();
                                  if (supabase) {
                                    const jobIdForUpdate = jobUuid || job.id;
                                    await supabase.from('jobs').update({ payment_profile_id: profileId, updated_at: new Date().toISOString() }).eq('id', jobIdForUpdate);
                                    clientAuditLog({
                                      action: 'JOB_UPDATE',
                                      category: 'job',
                                      entityType: 'job',
                                      entityId: jobIdForUpdate,
                                      entityLabel: job?.job_number || jobIdForUpdate,
                                      description: 'Updated payment profile on job',
                                      details: { payment_profile_id: profileId },
                                      changes: { payment_profile_id: { before: selectedPaymentProfileId, after: profileId } },
                                    });
                                  }
                                }
                              }}
                            >
                              <option value="">— Select bank —</option>
                              {paymentProfiles.map(p => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </Form.Select>
                            <Form.Text className="text-muted">Choose which bank for this job. UEN & Company update automatically. Used for PayNow QR and jobsheet PDF.</Form.Text>
                          </>
                        ) : (
                          <div className="p-3 bg-light rounded small">
                            <strong>No payment profiles.</strong> Add banks in{' '}
                            <a href="/dashboard/settings" target="_blank" rel="noreferrer">Settings → Pay Now Details</a>.
                            Then reload this page. Using default UEN (201019107ZDBS) until then.
                          </div>
                        )}
                      </Form.Group>

                      <Form.Group className="mb-3">
                        <Form.Label>Company Name</Form.Label>
                        <Form.Control
                          type="text"
                          value={paymentDetails.company}
                          readOnly
                          disabled
                          className="bg-light"
                        />
                      </Form.Group>

                      <Form.Group className="mb-3">
                        <Form.Label>UEN (Required)</Form.Label>
                        <Form.Control
                          type="text"
                          value={paymentDetails.uen}
                          readOnly
                          disabled
                          className="bg-light"
                        />
                      </Form.Group>

                      <Form.Group className="mb-3">
                        <Form.Label>Expiry Date (Optional)</Form.Label>
                        <Form.Control
                          type="date"
                          value={
                            paymentDetails.expiry && paymentDetails.expiry.length >= 8
                              ? `${paymentDetails.expiry.slice(0, 4)}-${paymentDetails.expiry.slice(4, 6)}-${paymentDetails.expiry.slice(6, 8)}`
                              : ''
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            setPaymentDetails({
                              ...paymentDetails,
                              expiry: v ? v.replace(/-/g, '') : ''
                            });
                          }}
                        />
                        <Form.Text className="text-muted">
                          Optional. Default: job end date. Autosaved before generating QR.
                        </Form.Text>
                      </Form.Group>

                      <Form.Group className="mb-3">
                        <Form.Label>Invoice Number</Form.Label>
                        <Form.Control
                          type="text"
                          value={paymentDetails.invNumber}
                          placeholder={job?.job_number || 'Job number'}
                          onChange={(e) => {
                            setPaymentDetails({
                              ...paymentDetails,
                              invNumber: e.target.value,
                            });
                          }}
                        />
                        <Form.Text className="text-muted">
                          Used as PayNow reference and synced to SAP. Defaults to job number when empty.
                        </Form.Text>
                      </Form.Group>

                      {/* Open: Amount, Default Allow editing */}
                      <Form.Group className="mb-3">
                        <Form.Label>Amount</Form.Label>
                        <Form.Control
                          type="number"
                          placeholder="Enter amount"
                          value={paymentDetails.amount}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, amount: e.target.value })}
                        />
                      </Form.Group>

                      {/* <Form.Group className="mb-3">
                        <Form.Check
                          type="checkbox"
                          label="Allow editing of payment amount"
                          checked={paymentDetails.editable}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, editable: e.target.checked })}
                        />
                        <Form.Text className="text-muted d-block mt-1">
                          Default Allow.
                        </Form.Text>
                      </Form.Group> */}

                      <Button
                        variant="primary"
                        onClick={async () => {
                          if (!paymentDetails.uen) {
                            toast.error('UEN is required');
                            return;
                          }
                          try {
                            const qrRefNumber = resolvePaymentQrRefNumber(
                              paymentDetails.invNumber,
                              job?.job_number
                            );
                            const invNumberToSave = qrRefNumber || null;
                            // Dynamic import for PaynowQR
                            const PaynowQRModule = await import('paynowqr');
                            const PaynowQRClass = PaynowQRModule.default || PaynowQRModule;
                            const expiryValue = paymentDetails.expiry || (job?.scheduled_end ? new Date(job.scheduled_end).toISOString().slice(0, 10).replace(/-/g, '') : undefined);
                            const qrcode = new PaynowQRClass({
                              uen: paymentDetails.uen,
                              amount: paymentDetails.amount ? parseInt(paymentDetails.amount) : undefined,
                              editable: paymentDetails.editable,
                              expiry: expiryValue,
                              refNumber: qrRefNumber || undefined,
                              company: paymentDetails.company || undefined
                            });
                            const qrString = qrcode.output();
                            setQrCodeValue(qrString);
                            
                            // Save QR code data to database
                            if (jobUuid || job?.id) {
                              const supabase = getSupabaseClient();
                              if (supabase) {
                                const { error: updateError } = await supabase
                                  .from('jobs')
                                  .update({
                                    payment_qr_uen: paymentDetails.uen,
                                    payment_qr_amount: paymentDetails.amount ? parseInt(paymentDetails.amount) : null,
                                    payment_qr_editable: paymentDetails.editable,
                                    payment_qr_expiry: expiryValue || null,
                                    payment_qr_inv_number: invNumberToSave,
                                    payment_qr_ref_number: qrRefNumber || null,
                                    payment_qr_company: paymentDetails.company || null,
                                    payment_qr_code_string: qrString,
                                    updated_at: new Date().toISOString()
                                  })
                                  .eq('id', jobUuid || job.id);
                                
                                if (updateError) {
                                  console.error('Error saving QR code to database:', updateError);
                                  toast.warning('QR Code generated but failed to save to database.');
                                } else {
                                  setJob((prev) => prev ? {
                                    ...prev,
                                    payment_qr_inv_number: invNumberToSave,
                                    payment_qr_ref_number: qrRefNumber || null,
                                    payment_qr_code_string: qrString,
                                  } : prev);
                                  toast.success('QR Code generated and saved successfully!');
                                  void clientAuditLog({
                                    action: 'JOB_UPDATE',
                                    category: 'job',
                                    entityType: 'job',
                                    entityId: jobUuid || job.id,
                                    entityLabel: job?.job_number || jobUuid,
                                    description: 'Payment QR code generated',
                                    changes: {
                                      paymentQrUen: {
                                        before: job?.payment_qr_uen || null,
                                        after: paymentDetails.uen || null,
                                      },
                                      paymentQrInvNumber: {
                                        before: job?.payment_qr_inv_number || null,
                                        after: invNumberToSave,
                                      },
                                    },
                                  });
                                }
                              }
                            }
                          } catch (error) {
                            console.error('Error generating QR code:', error);
                            toast.error('Error generating QR code. Please check your inputs.');
                          }
                        }}
                        className="w-100"
                      >
                        Generate QR Code
                      </Button>

                    </div>

                    {qrCodeValue && (
                      <div className={styles.qrCodeContainer}>
                        <div className={styles.qrCodeWrapper}>
                          <QRCodeSVG value={qrCodeValue} size={256} />
                        </div>
                        <div className={styles.qrCodeInfo}>
                          <p className={styles.qrCodeLabel}>Paynow QR Code</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <Modal
                  show={showMarkPaidModal}
                  onHide={() => setShowMarkPaidModal(false)}
                  centered
                >
                  <Modal.Header closeButton>
                    <Modal.Title>Mark as Paid</Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    <p className="text-muted mb-3">
                      Confirm customer payment after checking DBS IDEAL / bank statement.
                    </p>
                    <Form.Group>
                      <Form.Label>Bank reference (optional)</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Statement reference"
                        value={markPaidBankRef}
                        onChange={(e) => setMarkPaidBankRef(e.target.value)}
                      />
                    </Form.Group>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="secondary"
                      onClick={() => setShowMarkPaidModal(false)}
                      disabled={markPaidLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="success"
                      disabled={markPaidLoading}
                      onClick={handleMarkJobPaid}
                    >
                      {markPaidLoading ? 'Saving…' : 'Mark as Paid'}
                    </Button>
                  </Modal.Footer>
                </Modal>


                   {/* Task List Section */}
               
                  {renderJobTasks()}
            

                {/* Images Section */}
                <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h6 className={styles.sectionTitle}>
                      <CreditCard2Front className={styles.titleIcon} />
                      Job Images & Videos
                    </h6>
                    <div className="ms-auto">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={handleTriggerImageUpload}
                        disabled={isUploadingImages}
                      >
                        {isUploadingImages ? 'Uploading...' : 'Upload Images'}
                      </Button>
                    </div>
                  </div>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleJobImageUpload}
                />
                {renderImages()}
                </section>

                {/* Payment & Signature Section */}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h6 className={styles.sectionTitle}>
                      <CreditCard2Front className={styles.titleIcon} />
                      Customer Signature
                    </h6>
                  </div>
                  <div className={styles.paymentDetails}>
                    {renderPaymentAndSignatures()}
                  </div>
                </section>
              </div>
            </div>
          </Card.Body>
        </Card>

        {/* Location & Time Tracking — no outer Card to avoid stacked boxes */}
        <div className={styles.locationTrackingBlock}>
            <section className={styles.section} style={{ marginBottom: 0 }}>
              <div className={styles.sectionHeader}>
                <h6 className={styles.sectionTitle}>
                  <GeoAltFill className={styles.titleIcon} />
                  Location & Time Tracking
                </h6>
              </div>
              <div className={styles.customerCard}>
                <div className={styles.mapContainer}>{renderMap()}</div>

                {job?.assignedWorkers && job.assignedWorkers.length > 0 && (
                  <div className={styles.csoMonitorSection}>
                    <h6 className={styles.csoMonitorTitle}>
                      <Headset size={18} className="me-2" aria-hidden />
                      CSO monitoring
                    </h6>
                    <p className={styles.csoMonitorHint}>
                      Coordinator snapshot: assignment window, GPS, attendance, checklist progress, field notes, and quick links.
                    </p>
                    {(() => {
                      const jobDone = ["COMPLETED", "CANCELLED"].includes(
                        String(job.jobStatus || "").toUpperCase()
                      );
                      const schedEnd = job.scheduled_end
                        ? new Date(job.scheduled_end)
                        : null;
                      const pastWindow = schedEnd && schedEnd.getTime() < Date.now();
                      const anyActive = job.assignedWorkers.some((t) => {
                        const s = String(t.assignment_status || "").toUpperCase();
                        return s === "STARTED" || s === "IN_PROGRESS";
                      });
                      if (pastWindow && !jobDone && anyActive) {
                        return (
                          <Alert variant="warning" className="py-2 small mb-3">
                            <strong>Scheduled window has ended</strong> — assignment is still active in the
                            field. Confirm status with the technician or update the job.
                          </Alert>
                        );
                      }
                      return null;
                    })()}
                    <Row className="g-3">
                      {job.assignedWorkers.map((technician, index) => {
                        const techName =
                          technician.full_name ||
                          technician.fullName ||
                          "Unknown Technician";
                        const techId = technician.technician_id || technician.workerId;
                        const technicianJobId =
                          technician.id || technician.technician_job_id;
                        const techStatus = technician.assignment_status || "ASSIGNED";
                        const techStatusLabel = getTechnicianStatusLabel(techStatus);
                        const techStatusColor = getTechnicianStatusColor(techStatus);
                        const workerDetails =
                          workers.find(
                            (w) =>
                              w.id === techId ||
                              w.technician_id === techId
                          ) || {};
                        const phone =
                          workerDetails.phone_number ||
                          workerDetails.primary_phone ||
                          workerDetails.primaryPhone;
                        const email =
                          workerDetails.email || workerDetails.users?.email;
                        const techLocationData = technicianLocations[techId];
                        const gps = getCsoGpsSummary(techLocationData);
                        const latestAtt = getLatestAttendanceForTechnicianJob(
                          jobAttendance,
                          technicianJobId,
                          techId
                        );
                        let punchLine = "No attendance punch for this assignment";
                        let punchOk = false;
                        let punchTooltip;
                        if (latestAtt) {
                          if (!latestAtt.clock_out) {
                            punchLine = `Clocked in ${formatTechnicianDateTime(latestAtt.clock_in)}`;
                            punchOk = true;
                            punchTooltip =
                              formatTechnicianDateTimePrecise(latestAtt.clock_in) || undefined;
                          } else {
                            punchLine = `Last out ${formatTechnicianDateTime(latestAtt.clock_out)}`;
                            punchTooltip =
                              formatTechnicianDateTimePrecise(latestAtt.clock_out) || undefined;
                          }
                        }
                        const mapsUrl = getCsoOpenMapsUrl(
                          techLocationData,
                          job.location
                        );
                        const tasks = job?.taskList || [];
                        const completedTasks = tasks.filter((task) => {
                          const taskCompletions = task.completions || [];
                          const doneForThisTech = taskCompletions.some(
                            (completion) =>
                              completion.technicianJobId === technicianJobId &&
                              completion.isCompleted
                          );
                          if (doneForThisTech) return true;
                          const hasPerTaskRows = taskCompletions.length > 0;
                          if (!hasPerTaskRows && task.isDone) return true;
                          return false;
                        }).length;
                        const totalTasks = tasks.length;
                        const taskShort =
                          totalTasks > 0
                            ? `${completedTasks}/${totalTasks} tasks`
                            : "No tasks";

                        const assignmentStarted = formatTechnicianDateTime(
                          technician.started_at
                        );
                        const assignmentCompleted = formatTechnicianDateTime(
                          technician.completed_at
                        );
                        let assignmentSummary = "Assignment times not recorded";
                        if (assignmentStarted && assignmentCompleted) {
                          assignmentSummary = `${assignmentStarted} → ${assignmentCompleted}`;
                        } else if (assignmentStarted) {
                          assignmentSummary = assignmentStarted;
                        } else if (assignmentCompleted) {
                          assignmentSummary = `Ended ${assignmentCompleted}`;
                        }
                        const assignmentTitle = [
                          technician.started_at &&
                            formatTechnicianDateTimePrecise(technician.started_at),
                          technician.completed_at &&
                            formatTechnicianDateTimePrecise(technician.completed_at),
                        ]
                          .filter(Boolean)
                          .join(" → ") || undefined;

                        let coordsLine = null;
                        if (
                          techLocationData?.current_latitude != null &&
                          techLocationData?.current_longitude != null
                        ) {
                          coordsLine = `${techLocationData.current_latitude}, ${techLocationData.current_longitude}`;
                        } else if (
                          techLocationData?.destination_latitude != null &&
                          techLocationData?.destination_longitude != null
                        ) {
                          coordsLine = `${techLocationData.destination_latitude}, ${techLocationData.destination_longitude} (nav)`;
                        }

                        const remarksParts = [];
                        if (String(technician.technician_remarks || "").trim()) {
                          remarksParts.push(
                            String(technician.technician_remarks).trim()
                          );
                        }
                        if (String(technician.service_notes || "").trim()) {
                          remarksParts.push(
                            `Service: ${String(technician.service_notes).trim()}`
                          );
                        }
                        const remarksFull = remarksParts.join(" — ");
                        const remarksDisplay =
                          remarksFull.length > 180
                            ? `${remarksFull.slice(0, 177)}…`
                            : remarksFull;

                        const workerProfileUserId =
                          technician.user_id ||
                          workerDetails.user_id ||
                          (Array.isArray(workerDetails.users)
                            ? workerDetails.users[0]?.id
                            : workerDetails.users?.id) ||
                          null;

                        return (
                          <Col
                            xs={12}
                            md={6}
                            xl={4}
                            key={
                              technician.technician_id ||
                              technician.workerId ||
                              index
                            }
                          >
                            <div className={styles.csoTechCard}>
                              <div className={styles.csoTechCardHeader}>
                                <strong className={styles.csoTechName}>
                                  {techName}
                                </strong>
                                <Badge
                                  className="ms-2"
                                  style={{
                                    backgroundColor: techStatusColor,
                                    color: "#fff",
                                  }}
                                >
                                  {techStatusLabel}
                                </Badge>
                              </div>
                              <ul className={styles.csoTechMeta}>
                                <li>
                                  <span className={styles.csoMetaLabel}>GPS</span>
                                  <span
                                    className={
                                      gps.stale
                                        ? styles.csoMetaWarn
                                        : styles.csoMetaOk
                                    }
                                  >
                                    {gps.text}
                                  </span>
                                </li>
                                <li>
                                  <span className={styles.csoMetaLabel}>
                                    Attendance
                                  </span>
                                  <span
                                    className={
                                      punchOk
                                        ? styles.csoMetaOk
                                        : styles.csoMetaMuted
                                    }
                                    title={punchTooltip}
                                  >
                                    {punchLine}
                                  </span>
                                </li>
                                <li>
                                  <span className={styles.csoMetaLabel}>Tasks</span>
                                  <span>{taskShort}</span>
                                </li>
                                <li>
                                  <span className={styles.csoMetaLabel}>
                                    Assignment
                                  </span>
                                  <span
                                    className={styles.csoMetaMuted}
                                    title={assignmentTitle}
                                  >
                                    {assignmentSummary}
                                  </span>
                                </li>
                                {coordsLine && (
                                  <li>
                                    <span className={styles.csoMetaLabel}>
                                      Coords
                                    </span>
                                    <span
                                      className={styles.csoMetaCoords}
                                      title={coordsLine}
                                    >
                                      {coordsLine}
                                    </span>
                                  </li>
                                )}
                                {remarksDisplay ? (
                                  <li className={styles.csoMetaRowBlock}>
                                    <span className={styles.csoMetaLabel}>
                                      Field notes
                                    </span>
                                    <span
                                      className={styles.csoMetaNotes}
                                      title={
                                        remarksFull.length > 180
                                          ? remarksFull
                                          : undefined
                                      }
                                    >
                                      {remarksDisplay}
                                    </span>
                                  </li>
                                ) : null}
                              </ul>
                              <div className={styles.csoQuickActions}>
                                {phone && (
                                  <>
                                    <a
                                      href={toTelHref(phone) || '#'}
                                      className={styles.csoQuickLink}
                                    >
                                      <TelephoneFill size={14} /> Call
                                    </a>
                                    <a
                                      href={`https://wa.me/${String(phone).replace(/\D/g, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={styles.csoQuickLink}
                                    >
                                      <FaWhatsapp size={14} /> WhatsApp
                                    </a>
                                  </>
                                )}
                                {email && (
                                  <a
                                    href={`mailto:${email}`}
                                    className={styles.csoQuickLink}
                                  >
                                    <Envelope size={14} /> Email
                                  </a>
                                )}
                                {mapsUrl && (
                                  <a
                                    href={mapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.csoQuickLink}
                                  >
                                    <BoxArrowUpRight size={14} /> Maps
                                  </a>
                                )}
                                {workerProfileUserId && (
                                  <Link
                                    href={`/dashboard/workers/view/${workerProfileUserId}`}
                                    className={styles.csoQuickLink}
                                  >
                                    <PersonFill size={14} /> Worker profile
                                  </Link>
                                )}
                              </div>
                            </div>
                          </Col>
                        );
                      })}
                    </Row>
                  </div>
                )}
              </div>
            </section>
        </div>
      
      </div>
      <FollowUpModal
        show={showFollowUpModal}
        onHide={() => setShowFollowUpModal(false)}
        jobId={jobId}
        handleCreateFollowUp={handleCreateFollowUp} // Pass the function as prop
        onSuccess={handleFollowUpSuccess}
      />
      {/* Delete Confirmation Modal */}
      <Modal
        show={showDeleteConfirm}
        onHide={() => setShowDeleteConfirm(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this follow-up?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showSendCompletionEmailConfirm}
        onHide={() => !sendingCompletionEmail && setShowSendCompletionEmailConfirm(false)}
        centered
      >
        <Modal.Header closeButton={!sendingCompletionEmail}>
          <Modal.Title>Send email</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label className="small">Send method</Form.Label>
            <Form.Select
              value={manualEmailSendMode}
              onChange={(e) => setManualEmailSendMode(e.target.value)}
              disabled={sendingCompletionEmail}
            >
              <option value="template">By template</option>
              {/* <option value="event" disabled={!emailEventOptions.length}>
                By event{emailEventOptions.length ? '' : ' (none mapped)'}
              </option> */}
            </Form.Select>
          </Form.Group>
          {manualEmailSendMode === 'event' ? (
            <Form.Group className="mb-3">
              <Form.Label className="small">Event</Form.Label>
              <Form.Select
                value={manualEmailTriggerId}
                onChange={(e) => setManualEmailTriggerId(e.target.value)}
                disabled={sendingCompletionEmail}
              >
                {emailEventOptions.map((ev) => (
                  <option key={ev.triggerId} value={ev.triggerId}>
                    {ev.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          ) : (
            <Form.Group className="mb-3">
              <Form.Label className="small">Template</Form.Label>
              <Form.Select
                value={manualEmailTemplateSlug}
                onChange={(e) => setManualEmailTemplateSlug(e.target.value)}
                disabled={sendingCompletionEmail}
              >
                {(emailTemplateOptions.length
                  ? emailTemplateOptions
                  : [{ slug: 'job_completed', name: 'Job completed' }]
                ).map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          )}
          Are you sure you want to send this email
          {job?.contact?.email ? (
            <>
              {' '}
              to <strong>{job.contact.email}</strong>
            </>
          ) : null}
          ?
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowSendCompletionEmailConfirm(false)}
            disabled={sendingCompletionEmail}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSendCompletionEmail}
            disabled={sendingCompletionEmail}
          >
            {sendingCompletionEmail ? 'Sending…' : 'Send email'}
          </Button>
        </Modal.Footer>
      </Modal>
      
      {/* Floating Chat Button */}
      {renderFloatingChatButton()}
      
      {/* Chat Popup Window */}
      {renderChatPopup()}
    </>
  );
};

export default JobDetails;
