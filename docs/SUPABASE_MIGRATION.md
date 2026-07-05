# Firebase to Supabase Migration Guide

This document outlines the migration from Firebase to Supabase for the SAS FSM Portal.

## Overview

The application has been migrated from Firebase (Firestore, Firebase Auth, Firebase Storage) to Supabase (PostgreSQL, Supabase Auth, Supabase Storage).

## Environment Variables

Add the following environment variables to your `.env.local` or deployment environment:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

You can find these values in your Supabase project settings:
- Dashboard → Settings → API
- `NEXT_PUBLIC_SUPABASE_URL`: Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon/public key
- `SUPABASE_SERVICE_ROLE_KEY`: service_role key (keep this secret!)

## Database Schema

The Supabase database uses PostgreSQL with the schema defined in the SQL file. Key tables include:

- `users` - User accounts
- `technicians` - Technician profiles (linked to users)
- `customer` - Customer records
- `jobs` - Job records
- `equipments` - Equipment records
- `service_call` - Service call records
- And many more as defined in the schema

## Key Changes

### 1. Authentication

**Before (Firebase):**
```javascript
import { signInWithEmailAndPassword } from 'firebase/auth';
const userCredential = await signInWithEmailAndPassword(auth, email, password);
```

**After (Supabase):**
```javascript
import { userService } from '../lib/supabase/database';
import bcrypt from 'bcryptjs';

const userData = await userService.findByEmail(email);
const isValid = await bcrypt.compare(password, userData.password);
```

### 2. Database Queries

**Before (Firestore):**
```javascript
import { collection, query, where, getDocs } from 'firebase/firestore';
const q = query(collection(db, 'users'), where('email', '==', email));
const snapshot = await getDocs(q);
```

**After (Supabase):**
```javascript
import { userService } from '../lib/supabase/database';
const user = await userService.findByEmail(email);
```

### 3. Real-time Listeners

**Before (Firestore):**
```javascript
import { onSnapshot } from 'firebase/firestore';
const unsubscribe = onSnapshot(doc(db, 'jobs', jobId), (doc) => {
  // Handle updates
});
```

**After (Supabase):**
```javascript
import { createRealtimeSubscription } from '../lib/supabase/database';
const unsubscribe = createRealtimeSubscription(
  'jobs',
  `id=eq.${jobId}`,
  (payload) => {
    // Handle updates
  }
);
```

### 4. File Storage

**Before (Firebase Storage):**
```javascript
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
const storageRef = ref(storage, `documents/${path}`);
await uploadBytes(storageRef, file);
const url = await getDownloadURL(storageRef);
```

**After (Supabase Storage):**
```javascript
import { uploadFile, getDownloadURL } from '../lib/supabase/storage';
const result = await uploadFile('documents', path, file);
const url = result.url;
```

## Migration Steps

### 1. Set Up Supabase Project

1. Create a new Supabase project at https://supabase.com
2. Run the provided SQL schema in the SQL Editor
3. Configure Row Level Security (RLS) policies as needed
4. Set up Storage buckets for file uploads

### 2. Data Migration

You'll need to migrate existing data from Firebase to Supabase:

1. Export data from Firestore collections
2. Transform data to match Supabase schema
3. Import data into Supabase using the Supabase dashboard or API

### 3. Update Environment Variables

Add Supabase credentials to your environment variables.

### 4. Install Dependencies

```bash
pnpm install
```

This will install:
- `@supabase/supabase-js` - Supabase client library
- `bcryptjs` - Password hashing (for database auth)

### 5. Storage Buckets Setup

Create the following storage buckets in Supabase:

- `documents` - For customer/worker documents
- `company_logos` - For company logos
- `job_images` - For job-related images
- `signatures` - For job signatures

Set appropriate RLS policies for each bucket.

## File Structure

New Supabase-related files:

```
lib/
  supabase/
    client.js      # Client-side Supabase client
    server.js      # Server-side Supabase admin client
    database.js    # Database service layer
    storage.js     # Storage service layer
```

## Authentication Flow

The application now uses a hybrid authentication approach:

1. **Database Authentication**: Users are authenticated against the `users` table using bcrypt password hashing
2. **Supabase Auth (Optional)**: Can be configured to use Supabase Auth for additional features

The login flow:
1. User submits email/password
2. Server queries `users` table by email
3. Password is verified using bcrypt
4. Session cookies are set
5. User data is returned

## API Routes Updated

The following API routes have been migrated:

- `/api/login` - Now uses Supabase database auth
- `/api/getUserInfo` - Now queries Supabase users table

## Client Components Updated

- `contexts/AuthContext.js` - Now uses Supabase client for auth state

## Remaining Work

The following areas still need migration:

1. **All client-side components** using Firebase Firestore
2. **Real-time subscriptions** in hooks and components
3. **File upload components** using Firebase Storage
4. **All API routes** that query Firestore
5. **Notification system** if using Firestore
6. **Caching utilities** that reference Firebase

## Testing

After migration, test the following:

1. User login/logout
2. User data retrieval
3. Database queries
4. File uploads/downloads
5. Real-time updates
6. All CRUD operations

## Rollback Plan

If you need to rollback:

1. Keep Firebase dependencies in `package.json`
2. Firebase configuration files are still present
3. You can switch back by reverting the changes to:
   - `pages/api/login.js`
   - `pages/api/getUserInfo.js`
   - `contexts/AuthContext.js`

## Support

For issues or questions:
1. Check Supabase documentation: https://supabase.com/docs
2. Review the database schema SQL file
3. Check the service layer files in `lib/supabase/`

