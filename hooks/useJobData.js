import { useState, useEffect } from 'react';
import { jobService } from '../lib/supabase/database';

export const useJobData = (jobId) => {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchJob = async () => {
      if (!jobId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const jobData = await jobService.findById(jobId);
        if (jobData) {
          setJob(jobData);
        }
      } catch (err) {
        setError(err);
        console.error("Error fetching job:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [jobId]);

  return { job, loading, error };
}; 