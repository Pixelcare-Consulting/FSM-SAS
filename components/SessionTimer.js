import { useState, useEffect } from 'react';
import { 
  formatTimeRemaining, 
  checkAndRenewSession,
  getSessionExpiryTime,
  setSessionExpiryTime 
} from '../utils/middlewareClient';

export const SessionTimer = () => {
  const [timeRemaining, setTimeRemaining] = useState(20 * 60 * 1000);

  useEffect(() => {
    // Initialize session expiry time if not exists
    if (!getSessionExpiryTime()) {
      const initialExpiryTime = Date.now() + (20 * 60 * 1000);
      setSessionExpiryTime(initialExpiryTime);
      console.log('🎬 Initial session expiry set to:', new Date(initialExpiryTime).toLocaleString());
    }

    const updateTimer = async () => {
      const expiryTime = getSessionExpiryTime();
      if (!expiryTime) {
        console.warn('⚠️ No expiry time found in storage');
        return;
      }

      const remaining = expiryTime - Date.now();
      console.log('⏱️ Current countdown:', formatTimeRemaining(remaining));
      setTimeRemaining(remaining);

      // Log when approaching renewal threshold
      if (remaining < 6 * 60 * 1000 && remaining > 5 * 60 * 1000) {
        console.log('⚡ Approaching renewal threshold...');
      }

      // If less than 5 minutes remaining, attempt to renew
      if (remaining < 5 * 60 * 1000) {
        console.log('🔄 Attempting session renewal...');
        try {
          const response = await fetch('/api/renewSAPB1Session', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (response.ok) {
            const newExpiryTime = Date.now() + (20 * 60 * 1000);
            console.log('✅ Session renewed successfully!');
            console.log('📅 Old expiry:', new Date(expiryTime).toLocaleString());
            console.log('📅 New expiry:', new Date(newExpiryTime).toLocaleString());
            
            setSessionExpiryTime(newExpiryTime);
            document.cookie = `B1SESSION_EXPIRY=${new Date(newExpiryTime).toISOString()}; path=/`;
            setTimeRemaining(20 * 60 * 1000);
          } else {
            console.error('❌ Session renewal failed', await response.text());
          }
        } catch (error) {
          console.error('💥 Session renewal error:', error);
        }
      }
    };

    console.log('🚀 Starting session timer...');
    
    // Run timer every second
    const interval = setInterval(() => {
      console.log('🔄 Timer tick at:', new Date().toLocaleTimeString());
      updateTimer();
    }, 1000);

    // Cleanup
    return () => {
      clearInterval(interval);
      console.log('🧹 Timer cleanup completed');
    };
  }, []);

  return (
    <div className="session-info">
      <div className="info-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v2m0 16v2M4 12H2m20 0h-2"/>
        </svg>
        <span>SAP B1 Session expires in: <span id="sessionCountdown">{formatTimeRemaining(timeRemaining)}</span></span>
      </div>
    </div>
  );
}; 