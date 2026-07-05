export async function logActivity(workerId, action, details) {
  try {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/logActivity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workerId,
        action,
        details
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('📝 Activity logged:', { action, details });
  } catch (error) {
    console.error('❌ Failed to log activity:', error);
  }
} 