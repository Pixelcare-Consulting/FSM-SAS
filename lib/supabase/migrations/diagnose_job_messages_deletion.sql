-- Diagnostic script to identify why job_technician_admin_messages are being deleted
-- Run this to check the current state of constraints and triggers

-- 1. Check the current foreign key constraint on job_technician_admin_messages
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'job_technician_admin_messages'
    AND ccu.table_name = 'jobs';

-- 2. Check for any triggers on the jobs table that might affect messages
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'jobs'
ORDER BY trigger_name;

-- 3. Check for any triggers on job_technician_admin_messages table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'job_technician_admin_messages'
ORDER BY trigger_name;

-- 4. Check if there are any functions that might delete messages
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND (
        routine_definition ILIKE '%job_technician_admin_messages%'
        OR routine_definition ILIKE '%DELETE%message%'
    )
ORDER BY routine_name;

-- 5. Check the actual constraint using pg_constraint (more detailed)
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'job_technician_admin_messages'::regclass
    AND contype = 'f'
    AND confrelid = 'jobs'::regclass;

