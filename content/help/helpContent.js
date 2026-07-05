import {
  FaHome,
  FaUsers,
  FaUserCog,
  FaBriefcase,
  FaTasks,
  FaExternalLinkAlt,
  FaChartBar,
  FaCog,
  FaUser,
  FaClipboardList,
  FaBullhorn,
  FaSearch,
  FaJournalWhills,
  FaLink,
  FaBell,
  FaSignOutAlt,
} from "react-icons/fa";

export const HELP_TIPS = [
  {
    title: "Dashboard",
    icon: FaHome,
    link: "/dashboard",
    tips: [
      "View key metrics and job statistics (Total Jobs, Active Jobs) at a glance.",
      "Use time filters (Today, This Week, This Month, This Year) to focus on the right period.",
      "Charts show job status and type distribution for quick insights.",
    ],
  },
  {
    title: "Customers",
    icon: FaUsers,
    items: [
      {
        label: "Portal Customers",
        link: "/customer-leads",
        tip: "Manage leads and portal sign-ups; convert leads to customers.",
      },
      {
        label: "SAP Customers",
        link: "/customers",
        tip: "View and manage customers synced from SAP Business One.",
      },
      {
        label: "SAP Leads",
        link: "/leads",
        tip: "SAP-sourced lead records before they become customers.",
      },
    ],
    tips: [
      "Use Portal Customers for new web leads; SAP Customers for B1 master data; SAP Leads for SAP prospect records.",
    ],
  },
  {
    title: "Technicians",
    icon: FaUserCog,
    items: [
      {
        label: "Technicians",
        link: "/workers",
        tip: "View, add, and manage technician profiles and availability.",
      },
      {
        label: "Technicians Scheduler",
        link: "/scheduler",
        tip: "Assign jobs to technicians and manage the schedule.",
      },
      {
        label: "Company Calendar",
        link: "/company-calendar",
        tip:
          "Manage company holidays, day-offs, and technician leave. " +
          "Click any date or Add event to create entries. " +
          "Use Filter for company-only or one technician. " +
          "The Technicians Scheduler shows warn-only overlays on holidays and leave.",
      },
      {
        label: "Attendance",
        link: "/workers/attendance",
        tip: "View daily clock-in and clock-out punches with schedule and leave context.",
      },
    ],
    tips: [
      "Assign jobs from the Scheduler by dragging or using the assignment controls.",
      "Check technician availability and skills before assigning.",
      "On Company Calendar (/company-calendar), click a date or Add event to create holidays or leave.",
      "The Scheduler shows warn-only overlays when assigning on holidays or leave — assignments are still allowed.",
      "Use Filter on the calendar to show company-only events or a single technician.",
      "Attendance uses calendar data for expected hours and leave badges to spot punch mismatches.",
    ],
  },
  {
    title: "Jobs",
    icon: FaBriefcase,
    link: "/jobs",
    tips: [
      "Use the Jobs list to filter by status, date, customer, or technician.",
      "Create new jobs from the Jobs list; fill in customer, type, priority, and scheduling details.",
      "Open a job to view full details, update status, add notes, or reschedule.",
    ],
  },
  {
    title: "Follow-Ups",
    icon: FaTasks,
    link: "/follow-ups",
    tips: [
      "Track and manage follow-up tasks linked to jobs or customers.",
      "Use follow-ups to ensure nothing falls through the cracks after a job.",
    ],
  },
  {
    title: "Reports",
    icon: FaChartBar,
    link: "/dashboard/reports",
    items: [
      {
        label: "Forms Report",
        link: "/dashboard/reports/forms",
        tip: "Submitted forms and field data summary.",
      },
      {
        label: "Job Status Record Search",
        link: "/dashboard/reports/job-status",
        tip: "Search and filter job records by status.",
      },
      {
        label: "Monthly Charts",
        link: "/dashboard/reports/monthly-charts",
        tip: "Jobs, revenue, productivity, and job types by month.",
      },
      {
        label: "Hours by employee",
        link: "/dashboard/reports/hours-by-employee",
        tip: "Technician hours for payroll and review.",
      },
    ],
    tips: [
      "Open Reports from the top menu; each report has its own filters and date range.",
    ],
  },
  {
    title: "Settings",
    icon: FaCog,
    link: "/dashboard/settings",
    items: [
      {
        label: "Company Information",
        link: "/dashboard/settings",
        tip: "Logo, name, and contact details (admin).",
      },
      {
        label: "Scheduling & job config",
        link: "/dashboard/settings",
        tip: "Windows, statuses, follow-up types, incentives.",
      },
      {
        label: "Notifications & email",
        link: "/dashboard/settings#notifications",
        tip: "SMS, push, and automated email templates.",
      },
    ],
    tips: [
      "Most settings are for administrators. Technicians use Profile for personal details.",
    ],
  },
  {
    title: "Profile & audit",
    icon: FaUser,
    items: [
      {
        label: "My profile",
        link: "/dashboard/profile/myprofile",
        tip: "Your name, contact, and technician profile.",
      },
      {
        label: "Audit logs",
        link: "/dashboard/audit-logs",
        tip: "System activity history (typically admins).",
      },
    ],
    tips: [
      "Open Profile from the user menu (avatar, top right).",
    ],
  },
  {
    title: "Search",
    icon: FaSearch,
    link: "/dashboard/search",
    tips: [
      "Use the search bar in the top header on any dashboard page.",
      "Results include customers, leads, workers, jobs, and follow-ups.",
      "Press Enter to open the full search results page with filters.",
    ],
  },
  {
    title: "Release Notes",
    icon: FaJournalWhills,
    link: "/dashboard/whats-new",
    tips: [
      "See what changed in recent portal releases.",
      "Linked from the top menu (Release Notes) with a NEW badge.",
    ],
  },
];

export const HELP_FAQ_CATEGORIES = [
  {
    id: "jobs",
    title: "Jobs",
    icon: FaBriefcase,
    items: [
      {
        id: "create-job",
        question: "How do I create a new job?",
        answer:
          "Go to Jobs from the main menu and click the option to create a new job (/jobs/create). Select the customer, job type, priority, and schedule. You can assign a technician from the same form or later from the Technicians Scheduler.",
      },
      {
        id: "edit-job",
        question: "How do I edit or reschedule an existing job?",
        answer:
          "Open the job from the Jobs list (/jobs/view/:jobId or /jobs/edit-jobs/:id). Update details, status, scheduled date/time, or assigned technician from the job detail view. Rescheduling can also be done from the Technicians Scheduler by dragging the job to a new date or technician.",
      },
      {
        id: "job-status",
        question: "What do the different job statuses mean?",
        answer:
          "Job statuses (e.g. Pending, Scheduled, In Progress, Completed, Cancelled) reflect where the job is in its lifecycle. Status names and colors are configured in Settings → Job Statuses. Use Jobs list filters to view by status.",
      },
      {
        id: "job-priority",
        question: "What does job priority do?",
        answer:
          "Priority (Low, Medium, High, Urgent) helps focus on the most important work first. Filter and sort jobs by priority; consider priority when assigning in the Scheduler.",
      },
      {
        id: "assign-technician",
        question: "How do I assign a technician to a job?",
        answer:
          "Open the Technicians Scheduler (/scheduler). Find the job and drag it onto a technician or use assignment controls. Filter by availability and skills for the best match.",
      },
      {
        id: "job-pdf",
        question: "How do I generate or print a jobsheet PDF?",
        answer:
          "Open the job detail page. Use the PDF or print action when available. Pay Now and bank details on the PDF come from Settings → Pay Now Details.",
      },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    icon: FaUsers,
    items: [
      {
        id: "portal-vs-sap",
        question: "What's the difference between Portal Customers, SAP Customers, and SAP Leads?",
        answer:
          "Portal Customers (/customer-leads) are web leads and sign-ups. SAP Customers (/customers) are synced from SAP Business One. SAP Leads (/leads) are prospect records from SAP before they become customers. Use Portal for new prospects, SAP Customers for active B1 accounts, SAP Leads for SAP-managed prospects.",
      },
      {
        id: "convert-lead",
        question: "How do I convert a portal lead to a customer?",
        answer:
          "In Portal Customers, open the lead and use the convert or create-customer action. After conversion, manage the record in SAP Customers and assign jobs.",
      },
      {
        id: "sap-sync",
        question: "How often does customer data sync from SAP Business One?",
        answer:
          "Sync runs on a schedule or when triggered by your administrator. Refresh the page if you expect new B1 data. Contact your admin for sync frequency and status.",
      },
    ],
  },
  {
    id: "sap-leads",
    title: "SAP Leads",
    icon: FaUsers,
    items: [
      {
        id: "sap-leads-what",
        question: "When should I use SAP Leads instead of Portal Customers?",
        answer:
          "Use SAP Leads (/leads) when the prospect exists in SAP Business One. Use Portal Customers for leads captured through your web portal. Both may eventually become SAP Customers.",
      },
      {
        id: "sap-lead-view",
        question: "How do I open a specific SAP lead?",
        answer:
          "From SAP Leads, search or browse the list and open a record. Detail URLs use /leads/view/:leadCode.",
      },
    ],
  },
  {
    id: "technicians",
    title: "Technicians",
    icon: FaUserCog,
    items: [
      {
        id: "add-technician",
        question: "How do I add a new technician?",
        answer:
          "Go to Technicians (/workers) and add a new technician with name, contact, skills, and availability. They will appear in the Scheduler (/scheduler) once saved.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: FaHome,
    items: [
      {
        id: "dashboard-filters",
        question: "How do the dashboard time filters work?",
        answer:
          "Use Today, This Week, This Month, or This Year at the top of the dashboard (/dashboard) to limit metrics and charts to that period.",
      },
      {
        id: "active-jobs",
        question: 'What counts as an "Active" job on the dashboard?',
        answer:
          "Active jobs typically include scheduled or in-progress work—not completed or cancelled. The exact definition follows your job status configuration in Settings.",
      },
    ],
  },
  {
    id: "follow-ups",
    title: "Follow-ups",
    icon: FaTasks,
    items: [
      {
        id: "follow-ups",
        question: "How do I track follow-ups?",
        answer:
          "Use Follow-Ups (/follow-ups). Create tasks linked to jobs or customers with due dates. Filter by status or date until complete.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    icon: FaChartBar,
    items: [
      {
        id: "which-report",
        question: "Which report should I use?",
        answer:
          "Forms Report for field submissions; Job Status Record Search for finding jobs by status; Monthly Charts for trends; Hours by employee for technician time; Job categories for type codes. All are listed at /dashboard/reports.",
      },
      {
        id: "hours-report",
        question: "How do I run hours worked by employee?",
        answer:
          "Open Reports → Hours worked by employee (/dashboard/reports/hours-by-employee). Choose last week, this week, last two weeks, or a custom period.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    icon: FaCog,
    items: [
      {
        id: "who-settings",
        question: "Who can change Settings?",
        answer:
          "Most Settings tabs (company info, scheduling windows, job statuses, email) require administrator access. Open Settings from the user menu (/dashboard/settings).",
      },
      {
        id: "pay-now-pdf",
        question: "Where do jobsheet payment details come from?",
        answer:
          "Settings → Pay Now Details configures PayNow and bank transfer text shown on jobsheet PDFs.",
      },
    ],
  },
  {
    id: "search",
    title: "Search",
    icon: FaSearch,
    items: [
      {
        id: "global-search",
        question: "What can I search for?",
        answer:
          "The header search finds customers, SAP leads, workers, jobs, and follow-ups. Type at least a few characters; press Enter for the full results page at /dashboard/search.",
      },
    ],
  },
  {
    id: "memos",
    title: "Memos",
    icon: FaBullhorn,
    items: [
      {
        id: "memos-admin",
        question: "Who can create company memos?",
        answer:
          "Administrators see Memos in the top menu (/dashboard/company-memos) and can manage announcements in Settings → Company memos. All users may see the header ticker and Release Notes (/dashboard/whats-new).",
      },
    ],
  },
  {
    id: "support",
    title: "Support & account",
    icon: FaExternalLinkAlt,
    items: [
      {
        id: "support",
        question: "Where do I get more help or report an issue?",
        answer:
          'Use the "Open help desk" button in the Contact support card on this page. You can also read Release Notes (/dashboard/whats-new) or ask your portal administrator.',
      },
      {
        id: "audit-logs",
        question: "What are Audit Logs?",
        answer:
          "Audit Logs (/dashboard/audit-logs) show a filterable history of portal activity—auth, jobs, customers, SAP, settings, and memos. Primarily for administrators troubleshooting or compliance.",
      },
    ],
  },
];

export const NAVIGATION_SECTIONS = [
  {
    id: "main",
    title: "Main menu",
    description: "Top navigation bar below the company logo",
    items: [
      {
        label: "Dashboard",
        route: "/dashboard",
        description: "Metrics, active jobs, and charts",
      },
      {
        label: "Follow-Ups",
        route: "/follow-ups",
        description: "Callbacks and post-job tasks",
      },
      {
        label: "Reports",
        route: "/dashboard/reports",
        description: "Forms, job search, charts, hours, catalogs",
      },
      {
        label: "Release Notes",
        route: "/dashboard/whats-new",
        description: "Recent portal updates",
        badge: "NEW",
      },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    description: "Customers dropdown",
    items: [
      {
        label: "Portal Customers",
        route: "/customer-leads",
        description: "Web leads and portal sign-ups",
      },
      {
        label: "SAP Customers",
        route: "/customers",
        description: "SAP Business One customer master",
      },
      {
        label: "SAP Leads",
        route: "/leads",
        description: "SAP prospect records",
      },
    ],
  },
  {
    id: "technicians",
    title: "Technicians",
    description: "Technicians dropdown",
    items: [
      {
        label: "Technicians",
        route: "/workers",
        description: "Technician profiles and skills",
      },
      {
        label: "Technicians Scheduler",
        route: "/scheduler",
        description: "Assign and reschedule jobs",
      },
      {
        label: "Company Calendar",
        route: "/company-calendar",
        description: "Company holidays, day-offs, and technician leave",
      },
      {
        label: "Attendance",
        route: "/workers/attendance",
        description: "Daily clock-in/out punches with schedule context",
      },
    ],
  },
  {
    id: "jobs",
    title: "Jobs",
    description: "Jobs dropdown",
    items: [
      {
        label: "Jobs",
        route: "/jobs",
        description: "List, create, and open jobs",
      },
    ],
  },
  {
    id: "admin",
    title: "Administration",
    description: "Visible to administrators",
    items: [
      {
        label: "Memos",
        route: "/dashboard/company-memos",
        description: "Company-wide announcements",
        adminOnly: true,
      },
    ],
  },
  {
    id: "header",
    title: "Header & user menu",
    description: "Top-right tools (QuickMenu)",
    items: [
      {
        label: "Search",
        route: "/dashboard/search",
        description: "Global search across records",
        icon: FaSearch,
      },
      {
        label: "Notifications",
        route: null,
        description: "Bell icon — job and system alerts",
        icon: FaBell,
      },
      {
        label: "Profile",
        route: "/dashboard/profile/myprofile",
        description: "Your user and technician profile",
        icon: FaUser,
      },
      {
        label: "Settings",
        route: "/dashboard/settings",
        description: "Company and system configuration",
        icon: FaCog,
      },
      {
        label: "Audit Logs",
        route: "/dashboard/audit-logs",
        description: "Activity history",
        icon: FaClipboardList,
        badge: "NEW",
      },
      {
        label: "Help & Support",
        route: "/dashboard/help",
        description: "This page",
        icon: FaLink,
      },
      {
        label: "Sign Out",
        route: "/sign-in",
        description: "End your session",
        icon: FaSignOutAlt,
      },
    ],
  },
];

export const ROLE_GUIDE = [
  {
    id: "all-users",
    title: "All users",
    icon: FaUsers,
    bullets: [
      "Sign in at /sign-in and land on the dashboard (/dashboard).",
      "Use global search and notifications from the top header.",
      "Open Profile, Help, and Release Notes from the user menu or top nav.",
      "View reports at /dashboard/reports subject to your permissions.",
    ],
  },
  {
    id: "technician",
    title: "Technicians",
    icon: FaUserCog,
    bullets: [
      "See jobs assigned to you from Jobs (/jobs) and notifications.",
      "Update job status, notes, and forms on the job detail page.",
      "View your schedule on the Technicians Scheduler (/scheduler).",
      "Manage follow-ups (/follow-ups) for your callbacks and tasks.",
      "Edit personal details via Profile (/dashboard/profile/myprofile).",
    ],
  },
  {
    id: "admin",
    title: "Administrators",
    icon: FaCog,
    bullets: [
      "Full access to Customers, Technicians, Jobs, and Follow-Ups.",
      "Manage Memos (/dashboard/company-memos) and Settings (/dashboard/settings).",
      "Configure company info, scheduling windows, job statuses, email, and notifications.",
      "Review Audit Logs (/dashboard/audit-logs) for troubleshooting and compliance.",
      "Add technicians (/workers/create) and convert portal leads to customers.",
    ],
  },
];

export const WORKFLOW_STEPS = [
  {
    id: "dispatch-job",
    title: "Dispatch a job",
    description: "Create a job and assign it to a technician.",
    steps: [
      { text: "Create or open a job", link: "/jobs/create", linkLabel: "Create job" },
      { text: "Set customer, type, priority, and schedule window" },
      { text: "Assign in the Scheduler", link: "/scheduler", linkLabel: "Open scheduler" },
      { text: "Confirm status is Scheduled and notifications sent if enabled" },
    ],
  },
  {
    id: "convert-lead",
    title: "Convert a portal lead",
    description: "Turn a web lead into a customer you can job.",
    steps: [
      { text: "Open Portal Customers", link: "/customer-leads", linkLabel: "Portal Customers" },
      { text: "Review lead details and source" },
      { text: "Use Convert / create customer" },
      { text: "Create a job for the new customer", link: "/jobs/create", linkLabel: "Create job" },
    ],
  },
  {
    id: "complete-job",
    title: "Complete a job",
    description: "Close out field work and documentation.",
    steps: [
      { text: "Open the job from Jobs", link: "/jobs", linkLabel: "Jobs list" },
      { text: "Record work, forms, and time as required" },
      { text: "Set status to Completed" },
      { text: "Generate jobsheet PDF if your process requires it" },
    ],
  },
  {
    id: "follow-up",
    title: "Create a follow-up",
    description: "Track callbacks and post-job tasks.",
    steps: [
      { text: "From the job or Follow-Ups", link: "/follow-ups", linkLabel: "Follow-Ups" },
      { text: "Add task type, due date, and notes" },
      { text: "Assign owner if needed" },
      { text: "Mark complete when done" },
    ],
  },
  {
    id: "run-report",
    title: "Run a report",
    description: "Review operational or payroll data.",
    steps: [
      { text: "Open Reports", link: "/dashboard/reports", linkLabel: "Reports hub" },
      { text: "Choose report (e.g. Monthly Charts or Hours by employee)" },
      { text: "Apply date range or status filters" },
      { text: "Review on screen or export per report options" },
    ],
  },
];

export const QUICK_LINKS = [
  { label: "Dashboard", href: "/dashboard", description: "Metrics and overview" },
  { label: "Jobs", href: "/jobs", description: "View and manage jobs" },
  { label: "Technicians Scheduler", href: "/scheduler", description: "Assign and schedule" },
  { label: "Company Calendar", href: "/company-calendar", description: "Holidays and leave" },
  { label: "Attendance", href: "/workers/attendance", description: "Daily punches with schedule context" },
  { label: "Portal Customers", href: "/customer-leads", description: "Leads and sign-ups" },
  { label: "SAP Customers", href: "/customers", description: "B1 customer data" },
  { label: "SAP Leads", href: "/leads", description: "SAP prospect records" },
  { label: "Follow-Ups", href: "/follow-ups", description: "Tasks and callbacks" },
  { label: "Reports", href: "/dashboard/reports", description: "Forms, charts, hours" },
  { label: "Settings", href: "/dashboard/settings", description: "Company and job config" },
  { label: "Release Notes", href: "/dashboard/whats-new", description: "What's new" },
];
