// utils/fetchCustomers.js

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchCustomers = async (page = 1, limit = 10, search = '', initialLoad = 'true') => {
  let retries = 0;
  let lastError = null;

  while (retries < MAX_RETRIES) {
    try {
      const timestamp = new Date().getTime();
      const url = `/api/getCustomersList?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&_=${timestamp}&initialLoad=${initialLoad}`;
      
      console.log(`Fetching customers (attempt ${retries + 1}):`, url);
      
      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      console.log(`Response status (attempt ${retries + 1}):`, response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error response content:`, errorText);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`Fetched data:`, data);
      
      return {
        customers: data.customers || [],
        totalCount: data.totalCount || 0
      };
    } catch (error) {
      console.error(`Attempt ${retries + 1} failed:`, error);
      lastError = error;
      retries++;
      
      if (retries < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY}ms...`);
        await sleep(RETRY_DELAY);
      }
    }
  }

  throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
};