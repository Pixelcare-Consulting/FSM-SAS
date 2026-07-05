# Additional Tables Needed for Supabase Migration

Based on the migration, you'll need to create these additional tables in Supabase that aren't in your original schema:

## 1. Notifications Table

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type VARCHAR(50),
    read BOOLEAN DEFAULT false,
    hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_worker_id ON notifications(worker_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_hidden ON notifications(hidden);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
```

## 2. Recent Activities Table

```sql
CREATE TABLE recent_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    details JSONB,
    type VARCHAR(50) DEFAULT 'session_management',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recent_activities_worker_id ON recent_activities(worker_id);
CREATE INDEX idx_recent_activities_timestamp ON recent_activities(timestamp);
CREATE INDEX idx_recent_activities_action ON recent_activities(action);
```

## 3. Company Details Table

```sql
CREATE TABLE company_details (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    logo TEXT,
    address TEXT,
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_company_details_updated_at BEFORE UPDATE ON company_details
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## 4. Worker Documents (Optional - Better Structure)

If you want to store worker documents in a separate table instead of JSONB in users table:

```sql
CREATE TABLE worker_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    type VARCHAR(100),
    size INTEGER,
    path TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_worker_documents_worker_id ON worker_documents(worker_id);
```

## 5. Job Images Metadata (Optional)

If you want to store job image metadata in a table:

```sql
CREATE TABLE job_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    path TEXT,
    size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_job_images_job_id ON job_images(job_id);
```

## Notes

- The `notifications` table is required for the notification system
- The `recent_activities` table is required for activity logging
- The `company_details` table is required for company information
- Worker documents and job images can be stored in JSONB columns or separate tables (separate tables are recommended for better querying)

