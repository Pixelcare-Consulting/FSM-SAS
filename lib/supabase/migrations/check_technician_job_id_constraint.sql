-- Check the technician_job_id foreign key constraint
-- This might be causing issues when technician_jobs are deleted

-- Check the constraint on technician_job_id
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'job_technician_admin_messages'::regclass
    AND contype = 'f'
    AND (
        -- Check if it references technician_jobs
        confrelid = 'technician_jobs'::regclass
        OR pg_get_constraintdef(oid) ILIKE '%technician_jobs%'
    );

-- Check if there are any triggers that might delete messages when technician_job_id changes
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'job_technician_admin_messages'
    AND (
        action_statement ILIKE '%DELETE%'
        OR action_statement ILIKE '%technician_job_id%'
    )
ORDER BY trigger_name;

-- Check if there are any triggers on technician_jobs that might affect messages
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'technician_jobs'
    AND (
        action_statement ILIKE '%job_technician_admin_messages%'
        OR action_statement ILIKE '%DELETE%message%'
    )
ORDER BY trigger_name;

