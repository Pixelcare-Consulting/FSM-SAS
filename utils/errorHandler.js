// utils/errorHandler.js
import { toast } from 'react-toastify';
import Router from 'next/router';

export const handleAPIError = (error) => {
  // Check if error is a redirect to sign-in
  if (error.response?.status === 401 || error.response?.status === 403) {
    toast.error('Your session has expired. Please sign in again.', {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    Router.push('/sign-in');
    return;
  }

  // Handle network errors
  if (error.message?.includes('Network') || error.response?.status === 503) {
    toast.error('Unable to connect to the server. Please check your connection.', {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  // Handle invalid JSON responses
  if (error.message?.includes('JSON') || error.message?.includes('Unexpected token')) {
    toast.error('There was an issue with the server response. Please try again.', {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  // Default error message
  toast.error(error.response?.data?.message || 'An unexpected error occurred. Please try again.', {
    position: "top-right",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  });
};

// Optional: Create a wrapped fetch function with error handling
export const fetchWithErrorHandling = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    handleAPIError(error);
    throw error; // Re-throw to allow caller to handle if needed
  }
};