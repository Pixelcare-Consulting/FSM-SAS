// pages/api/getLeadsList.js
// Leads List API Endpoint - SAP BusinessPartners with CardType eq 'L'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import {
  buildBPAddressesAnyClause,
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
    leadCode = '',
    leadName = '',
    email = '',
    phone = '',
    contactPerson = '',
    country = '',
    status = ''
  } = req.query;

  let b1session = req.cookies.B1SESSION;
  let routeid = req.cookies.ROUTEID;

  if (!b1session || !routeid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const escapeODataString = (str) => {
    if (!str) return '';
    return str.replace(/'/g, "''");
  };

  const buildLeadsUrl = (filterConditionsArr) => {
    const fq =
      filterConditionsArr.length > 0
        ? `$filter=${filterConditionsArr.join(' and ')}`
        : '';
    const orderQuery = '$orderby=CardCode asc';
    let u = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners?$skip=${(Number(page) - 1) * Number(limit)}&$top=${Number(limit)}&${orderQuery}`;
    if (fq) {
      u += '&' + encodeURI(fq);
    }
    u += '&$expand=BPAddresses';
    return u;
  };

  const buildBaseFilter = (includeBpaAny) => {
    const cond = ["CardType eq 'L'"];
    if (leadCode) {
      cond.push(`contains(CardCode, '${escapeODataString(leadCode)}')`);
    }
    if (leadName) {
      cond.push(`contains(CardName, '${escapeODataString(leadName)}')`);
    }
    if (email) {
      cond.push(`contains(EmailAddress, '${escapeODataString(email)}')`);
    }
    if (phone) {
      cond.push(`contains(Phone1, '${escapeODataString(phone)}')`);
    }
    if (contactPerson) {
      cond.push(`contains(ContactPerson, '${escapeODataString(contactPerson)}')`);
    }
    if (country) {
      cond.push(`Country eq '${escapeODataString(country)}'`);
    }
    if (status) {
      cond.push(`Valid eq '${status === 'active' ? 'Y' : 'N'}'`);
    }
    if (search) {
      const escapedSearch = escapeODataString(search);
      const tokens = getMeaningfulAddressSearchTokens(search);
      const addressTokenClause = buildTokenizedHeaderAddressMatch(tokens, escapeODataString);
      const bpaAnyClause = includeBpaAny ? buildBPAddressesAnyClause(tokens, escapeODataString) : null;
      const codeNameMatch = `(contains(CardCode, '${escapedSearch}') or contains(CardName, '${escapedSearch}'))`;
      const contactMatch = `(contains(EmailAddress, '${escapedSearch}') or contains(Phone1, '${escapedSearch}') or contains(Cellular, '${escapedSearch}'))`;
      const addressGroup = (() => {
        if (addressTokenClause && bpaAnyClause) {
          return `(${addressTokenClause} or ${bpaAnyClause})`;
        }
        return addressTokenClause || bpaAnyClause;
      })();
      const core = addressGroup
        ? `(${codeNameMatch} or ${contactMatch} or (${addressGroup}))`
        : `(${codeNameMatch} or ${contactMatch})`;
      cond.push(core);
    }
    return cond;
  };

  try {
    let filterConditions = buildBaseFilter(true);
    const filterQuery =
      filterConditions.length > 0
        ? `$filter=${filterConditions.join(' and ')}`
        : '';

    console.log('Leads filter query:', filterQuery);

    let url = buildLeadsUrl(filterConditions);
    console.log('SAP Leads API URL (with expand):', url);

    let queryResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
      }
    });

    if (!queryResponse.ok && search && queryResponse.status === 400) {
      const errText = await queryResponse.text();
      console.warn(
        'Leads query failed; retrying without BPAddresses/any (Service Layer may not support it):',
        errText.substring(0, 400)
      );
      filterConditions = buildBaseFilter(false);
      url = buildLeadsUrl(filterConditions);
      queryResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `B1SESSION=${b1session}; ROUTEID=${routeid}`
        }
      });
    }

    if (!queryResponse.ok) {
      let errorData;
      const contentType = queryResponse.headers.get('content-type') || '';
      
      try {
        if (contentType.includes('application/json')) {
          errorData = await queryResponse.json();
        } else {
          const errorText = await queryResponse.text();
          console.error('SAP API Error (non-JSON):', errorText.substring(0, 500));
          errorData = { 
            message: 'SAP API returned an error',
            status: queryResponse.status,
            statusText: queryResponse.statusText,
            details: errorText.substring(0, 500)
          };
        }
      } catch (parseError) {
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
    console.log('SAP Leads Response - Total in batch:', queryData.value?.length);

    const leads = queryData.value || [];

    const filterQueryForCount =
      filterConditions.length > 0
        ? `$filter=${filterConditions.join(' and ')}`
        : '';

    // Get total count for leads
    let countUrl = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners/$count`;
    if (filterQueryForCount) {
      countUrl += '?' + encodeURI(filterQueryForCount);
    }
    const countResponse = await fetch(countUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
      }
    });

    const totalCount = await countResponse.json();

    res.status(200).json({
      leads: leads,
      totalCount: totalCount,
      meta: {
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
