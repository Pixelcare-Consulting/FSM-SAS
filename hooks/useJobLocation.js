import { useState, useEffect } from 'react';

export const useJobLocation = (jobData) => {
  const [location, setLocation] = useState(null);

  useEffect(() => {
    if (jobData?.location?.coordinates) {
      const { latitude, longitude } = jobData.location.coordinates;
      if (latitude && longitude) {
        setLocation({ lat: latitude, lng: longitude });
      }
    }
  }, [jobData]);

  return location;
}; 