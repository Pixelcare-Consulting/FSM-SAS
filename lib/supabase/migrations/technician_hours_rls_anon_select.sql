-- Portal reads Supabase with the anon key + app session cookies (not Supabase Auth JWT).
-- Without anon policies, SELECT on technician_hours returns 0 rows in the browser.

CREATE POLICY "Allow anon read technician_hours"
    ON technician_hours FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert technician_hours"
    ON technician_hours FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update technician_hours"
    ON technician_hours FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete technician_hours"
    ON technician_hours FOR DELETE TO anon USING (true);
