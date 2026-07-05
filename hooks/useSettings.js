import { useState, useEffect } from 'react';

export const useSettings = () => {
  const [settings, setSettings] = useState({
    isLoading: true,
    error: null,
    data: null
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Add your settings loading logic here if needed
        setSettings({
          isLoading: false,
          error: null,
          data: {}
        });
      } catch (error) {
        setSettings({
          isLoading: false,
          error: error.message,
          data: null
        });
      }
    };

    loadSettings();
  }, []);

  return { settings };
}; 