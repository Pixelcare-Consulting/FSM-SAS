export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { activity, timestamp, workerId, path } = req.body;

    // Validate required fields
    if (!activity || !workerId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Log the activity (you can customize this based on your needs)
    console.log(`Activity logged: ${activity} by ${workerId} at ${timestamp} on ${path}`);

    // Here you could also save to database if needed

    return res.status(200).json({ message: 'Activity logged successfully' });
  } catch (error) {
    console.error('Error logging activity:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
} 