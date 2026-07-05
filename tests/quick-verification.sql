-- Quick Verification Queries for Create Pages Migration
-- Run these in Supabase SQL Editor to verify migration

-- ============================================
-- 1. Verify Tables Exist
-- ============================================
SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      'users', 'technicians', 'customer', 'jobs', 'job_tasks',
      'technician_jobs', 'technician_hours', 'job_contact_type', 'job_equipments',
      'job_schedule', 'locations', 'equipments', 'service_call',
      'recent_activities'
    ) THEN '✅ Required'
    ELSE '⚠️  Optional'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'technicians', 'customer', 'jobs', 'job_tasks',
    'technician_jobs', 'technician_hours', 'job_contact_type', 'job_equipments',
    'job_schedule', 'locations', 'equipments', 'service_call',
    'recent_activities'
  )
ORDER BY table_name;

-- ============================================
-- 2. Verify Recent Job Creation
-- ============================================
SELECT 
  j.id,
  j.job_number,
  j.title,
  j.status,
  j.priority,
  c.customer_name,
  l.location_name,
  (SELECT COUNT(*) FROM job_tasks WHERE job_id = j.id) as task_count,
  (SELECT COUNT(*) FROM technician_jobs WHERE job_id = j.id) as worker_count,
  (SELECT COUNT(*) FROM job_equipments WHERE job_id = j.id) as equipment_count,
  j.created_at
FROM jobs j
LEFT JOIN customer c ON c.id = j.customer_id
LEFT JOIN locations l ON l.id = j.location_id
ORDER BY j.created_at DESC
LIMIT 10;

-- ============================================
-- 3. Verify Recent Worker Creation
-- ============================================
SELECT 
  u.id as user_id,
  u.username,
  u.role,
  u.status as user_status,
  t.id as technician_id,
  t.full_name,
  t.email,
  t.phone_number,
  t.status as technician_status,
  u.created_at
FROM users u
LEFT JOIN technicians t ON t.user_id = u.id
WHERE u.role = 'TECHNICIAN'
ORDER BY u.created_at DESC
LIMIT 10;

-- ============================================
-- 4. Check for Orphaned Records
-- ============================================
SELECT 
  'job_tasks' as table_name,
  COUNT(*) as orphaned_count
FROM job_tasks jt
LEFT JOIN jobs j ON j.id = jt.job_id
WHERE j.id IS NULL

UNION ALL

SELECT 
  'technician_jobs (job)',
  COUNT(*)
FROM technician_jobs tj
LEFT JOIN jobs j ON j.id = tj.job_id
WHERE j.id IS NULL

UNION ALL

SELECT 
  'technician_jobs (technician)',
  COUNT(*)
FROM technician_jobs tj
LEFT JOIN technicians t ON t.id = tj.technician_id
WHERE t.id IS NULL

UNION ALL

SELECT 
  'technicians (user)',
  COUNT(*)
FROM technicians t
LEFT JOIN users u ON u.id = t.user_id
WHERE u.id IS NULL

UNION ALL

SELECT 
  'jobs (customer)',
  COUNT(*)
FROM jobs j
LEFT JOIN customer c ON c.id = j.customer_id
WHERE c.id IS NULL;

-- ============================================
-- 5. Verify Password Hashing
-- ============================================
SELECT 
  id,
  username,
  CASE 
    WHEN password LIKE '$2a$%' OR password LIKE '$2b$%' THEN '✅ Hashed (bcrypt)'
    WHEN password LIKE '$2y$%' THEN '✅ Hashed (bcrypt variant)'
    ELSE '❌ NOT HASHED - Plain text!'
  END as password_status,
  LENGTH(password) as password_length
FROM users
WHERE role = 'TECHNICIAN'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- 6. Verify Job Structure Completeness
-- ============================================
SELECT 
  j.job_number,
  CASE WHEN j.customer_id IS NOT NULL THEN '✅' ELSE '❌' END as has_customer,
  CASE WHEN j.location_id IS NOT NULL THEN '✅' ELSE '⚠️' END as has_location,
  CASE WHEN j.service_call_id IS NOT NULL THEN '✅' ELSE '⚠️' END as has_service_call,
  CASE WHEN EXISTS(SELECT 1 FROM job_tasks WHERE job_id = j.id) THEN '✅' ELSE '❌' END as has_tasks,
  CASE WHEN EXISTS(SELECT 1 FROM technician_jobs WHERE job_id = j.id) THEN '✅' ELSE '❌' END as has_workers,
  CASE WHEN EXISTS(SELECT 1 FROM job_schedule WHERE job_id = j.id) THEN '✅' ELSE '⚠️' END as has_schedule
FROM jobs j
ORDER BY j.created_at DESC
LIMIT 10;

-- ============================================
-- 7. Check Data Types
-- ============================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jobs'
  AND column_name IN ('id', 'customer_id', 'job_number', 'title', 'priority', 'status', 'scheduled_start', 'scheduled_end')
ORDER BY ordinal_position;

-- ============================================
-- 8. Verify Unique Constraints
-- ============================================
SELECT 
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'UNIQUE'
  AND tc.table_name IN ('users', 'technicians', 'jobs', 'customer')
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- 9. Verify Foreign Key Constraints
-- ============================================
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('jobs', 'job_tasks', 'technician_jobs', 'technicians')
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- 10. Sample Complete Job Record
-- ============================================
SELECT 
  j.*,
  c.customer_name,
  l.location_name,
  json_agg(DISTINCT jsonb_build_object(
    'id', jt.id,
    'task_name', jt.task_name,
    'task_order', jt.task_order
  )) as tasks,
  json_agg(DISTINCT jsonb_build_object(
    'technician_id', tj.technician_id,
    'status', tj.assignment_status
  )) as workers
FROM jobs j
LEFT JOIN customer c ON c.id = j.customer_id
LEFT JOIN locations l ON l.id = j.location_id
LEFT JOIN job_tasks jt ON jt.job_id = j.id
LEFT JOIN technician_jobs tj ON tj.job_id = j.id
WHERE j.created_at > NOW() - INTERVAL '1 day'
GROUP BY j.id, c.customer_name, l.location_name
ORDER BY j.created_at DESC
LIMIT 1;

