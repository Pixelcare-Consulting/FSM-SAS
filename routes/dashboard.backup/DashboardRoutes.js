import { v4 as uuid } from 'uuid';
/**
 *  All Dashboard Routes
 *
 *  Understanding name/value pairs for Dashboard routes
 *
 *  Applicable for main/root/level 1 routes
 *  icon 		: String - It's only for main menu or you can consider 1st level menu item to specify icon name.
 *
 *  Applicable for main/root/level 1 and subitems routes
 * 	id 			: Number - You can use uuid() as value to generate unique ID using uuid library, you can also assign constant unique ID for react dynamic objects.
 *  title 		: String - If menu contains childern use title to provide main menu name.
 *  badge 		: String - (Optional - Default - '') If you specify badge value it will be displayed beside the menu title or menu item.
 * 	badgecolor 	: String - (Optional - Default - 'primary' ) - Used to specify badge background color.
 *
 *  Applicable for subitems / children items routes
 *  name 		: String - If it's menu item in which you are specifiying link, use name ( don't use title for that )
 *  children	: Array - Use to specify submenu items
 *
 *  Used to segrigate menu groups
 *  grouptitle : Boolean - (Optional - Default - false ) If you want to group menu items you can use grouptitle = true,
 *  ( Use title : value to specify group title  e.g. COMPONENTS , DOCUMENTATION that we did here. )
 *
 */

// import MDI icons

import Icon from '@mdi/react';
import {
  mdiCircleSmall, 
  mdiHome, 
  mdiAccountGroup, 
  mdiMapMarker, 
  mdiCalendar, 
  mdiAccountBox, 
  mdiSettings,
  mdiClipboardList, // Icon for Task Lists
  mdiLocationEnter,
  mdiMap
} from '@mdi/js'; // Import necessary icons

export const DashboardMenu = [
  // Dashboard Overview
  {
    id: uuid(),
    title: 'Dashboard',
    icon: <Icon path={mdiHome} className="nav-icon me-2" size={0.8} />,
    link: '/dashboard/overview',
    isAuthenticated: true,
  },
  
  // Workforce Management
  {
    id: uuid(),
    title: 'Menu',
    grouptitle: true, // Group Title
  },
  {
    id: uuid(),
    title: 'Customers (On Going)',
    icon: <Icon path={mdiAccountBox} className="nav-icon me-2" size={0.8} />,
    link: '/dashboard/clients/list-clients',
    isAuthenticated: true,
  },
  {
    id: uuid(),
    title: 'Locations (On Going)',
    icon: <Icon path={mdiMap} className="nav-icon me-2" size={0.8} />,
    link: '/dashboard/clients/list-clients',
    isAuthenticated: true,
  },

  // Operations Management
  {
    id: uuid(),
    title: 'Manage',
    grouptitle: true, // Group Title
  },
  {
    id: uuid(),
    title: 'Field Workers',
    icon: 'users',
    children: [
      { id: uuid(), link: '/dashboard/workers/create-worker', name: <><Icon path={mdiCircleSmall} size={0.8} /> Add Field Worker</>, isAuthenticated: true }, 
      { id: uuid(), link: '/dashboard/workers/worker', name: <><Icon path={mdiCircleSmall} size={0.8} /> View All Workers</>, isAuthenticated: true },
      { id: uuid(), link: '/dashboard/workers/schedules', name: <><Icon path={mdiCircleSmall} size={0.8} /> Manage Schedules</>, isAuthenticated: true },
      { id: uuid(), link: '/dashboard/scheduling/workers/technician_scheduler_react', name: <><Icon path={mdiCircleSmall} size={0.8} /> Manage Schedules</>, isAuthenticated: true },
    ],
  },
  {
    id: uuid(),
    title: 'Jobs',
    icon: 'map',
    children: [
      { id: uuid(), link: '/dashboard/jobs/create-jobs', name: <><Icon path={mdiCircleSmall} size={0.8} /> Create Job</>, isAuthenticated: true },
      { id: uuid(), link: '/dashboard/jobs/list-jobs', name: <><Icon path={mdiCircleSmall} size={0.8} /> View Job List</>, isAuthenticated: true },
    ],
  },

    // Task Lists
    // {
    //   id: uuid(),
    //   title: 'Task Lists',
    //   icon: <Icon path={mdiClipboardList} className="nav-icon me-2" size={0.8} />, // Task List icon
    //   link: '/dashboard/tasks/list',
    //   isAuthenticated: true,
    // },
  // Schedule Management
  {
    id: uuid(),
    title: 'Calendar',
    icon: <Icon path={mdiCalendar} className="nav-icon me-2" size={0.8} />,
    link: '/dashboard/calendar',
    isAuthenticated: true,
  },



    // Settings
    {
      id: uuid(),
      title: 'Settings',
      grouptitle: true, // Group Title
    },

  // Site Settings
  {
    id: uuid(),
    title: 'Site Settings',
    icon: 'settings',
    children: [
      { id: uuid(), link: '/dashboard/settings/general', name: <><Icon path={mdiCircleSmall} size={0.8} /> General</>, isAuthenticated: true },
      
    ],
  },
];

export default DashboardMenu;




// import { v4 as uuid } from 'uuid';
// import Icon from '@mdi/react';
// import {
//   mdiCircleSmall, 
//   mdiHome, 
//   mdiAccountGroup, 
//   mdiMapMarker, 
//   mdiCalendar, 
//   mdiAccountBox, 
//   mdiEmail, 
//   mdiClipboardCheck, 
//   mdiTruck, 
//   mdiFileDocumentOutline, 
//   mdiFileChartOutline,
//   mdiCashUsd
// } from '@mdi/js'; // Import necessary icons

// export const DashboardMenu = [
//   // Dashboard Overview
//   {
//     id: uuid(),
//     title: 'Dashboard',
//     icon: <Icon path={mdiHome} className="nav-icon me-2" size={0.8} />, // Dashboard icon
//     link: '/dashboard/overview',
//     isAuthenticated: true,
//   },
  
//   // Workforce Management
//   {
//     id: uuid(),
//     title: 'Workforce Management',
//     grouptitle: true, // Group Title
//   },
//   {
//     id: uuid(),
//     title: 'Field Workers',
//     icon: 'users',
//     children: [
//       { id: uuid(), link: '/dashboard/workers/create-worker', name: <><Icon path={mdiCircleSmall} size={0.8} /> Add Field Worker</>, isAuthenticated: true }, 
//       { id: uuid(), link: '/dashboard/workers/worker', name: <><Icon path={mdiCircleSmall} size={0.8} /> View All Workers</>, isAuthenticated: true },
//       { id: uuid(), link: '/dashboard/workers/schedules', name: <><Icon path={mdiCircleSmall} size={0.8} /> Manage Schedules</>, isAuthenticated: true },
//     ],
//   },

//   // Operations Management
//   {
//     id: uuid(),
//     title: 'Operations Management',
//     grouptitle: true, // Group Title
//   },
//   {
//     id: uuid(),
//     title: 'Job Assignments',
//     icon: 'map',
//     children: [
//       { id: uuid(), link: '/dashboard/jobs/create-jobs', name: <><Icon path={mdiCircleSmall} size={0.8} /> Create Job</>, isAuthenticated: true },
//       { id: uuid(), link: '/dashboard/jobs/list-jobs', name: <><Icon path={mdiCircleSmall} size={0.8} /> View Job List</>, isAuthenticated: true },
//     ],
//   },

//   // Schedule Management
//   {
//     id: uuid(),
//     title: 'Calendar',
//     icon: <Icon path={mdiCalendar} className="nav-icon me-2" size={0.8} />, // Calendar icon
//     link: '/dashboard/calendar',
//     isAuthenticated: true,
//   },

//   // Client Management
//   {
//     id: uuid(),
//     title: 'Management',
//     grouptitle: true, // Group Title
//   },
//   {
//     id: uuid(),
//     title: 'Clients',
//     icon: <Icon path={mdiAccountBox} className="nav-icon me-2" size={0.8} />, // Clients icon
//     link: '/dashboard/clients/list-clients',
//     isAuthenticated: true,
//   },


//   // Contract & Documentation
//   {
//     id: uuid(),
//     title: 'Contract & Documentation',
//     grouptitle: true, // Group Title
//   },
//   {
//     id: uuid(),
//     title: 'Contracts',
//     icon: <Icon path={mdiFileDocumentOutline} className="nav-icon me-2" size={0.8} />, // Contracts icon
//     link: '/dashboard/contracts',
//     isAuthenticated: true,
//   },
//   {
//     id: uuid(),
//     title: 'Reports',
//     icon: <Icon path={mdiFileChartOutline} className="nav-icon me-2" size={0.8} />, // Reports icon
//     link: '/dashboard/reports',
//     isAuthenticated: true,
//   },

// 	{
// 		id: uuid(),
// 		title: 'Documentation',
// 		grouptitle: true
// 	},
// 	{
// 		id: uuid(),
// 		title: 'Documentation',
// 		icon: 'clipboard',
// 		link: '/dashboard/documentation'
// 	},
// 	{
// 		id: uuid(),
// 		title: 'Changelog',
// 		icon: 'git-pull-request',
// 		link: '/dashboard/changelog',
// 		badge: 'v2.2.1'
// 	}

// ];

// export default DashboardMenu;


// // import { v4 as uuid } from 'uuid';
// // import Icon from '@mdi/react';
// // import {
// //   mdiCircleSmall, 
// //   mdiHome, 
// //   mdiAccountGroup, 
// //   mdiMapMarker, 
// //   mdiCalendar, 
// //   mdiAccountBox, 
// //   mdiEmail, 
// //   mdiClipboardCheck, 
// //   mdiTruck, 
// //   mdiFileDocumentOutline, 
// //   mdiFileChartOutline,
// //   mdiCashUsd
// // } from '@mdi/js'; // Import necessary icons

// // export const DashboardMenu = [
// //   // Dashboard Section
// //   {
// //     id: uuid(),
// //     title: 'Dashboard',
// //     icon: <Icon path={mdiHome} className="nav-icon me-2" size={0.8} />, // Dashboard icon
// //     link: '/dashboard/overview',
// //     isAuthenticated: true,
// //   },
  
// //   // Team Management Section
// //   {
// //     id: uuid(),
// //     title: 'TEAM MANAGEMENT',
// //     grouptitle: true, // Group Title
// //   },
// //   {
// //     id: uuid(),
// //     title: 'Worker',
// //     icon: 'users',
// //     children: [
// //       { id: uuid(), link: '/dashboard/workers/create-worker', name: <><Icon path={mdiCircleSmall} size={0.8} /> Add New Worker</>, isAuthenticated: true }, 
// //       { id: uuid(), link: '/dashboard/workers/worker', name: <><Icon path={mdiCircleSmall} size={0.8} /> All Workers</>, isAuthenticated: true },
// //       { id: uuid(), link: '/dashboard/workers/schedules', name: <><Icon path={mdiCircleSmall} size={0.8} /> Work Schedules</>, isAuthenticated: true },
// //     ],
// //   },

// //   // Project Management Section
// //   {
// //     id: uuid(),
// //     title: 'PROJECT MANAGEMENT',
// //     grouptitle: true, // Group Title
// //   },
// //   {
// //     id: uuid(),
// //     title: 'Jobs',
// //     icon: 'map',
// //     children: [
// //       { id: uuid(), link: '/dashboard/jobs/create-jobs', name: <><Icon path={mdiCircleSmall} size={0.8} /> Add Job</>, isAuthenticated: true },
// //       { id: uuid(), link: '/dashboard/jobs/list-jobs', name: <><Icon path={mdiCircleSmall} size={0.8} /> All Jobs</>, isAuthenticated: true },
// //     ],
// //   },

// //   // Calendar
// //   {
// //     id: uuid(),
// //     title: 'Calendar',
// //     icon: <Icon path={mdiCalendar} className="nav-icon me-2" size={0.8} />, // Calendar icon
// //     link: '/dashboard/calendar',
// //     isAuthenticated: true,
// //   },

// //   // Customer Management Section
// //   {
// //     id: uuid(),
// //     title: 'CUSTOMER MANAGEMENT',
// //     grouptitle: true, // Group Title
// //   },
// //   {
// //     id: uuid(),
// //     title: 'Customers',
// //     icon: <Icon path={mdiAccountBox} className="nav-icon me-2" size={0.8} />, // Customers icon
// //     link: '/dashboard/customers/list-customers',
// //     isAuthenticated: true,
// //   },


// //   // Document Management Section
// //   {
// //     id: uuid(),
// //     title: 'DOCUMENT MANAGEMENT',
// //     grouptitle: true, // Group Title
// //   },
// //   {
// //     id: uuid(),
// //     title: 'Contracts',
// //     icon: <Icon path={mdiFileDocumentOutline} className="nav-icon me-2" size={0.8} />, // Contracts icon
// //     link: '/dashboard/contracts',
// //     isAuthenticated: true,
// //   },
// //   {
// //     id: uuid(),
// //     title: 'Reports',
// //     icon: <Icon path={mdiFileChartOutline} className="nav-icon me-2" size={0.8} />, // Reports icon
// //     link: '/dashboard/reports',
// //     isAuthenticated: true,
// //   },

// // ];

// // export default DashboardMenu;


// // import { v4 as uuid } from 'uuid';
// // import Icon from '@mdi/react';
// // import { mdiCircleSmall } from '@mdi/js'; // Import a small circle icon
// // import { mdiCalendar } from '@mdi/js';

// // export const DashboardMenu = [
// //   {
// //     id: uuid(),
// //     title: 'Dashboard',
// //     icon: 'home',
// //     link: '/dashboard/overview',
// //     isAuthenticated: true,
// //   },
// //   // Add group title for 'Team Management'
// //   {
// //     id: uuid(),
// //     title: 'TEAM MANAGEMENT',
// //     grouptitle: true, // Group Title
// //   },
// //   {
// //     id: uuid(),
// //     title: 'Worker',
// //     icon: 'user',
// //     children: [
// //       { id: uuid(), link: '/dashboard/workers/create-worker', name: <><Icon path={mdiCircleSmall} size={0.8} /> Add New Worker</>, isAuthenticated: true }, 
// //       { id: uuid(), link: '/dashboard/workers/worker', name: <><Icon path={mdiCircleSmall} size={0.8} /> All Workers</>, isAuthenticated: true },
// //       { id: uuid(), link: '/dashboard/workers/schedules', name: <><Icon path={mdiCircleSmall} size={0.8} /> Work Schedules</>, isAuthenticated: true },
// //     ],
// //   },
// //   // Add group title for 'Project Management'
// //   {
// //     id: uuid(),
// //     title: 'PROJECT MANAGEMENT',
// //     grouptitle: true, // Group Title
// //   },
// //   {
// //     id: uuid(),
// //     title: 'Jobs',
// //     icon: 'map',
// //     children: [
// //       { id: uuid(), link: '/dashboard/jobs/create-jobs', name: <><Icon path={mdiCircleSmall} size={0.8} /> Add Job</>, isAuthenticated: true },
// //       { id: uuid(), link: '/dashboard/jobs/list-jobs', name: <><Icon path={mdiCircleSmall} size={0.8} /> All Jobs</>, isAuthenticated: true },
// //     ],
// //   },
// //   {
// //     id: uuid(),
// //     title: 'Calendar',
// //     icon: <Icon path={mdiCalendar} className="nav-icon me-2" size={0.8} />,
// //     link: '/dashboard/calendar',
// //     isAuthenticated: true,
// //   },
// // ];

// // export default DashboardMenu;



// // // import { v4 as uuid } from 'uuid';
// // // import { useRouter } from 'next/router';

// // // /**
// // //  * All Dashboard Routes
// // //  * Understanding name/value pairs for Dashboard routes
// // //  * ...
// // //  */

// // // // import MDI icons
// // // import Icon from '@mdi/react';
// // // import { mdiTrello, mdiCalendar } from '@mdi/js';

// // // export const DashboardMenu = [
// // //   {
// // //     id: uuid(),
// // //     title: 'Dashboard',
// // //     icon: 'home',
// // //     link: '/dashboard/overview',
// // //     isAuthenticated: true, // Add an authentication flag for this route
// // //   },
// // //   {
// // //     id: uuid(),
// // //     title: 'Workers',
// // //     icon: 'user',
// // //     children: [
// // //       { id: uuid(), link: '/dashboard/workers/create-worker', name: 'Create', isAuthenticated: true }, // Add authentication flag for sub-routes
// // //       { id: uuid(), link: '/dashboard/workers/worker', name: 'List', isAuthenticated: true },
     
// // //       { id: uuid(), link: '/dashboard/workers/schedules', name: 'Schedules', isAuthenticated: true },
// // //     ],
// // //   },
// // //   {
// // //     id: uuid(),
// // //     title: 'Jobs',
// // //     icon: 'map',
// // //     children: [
// // //       { id: uuid(), link: '/dashboard/jobs/create-jobs', name: 'Create', isAuthenticated: true },
// // //       { id: uuid(), link: '/dashboard/jobs/list-jobs', name: 'List', isAuthenticated: true },
// // //     ],
// // //   },
// // //   {
// // //     id: uuid(),
// // //     title: 'Calendar',
// // //     icon: <Icon path={mdiCalendar} className="nav-icon me-2" size={0.8} />,
// // //     link: '/dashboard/calendar',
// // //     isAuthenticated: true,
// // //   },
// // //   // {
// // //   //   id: uuid(),
// // //   //   title: 'Settings',
// // //   //   grouptitle: true,
// // //   // },
// // //   // {
// // //   //   id: uuid(),
// // //   //   title: 'Site Settings',
// // //   //   icon: 'settings',
// // //   //   children: [
// // //   //     { id: uuid(), link: '/dashboard/settings/general', name: 'General', isAuthenticated: true },
// // //   //   ],
// // //   // },
// // // ];

// // // export default DashboardMenu;


// // // // import { v4 as uuid } from 'uuid';
// // // // /**
// // // //  *  All Dashboard Routes
// // // //  *
// // // //  *  Understanding name/value pairs for Dashboard routes
// // // //  *
// // // //  *  Applicable for main/root/level 1 routes
// // // //  *  icon 		: String - It's only for main menu or you can consider 1st level menu item to specify icon name.
// // // //  *
// // // //  *  Applicable for main/root/level 1 and subitems routes
// // // //  * 	id 			: Number - You can use uuid() as value to generate unique ID using uuid library, you can also assign constant unique ID for react dynamic objects.
// // // //  *  title 		: String - If menu contains childern use title to provide main menu name.
// // // //  *  badge 		: String - (Optional - Default - '') If you specify badge value it will be displayed beside the menu title or menu item.
// // // //  * 	badgecolor 	: String - (Optional - Default - 'primary' ) - Used to specify badge background color.
// // // //  *
// // // //  *  Applicable for subitems / children items routes
// // // //  *  name 		: String - If it's menu item in which you are specifiying link, use name ( don't use title for that )
// // // //  *  children	: Array - Use to specify submenu items
// // // //  *
// // // //  *  Used to segrigate menu groups
// // // //  *  grouptitle : Boolean - (Optional - Default - false ) If you want to group menu items you can use grouptitle = true,
// // // //  *  ( Use title : value to specify group title  e.g. COMPONENTS , DOCUMENTATION that we did here. )
// // // //  *
// // // //  */

// // // // // import MDI icons
// // // // import Icon from '@mdi/react';
// // // // import { mdiTrello, mdiCalendar } from '@mdi/js';

// // // // export const DashboardMenu = [


// // // // 	{
// // // // 		id: uuid(),
// // // // 		title: 'Dashboard',
// // // // 		icon: 'home',
// // // // 		link: '/dashboard/overview'
// // // // 	},
// // // // 	{
// // // // 		id: uuid(),
// // // // 		title: 'Workers',
// // // // 		icon: 'user',
// // // // 		children: [
// // // // 			{ id: uuid(), link: '/dashboard/workers/create-worker', name: 'Create' },
// // // // 			{ id: uuid(), link: '/dashboard/workers/worker', name: 'List' },
// // // // 			{ id: uuid(), link: '/dashboard/workers/schedules', name: 'Schedules' },
			
// // // // 		]
// // // // 	},
// // // // 	{
// // // // 		id: uuid(),
// // // // 		title: 'Jobs',
// // // // 		icon: 'map',
// // // // 		children: [
// // // // 			{ id: uuid(), link: '/dashboard/jobs/create-jobs', name: 'Create' },
// // // // 			{ id: uuid(), link: '/dashboard/jobs/list-jobs', name: 'List' },
// // // // 		]
// // // // 	},


// // // // 	{
// // // // 		id: uuid(),
// // // // 		title: 'Calendar',
// // // // 		icon: <Icon path={mdiCalendar} className="nav-icon me-2" size={0.8} />,
// // // // 		link: '/dashboard/calendar'
// // // // 	},
// // // // 	{
// // // // 		id: uuid(),
// // // // 		title: 'Settings',
// // // // 		grouptitle: true
// // // // 	},
	
// // // // 	{
// // // // 		id: uuid(),
// // // // 		title: 'Site Settings',
// // // // 		icon: 'settings',
// // // // 		children: [
// // // // 			{ id: uuid(), link: '/dashboard/settings/general', name: 'General' },
			
// // // // 		]
// // // // 	},

// // // // ];

// // // // export default DashboardMenu;
