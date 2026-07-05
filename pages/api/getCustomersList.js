// pages/api/getCustomersList.js
// Customer List API Endpoint - Direct SAP API with address expansion
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import {
  buildTokenizedHeaderAddressMatch,
  getMeaningfulAddressSearchTokens
} from '../../lib/odata/sapBPAddressODataClauses';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;
  const {
    page = 1,
    limit = 100,
    search = '',
    customerCode = '',
    customerName = '',
    email = '',
    phone = '',
    contractStatus = '',
    country = '',
    status = '',
    address = ''
  } = req.query;

  // Note: Address filtering is handled client-side in the frontend
  // This allows for more flexible searching across all address fields
  if (address) {
    console.log('Address filter received (will be ignored - handled client-side):', address);
  }

  let b1session = req.cookies.B1SESSION;
  let routeid = req.cookies.ROUTEID;

  if (!b1session || !routeid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Helper function to escape OData string values
  const escapeODataString = (str) => {
    if (!str) return '';
    // In OData, single quotes need to be escaped by doubling them
    return str.replace(/'/g, "''");
  };

  try {
    const skip = (page - 1) * limit;

    // Build filter conditions
    let filterConditions = [];

    if (customerCode) {
      filterConditions.push(`contains(CardCode, '${escapeODataString(customerCode)}')`);
    }
    if (customerName) {
      filterConditions.push(`contains(CardName, '${escapeODataString(customerName)}')`);
    }
    if (email) {
      filterConditions.push(`contains(EmailAddress, '${escapeODataString(email)}')`);
    }
    if (phone) {
      filterConditions.push(`contains(Phone1, '${escapeODataString(phone)}')`);
    }
    if (contractStatus) {
      filterConditions.push(`U_Contract eq '${escapeODataString(contractStatus)}'`);
    }
    if (country) {
      filterConditions.push(`Country eq '${escapeODataString(country)}'`);
    }
    if (status) {
      filterConditions.push(`Valid eq '${status === 'active' ? 'Y' : 'N'}'`);
    }
    // Address filter is NOT applied at API level - handled client-side for better flexibility
    // if (address) {
    //   const escapedAddress = escapeODataString(address);
    //   filterConditions.push(`(contains(Address, '${escapedAddress}') or contains(MailAddress, '${escapedAddress}') or contains(Street, '${escapedAddress}') or contains(ZipCode, '${escapedAddress}') or contains(Building, '${escapedAddress}') or contains(BillToBuildingFloorRoom, '${escapedAddress}'))`);
    // }

    // If there's a general search term, match code/name, email, phones, and/or address tokens
    // (aligns with global search + customers list: name, handphone, address, email)
    if (search) {
      const escapedSearch = escapeODataString(search);
      const addressTokens = getMeaningfulAddressSearchTokens(search);
      const addressTokenClause = buildTokenizedHeaderAddressMatch(
        addressTokens,
        escapeODataString
      );
      const codeNameMatch = `(contains(CardCode, '${escapedSearch}') or contains(CardName, '${escapedSearch}'))`;
      const contactMatch = `(contains(EmailAddress, '${escapedSearch}') or contains(Phone1, '${escapedSearch}') or contains(Cellular, '${escapedSearch}'))`;
      const core = addressTokenClause
        ? `(${codeNameMatch} or ${contactMatch} or (${addressTokenClause}))`
        : `(${codeNameMatch} or ${contactMatch})`;
      filterConditions.push(core);
    }

    // Combine all conditions with 'and'
    const filterQuery = filterConditions.length > 0
      ? `$filter=${filterConditions.join(' and ')}`
      : '';

    // Debug log to show filter conditions
    console.log('Filter query (address handled client-side):', filterQuery);

    // Try different approaches for address expansion
    // First try with BPAddresses, if that fails, try without expansion
    const orderQuery = '$orderby=CardCode asc';

    // Build URL with proper encoding for the filter query
    let url = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners?$skip=${skip}&$top=${limit}&${orderQuery}`;
    if (filterQuery) {
      // URL encode the filter query to handle special characters
      url += '&' + encodeURI(filterQuery);
    }

    console.log('SAP API URL (without expansion):', url); // Debug log

    // Fetch the business partners using the session cookies
    const queryResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
      }
    });

    if (!queryResponse.ok) {
      // Try to parse as JSON, but handle HTML error pages
      let errorData;
      const contentType = queryResponse.headers.get('content-type') || '';
      
      try {
        if (contentType.includes('application/json')) {
          errorData = await queryResponse.json();
        } else {
          // If it's not JSON (likely HTML error page), get as text
          const errorText = await queryResponse.text();
          console.error('SAP API Error (non-JSON):', errorText.substring(0, 500));
          errorData = { 
            message: 'SAP API returned an error',
            status: queryResponse.status,
            statusText: queryResponse.statusText,
            details: errorText.substring(0, 500) // Limit to first 500 chars
          };
        }
      } catch (parseError) {
        // If parsing fails, get as text
        const errorText = await queryResponse.text();
        console.error('SAP API Error (parse failed):', errorText.substring(0, 500));
        errorData = { 
          message: 'Failed to parse SAP API error response',
          status: queryResponse.status,
          statusText: queryResponse.statusText,
          details: errorText.substring(0, 500)
        };
      }
      
      console.error('SAP API Error:', errorData);
      return res.status(queryResponse.status).json({ error: errorData });
    }

    const queryData = await queryResponse.json();
    console.log('SAP API Response - First customer:', queryData.value?.[0]); // Debug log

    // Configuration: Enable/disable address fetching
    const ENABLE_ADDRESS_FETCHING = false; // Set to false to disable address fetching

    let customersWithAddresses;
    let addressFetchingStatus = 'disabled';

    if (ENABLE_ADDRESS_FETCHING) {
      console.log('Address fetching is enabled, attempting to fetch addresses...');
      addressFetchingStatus = 'attempted';

      try {
        // Try to fetch addresses for a few customers first (limit to 5 for testing)
        const limitedCustomers = queryData.value.slice(0, 5);

        const testResults = await Promise.allSettled(
          limitedCustomers.map(async (customer) => {
            const addressUrl = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners('${customer.CardCode}')/BPAddresses`;
            const addressResponse = await fetch(addressUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
              }
            });

            if (!addressResponse.ok) {
              throw new Error(`HTTP ${addressResponse.status}`);
            }

            const addressData = await addressResponse.json();
            return {
              ...customer,
              BPAddresses: addressData.value || []
            };
          })
        );

        // Check if any address fetching succeeded
        const successfulFetches = testResults.filter(result => result.status === 'fulfilled');

        if (successfulFetches.length > 0) {
          console.log(`Address fetching successful for ${successfulFetches.length}/${limitedCustomers.length} customers`);
          addressFetchingStatus = 'successful';

          // If test successful, fetch for all customers
          customersWithAddresses = await Promise.all(
            queryData.value.map(async (customer) => {
              try {
                const addressUrl = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners('${customer.CardCode}')/BPAddresses`;
                const addressResponse = await fetch(addressUrl, {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
                  }
                });

                if (addressResponse.ok) {
                  const addressData = await addressResponse.json();
                  return {
                    ...customer,
                    BPAddresses: addressData.value || []
                  };
                }
              } catch (error) {
                // Silently handle individual failures
              }

              return {
                ...customer,
                BPAddresses: []
              };
            })
          );
        } else {
          console.warn('Address fetching failed for all test customers, falling back to customers without addresses');
          addressFetchingStatus = 'failed';
          customersWithAddresses = queryData.value.map(customer => ({
            ...customer,
            BPAddresses: []
          }));
        }
      } catch (error) {
        console.warn('Address fetching encountered an error, falling back to customers without addresses:', error.message);
        addressFetchingStatus = 'failed';
        customersWithAddresses = queryData.value.map(customer => ({
          ...customer,
          BPAddresses: []
        }));
      }
    } else {
      //console.log('Address fetching is disabled, returning customers without addresses');
      // Just return customers without addresses
      customersWithAddresses = queryData.value.map(customer => ({
        ...customer,
        BPAddresses: []
      }));
    }

    // Get total count with proper URL encoding
    let countUrl = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners/$count`;
    if (filterQuery) {
      countUrl += '?' + encodeURI(filterQuery);
    }
    const countResponse = await fetch(countUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
      }
    });

    const totalCount = await countResponse.json();

    // Return the API response with metadata about address fetching
    res.status(200).json({
      customers: customersWithAddresses,
      totalCount: totalCount,
      meta: {
        addressFetching: addressFetchingStatus,
        hasAddressData: customersWithAddresses.some(customer => customer.BPAddresses && customer.BPAddresses.length > 0)
      }
    });
  } catch (error) {
    console.error('Error fetching business partners:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}