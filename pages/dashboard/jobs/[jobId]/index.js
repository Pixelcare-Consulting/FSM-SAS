import dynamic from 'next/dynamic';

const JobDetails = dynamic(() => import('../_components/JobDetailsPage'), {
  ssr: false,
  loading: () => (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
      <div className="mt-3">Loading job details...</div>
    </div>
  ),
});

export default JobDetails;

// Required so Next.js / Turbopack registers this dynamic route (flat [jobId].js was 404ing in dev).
export async function getServerSideProps(context) {
  const raw = context.params?.jobId;
  const jobId = Array.isArray(raw) ? raw[0] : raw;
  return {
    props: {
      jobId: typeof jobId === 'string' ? jobId : null,
    },
  };
}
