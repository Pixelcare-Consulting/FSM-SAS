/**
 * API endpoint to fetch Google Form responses
 * 
 * This endpoint fetches responses from a Google Form using the Google Forms API.
 * 
 * Form ID: 1hKxmEOkqvR9NWxju979x6xBVNOGU39pBe24hBLn0cWw
 * 
 * To use this API, you need to:
 * 1. Set up Google Cloud Project
 * 2. Enable Google Forms API
 * 3. Create Service Account or OAuth2 credentials
 * 4. Set environment variables:
 *    - GOOGLE_SERVICE_ACCOUNT_EMAIL
 *    - GOOGLE_PRIVATE_KEY (or path to key file)
 *    - GOOGLE_FORMS_FORM_ID
 *    - GOOGLE_API_KEY (optional, for public forms only)
 */

import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const FORM_ID = '1hKxmEOkqvR9NWxju979x6xBVNOGU39pBe24hBLn0cWw';
  

  try {
    // Check if Google Service Account credentials are configured
    // Note: Google Forms API requires OAuth2 (Service Account), not API keys
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    // If no credentials, return mock data for development
    if (!serviceAccountEmail || !privateKey) {
      console.warn('Google Service Account credentials not configured. Returning mock data.');
      return res.status(200).json({
        responses: getMockData(),
        total: 5,
        message: 'Using mock data. Configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY for real data.'
      });
    }

    // Try to fetch from Google Forms API
    // Note: Google Forms API requires OAuth2 authentication (Service Account)
    // API keys are not supported for accessing form responses
    let responses = [];
    
    if (serviceAccountEmail && privateKey) {
      // Using Service Account (required for Google Forms API)
      responses = await fetchWithServiceAccount(FORM_ID, serviceAccountEmail, privateKey);
    } else {
      throw new Error('Service Account credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY) are required. Google Forms API does not support API keys for accessing form responses.');
    }

    res.status(200).json({
      responses,
      total: responses.length,
      formId: FORM_ID
    });

  } catch (error) {
    console.error('Error fetching Google Form responses:', error);
    
    // Return mock data on error for development
    res.status(200).json({
      responses: getMockData(),
      total: 5,
      error: error.message,
      message: 'Using mock data due to API error. Check Google API configuration.'
    });
  }
}

/**
 * Fetch form responses using API Key
 */
async function fetchWithApiKey(formId, apiKey) {
  // API keys should be passed as query parameter, not Bearer token
  const apiUrl = `https://forms.googleapis.com/v1/forms/${formId}/responses?key=${apiKey}`;
  
  const response = await fetch(apiUrl, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Forms API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return transformGoogleFormResponses(data);
}

/**
 * Fetch with Service Account using JWT authentication
 */
async function fetchWithServiceAccount(formId, serviceAccountEmail, privateKey) {
  // Generate JWT token for service account
  const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
  
  // First, fetch the form structure to map question IDs to field names
  const formUrl = `https://forms.googleapis.com/v1/forms/${formId}`;
  const formResponse = await fetch(formUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  let questionIdMap = {};
  if (formResponse.ok) {
    const formData = await formResponse.json();
    console.log('=== FORM STRUCTURE DEBUG ===');
    console.log('Form data keys:', Object.keys(formData));
    console.log('Form items count:', formData.items?.length || 0);
    
    // Map question IDs to field names based on question titles
    if (formData.items) {
      console.log('\n=== FORM ITEMS ===');
      formData.items.forEach((item, index) => {
        // Extract question ID from the correct path
        const questionId = item.questionItem?.question?.questionId;
        const title = item.title || '';
        const description = item.description || '';
        const questionType = item.questionItem?.question?.choiceQuestion?.type || 
                           item.questionItem?.question?.textQuestion ? 'TEXT' : 
                           item.questionItem?.question?.dateQuestion ? 'DATE' : 
                           'unknown';
        
        console.log(`\nItem ${index + 1}:`);
        console.log('  Title:', title);
        console.log('  Question ID:', questionId);
        console.log('  Question Type:', questionType);
        console.log('  Description:', description);
        
        // Only process items that have a question ID (skip image items, etc.)
        if (!questionId) {
          console.log('  ✗ Skipped (no question ID)');
          return;
        }
        
        const titleLower = title.toLowerCase().trim();
        
        // Map based on question title patterns (more specific matches first)
        if (titleLower.includes('email') && !questionIdMap['email']) {
          questionIdMap['email'] = questionId;
          console.log('  ✓ Mapped to: email');
        } else if (titleLower.includes('block') && !questionIdMap['block']) {
          questionIdMap['block'] = questionId;
          console.log('  ✓ Mapped to: block');
        } else if (titleLower.includes('unit') && !questionIdMap['unit']) {
          questionIdMap['unit'] = questionId;
          console.log('  ✓ Mapped to: unit');
        } else if ((titleLower.includes('address') || titleLower.includes('location')) && !questionIdMap['address']) {
          questionIdMap['address'] = questionId;
          console.log('  ✓ Mapped to: address');
        } else if (titleLower.includes('salutation') && !questionIdMap['salutation']) {
          questionIdMap['salutation'] = questionId;
          console.log('  ✓ Mapped to: salutation');
        } else if ((titleLower.includes('full name') || (titleLower.includes('name') && !titleLower.includes('email'))) && !questionIdMap['fullName']) {
          questionIdMap['fullName'] = questionId;
          console.log('  ✓ Mapped to: fullName');
        } else if ((titleLower.includes('handphone') || titleLower.includes('phone') || titleLower.includes('mobile')) && !questionIdMap['handphone']) {
          questionIdMap['handphone'] = questionId;
          console.log('  ✓ Mapped to: handphone');
        } else if (titleLower.includes('first service') && !questionIdMap['firstServiceDate']) {
          questionIdMap['firstServiceDate'] = questionId;
          console.log('  ✓ Mapped to: firstServiceDate');
        } else if (titleLower.includes('second service') && !questionIdMap['secondServiceDate']) {
          questionIdMap['secondServiceDate'] = questionId;
          console.log('  ✓ Mapped to: secondServiceDate');
        } else if (titleLower.includes('third service') && !questionIdMap['thirdServiceDate']) {
          questionIdMap['thirdServiceDate'] = questionId;
          console.log('  ✓ Mapped to: thirdServiceDate');
        } else if (titleLower.includes('fourth service') && !questionIdMap['fourthServiceDate']) {
          questionIdMap['fourthServiceDate'] = questionId;
          console.log('  ✓ Mapped to: fourthServiceDate');
        } else if (titleLower.includes('time slot') && !questionIdMap['timeSlot']) {
          questionIdMap['timeSlot'] = questionId;
          console.log('  ✓ Mapped to: timeSlot');
        } else if ((titleLower.includes('terms') || titleLower.includes('agree') || titleLower.includes('complimentary service terms')) && !questionIdMap['agreedToTerms']) {
          questionIdMap['agreedToTerms'] = questionId;
          console.log('  ✓ Mapped to: agreedToTerms');
        } else if ((titleLower.includes('consent') || titleLower.includes('personal information')) && !questionIdMap['personalInfoConsent']) {
          questionIdMap['personalInfoConsent'] = questionId;
          console.log('  ✓ Mapped to: personalInfoConsent');
        } else {
          console.log('  ✗ No mapping found');
        }
      });
      
      console.log('\n=== FINAL QUESTION ID MAPPING ===');
      console.log(JSON.stringify(questionIdMap, null, 2));
    } else {
      console.log('No items found in form data');
      console.log('Form data structure:', JSON.stringify(formData, null, 2));
    }
  } else {
    console.log('Failed to fetch form structure:', formResponse.status, formResponse.statusText);
  }
  
  // Fetch responses
  const apiUrl = `https://forms.googleapis.com/v1/forms/${formId}/responses`;
  const response = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Google Forms API error: ${response.status} ${response.statusText}`;
    
    if (response.status === 403) {
      errorMessage += `\n\n⚠️ Insufficient authentication scopes or permissions.\n` +
        `Please ensure:\n` +
        `1. The form is shared with the service account: ${serviceAccountEmail}\n` +
        `2. The OAuth scopes are correctly configured\n` +
        `3. The Google Forms API is enabled in your Google Cloud project`;
    } else if (response.status === 404) {
      errorMessage += `\n\n⚠️ Form responses not found.\n` +
        `Please ensure:\n` +
        `1. The form ID is correct: ${formId}\n` +
        `2. The form is shared with the service account: ${serviceAccountEmail}\n` +
        `3. The form has responses to fetch`;
    }
    
    errorMessage += `\n\nAPI Response: ${errorText}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return transformGoogleFormResponses(data, questionIdMap);
}

/**
 * Get OAuth 2.0 access token using Service Account JWT
 */
async function getAccessToken(serviceAccountEmail, privateKey) {
  if (!privateKey) {
    throw new Error('Private key is required for Service Account authentication');
  }

  // Clean and format the private key
  let cleanPrivateKey = privateKey.trim();
  
  // Handle escaped newlines (from environment variables)
  cleanPrivateKey = cleanPrivateKey.replace(/\\n/g, '\n');
  
  // Ensure the key has proper BEGIN/END markers
  if (!cleanPrivateKey.includes('BEGIN PRIVATE KEY') && !cleanPrivateKey.includes('BEGIN RSA PRIVATE KEY')) {
    // If the key doesn't have markers, it might be just the key content
    // Try to reconstruct it (assuming it's a standard format)
    if (!cleanPrivateKey.startsWith('-----BEGIN')) {
      cleanPrivateKey = `-----BEGIN PRIVATE KEY-----\n${cleanPrivateKey}\n-----END PRIVATE KEY-----`;
    }
  }
  
  // Validate the key format
  if (!cleanPrivateKey.includes('BEGIN') || !cleanPrivateKey.includes('END')) {
    throw new Error('Invalid private key format. The key must include BEGIN and END markers.');
  }

  // Create JWT claim set
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600, // Token expires in 1 hour
    // Request scopes for Google Forms API
    // Using the broader scope that includes both form body and responses access
    scope: 'https://www.googleapis.com/auth/forms.body.readonly https://www.googleapis.com/auth/forms.responses.readonly'
  };

  try {
    // Sign JWT
    const jwtToken = jwt.sign(claimSet, cleanPrivateKey, {
      algorithm: 'RS256'
    });

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to get access token: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    // Debug: Log the scopes that were granted (if available)
    if (tokenData.scope) {
      console.log('Access token scopes:', tokenData.scope);
    }
    
    return tokenData.access_token;
  } catch (error) {
    if (error.message.includes('asymmetric key')) {
      throw new Error(`Invalid private key format: The key must be a valid RSA private key. Please check your GOOGLE_PRIVATE_KEY environment variable. Original error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Transform Google Forms API response to our format
 */
function transformGoogleFormResponses(apiData, questionIdMap = {}) {
  if (!apiData.responses || !Array.isArray(apiData.responses)) {
    console.log('No responses found in API data');
    return [];
  }

  console.log('\n=== RESPONSES DEBUG ===');
  console.log('Total responses:', apiData.responses.length);
  console.log('Question ID Map:', JSON.stringify(questionIdMap, null, 2));

  // Helper function to find unmapped dates
  const findUnmappedDates = (answers, questionIdMap) => {
    const dateFields = {
      firstServiceDate: null,
      secondServiceDate: null,
      thirdServiceDate: null,
      fourthServiceDate: null
    };
    
    // Get all question IDs that aren't already mapped
    const unmappedIds = Object.keys(answers).filter(id => 
      !Object.values(questionIdMap).includes(id)
    );
    
    // Find date-like answers (YYYY-MM-DD format)
    const dateAnswers = [];
    unmappedIds.forEach(id => {
      const answer = answers[id];
      if (answer.textAnswers && answer.textAnswers.answers && answer.textAnswers.answers.length > 0) {
        const value = answer.textAnswers.answers[0].value;
        // Check if it's a date in YYYY-MM-DD format
        if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          dateAnswers.push({ id, value });
        }
      }
    });
    
    // Sort dates chronologically and assign to service dates if not already mapped
    dateAnswers.sort((a, b) => a.value.localeCompare(b.value));
    
    if (!questionIdMap['firstServiceDate'] && dateAnswers[0]) {
      dateFields.firstServiceDate = dateAnswers[0].value;
    }
    if (!questionIdMap['secondServiceDate'] && dateAnswers[1]) {
      dateFields.secondServiceDate = dateAnswers[1].value;
    }
    if (!questionIdMap['thirdServiceDate'] && dateAnswers[2]) {
      dateFields.thirdServiceDate = dateAnswers[2].value;
    }
    if (!questionIdMap['fourthServiceDate'] && dateAnswers[3]) {
      dateFields.fourthServiceDate = dateAnswers[3].value;
    }
    
    return dateFields;
  };

  return apiData.responses.map((response, index) => {
    const answers = response.answers || {};
    const timestamp = response.createTime || new Date().toISOString();
    
    console.log(`\n--- Response ${index + 1} ---`);
    console.log('Response ID:', response.responseId);
    console.log('Respondent Email:', response.respondentEmail);
    console.log('Timestamp:', timestamp);
    console.log('Available answer question IDs:', Object.keys(answers));
    
    // Log each answer
    Object.keys(answers).forEach(qId => {
      const answer = answers[qId];
      console.log(`  Question ID ${qId}:`, {
        textAnswers: answer.textAnswers?.answers?.[0]?.value,
        choiceAnswers: answer.choiceAnswers?.answers?.[0]?.value,
        dateAnswers: answer.dateAnswers?.answers?.[0]?.value,
        fullAnswer: JSON.stringify(answer, null, 2)
      });
    });
    
    // Use respondentEmail if available (from form settings)
    const email = response.respondentEmail || extractAnswerByQuestionId(answers, questionIdMap['email']) || '-';
    
    const block = extractAnswerByQuestionId(answers, questionIdMap['block']) || '-';
    const unit = extractAnswerByQuestionId(answers, questionIdMap['unit']) || '-';
    const address = extractAnswerByQuestionId(answers, questionIdMap['address']) || '-';
    const salutation = extractAnswerByQuestionId(answers, questionIdMap['salutation']) || '-';
    const fullName = extractAnswerByQuestionId(answers, questionIdMap['fullName']) || '-';
    const handphone = extractAnswerByQuestionId(answers, questionIdMap['handphone']) || '-';
    
    // Try to get service dates from mapped question IDs first
    let firstServiceDate = extractAnswerByQuestionId(answers, questionIdMap['firstServiceDate']) || '-';
    let secondServiceDate = extractAnswerByQuestionId(answers, questionIdMap['secondServiceDate']) || '-';
    let thirdServiceDate = extractAnswerByQuestionId(answers, questionIdMap['thirdServiceDate']) || '-';
    let fourthServiceDate = extractAnswerByQuestionId(answers, questionIdMap['fourthServiceDate']) || '-';
    
    // If some dates are missing, try to find them from unmapped questions
    if (firstServiceDate === '-' || secondServiceDate === '-' || thirdServiceDate === '-' || fourthServiceDate === '-') {
      const unmappedDates = findUnmappedDates(answers, questionIdMap);
      if (firstServiceDate === '-' && unmappedDates.firstServiceDate) {
        firstServiceDate = unmappedDates.firstServiceDate;
      }
      if (secondServiceDate === '-' && unmappedDates.secondServiceDate) {
        secondServiceDate = unmappedDates.secondServiceDate;
      }
      if (thirdServiceDate === '-' && unmappedDates.thirdServiceDate) {
        thirdServiceDate = unmappedDates.thirdServiceDate;
      }
      if (fourthServiceDate === '-' && unmappedDates.fourthServiceDate) {
        fourthServiceDate = unmappedDates.fourthServiceDate;
      }
    }
    
    const timeSlot = extractAnswerByQuestionId(answers, questionIdMap['timeSlot']) || '-';
    
    // For consent fields, check if the answer exists (even if it's a long text)
    const agreedToTermsAnswer = extractAnswerByQuestionId(answers, questionIdMap['agreedToTerms']);
    const agreedToTerms = agreedToTermsAnswer && agreedToTermsAnswer !== '-' && agreedToTermsAnswer.trim().length > 0 ? 'Yes' : 'No';
    
    const personalInfoConsentAnswer = extractAnswerByQuestionId(answers, questionIdMap['personalInfoConsent']);
    const personalInfoConsent = personalInfoConsentAnswer && personalInfoConsentAnswer !== '-' && personalInfoConsentAnswer.trim().length > 0 ? 'Yes' : 'No';

    console.log('Extracted values:', {
      email,
      block,
      unit,
      address,
      salutation,
      fullName,
      handphone,
      firstServiceDate,
      timeSlot
    });

    // Build detailed answers object for the view modal
    const detailedAnswers = {};
    Object.keys(answers).forEach(qId => {
      const answer = answers[qId];
      const questionInfo = questionIdMap ? Object.entries(questionIdMap).find(([_, id]) => id === qId)?.[0] : null;
      
      detailedAnswers[qId] = {
        questionId: qId,
        questionField: questionInfo || 'Unknown',
        textAnswers: answer.textAnswers?.answers?.map(a => a.value) || [],
        choiceAnswers: answer.choiceAnswers?.answers?.map(a => a.value) || [],
        dateAnswers: answer.dateAnswers?.answers?.map(a => {
          if (a.value) {
            const date = a.value;
            if (date.year && date.month && date.day) {
              return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
            }
          }
          return null;
        }).filter(Boolean) || [],
        timeAnswers: answer.timeAnswers?.answers?.map(a => {
          if (a.value) {
            const time = a.value;
            if (time.hours !== undefined && time.minutes !== undefined) {
              return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
            }
          }
          return null;
        }).filter(Boolean) || [],
        fullAnswer: answer
      };
    });

    return {
      id: response.responseId || `response-${index}`,
      timestamp,
      email,
      block,
      unit,
      address,
      salutation,
      fullName,
      handphone,
      firstServiceDate,
      secondServiceDate,
      thirdServiceDate,
      fourthServiceDate,
      timeSlot,
      agreedToTerms,
      personalInfoConsent,
      // Include detailed response data for the view modal
      responseId: response.responseId,
      respondentEmail: response.respondentEmail,
      detailedAnswers,
      questionIdMap
    };
  });
}

/**
 * Extract answer value from Google Forms response by question ID
 */
function extractAnswerByQuestionId(answers, questionId) {
  if (!questionId || !answers[questionId]) {
    return null;
  }
  
  const answer = answers[questionId];
  
  // Handle text answers
  if (answer.textAnswers && answer.textAnswers.answers && answer.textAnswers.answers.length > 0) {
    return answer.textAnswers.answers[0].value || '';
  }
  
  // Handle choice answers (dropdown, multiple choice, etc.)
  if (answer.choiceAnswers && answer.choiceAnswers.answers && answer.choiceAnswers.answers.length > 0) {
    return answer.choiceAnswers.answers[0].value || '';
  }
  
  // Handle date answers
  if (answer.dateAnswers && answer.dateAnswers.answers && answer.dateAnswers.answers.length > 0) {
    const date = answer.dateAnswers.answers[0].value;
    if (date.year && date.month && date.day) {
      // Format as YYYY-MM-DD
      return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    }
    return '';
  }
  
  return null;
}

/**
 * Extract answer value from Google Forms response (legacy - for backward compatibility)
 */
function extractAnswer(answers, questionId) {
  // Try to find answer by iterating through all answers
  for (const key in answers) {
    const answer = answers[key];
    if (answer.textAnswers) {
      return answer.textAnswers.answers?.[0]?.value || '';
    }
    if (answer.choiceAnswers) {
      return answer.choiceAnswers.answers?.[0]?.value || '';
    }
    if (answer.dateAnswers) {
      const date = answer.dateAnswers.answers?.[0]?.value;
      if (date && date.year && date.month && date.day) {
        return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

/**
 * Mock data for development/testing
 */
function getMockData() {
  return [
    {
      id: 'mock-1',
      timestamp: new Date('2024-01-15T10:30:00').toISOString(),
      email: 'john.doe@example.com',
      block: '3',
      unit: '#05-03',
      salutation: 'Mr',
      fullName: 'JOHN DOE',
      handphone: '+65 9123 4567',
      firstServiceDate: '2024-02-01',
      secondServiceDate: '2024-03-01',
      thirdServiceDate: '2024-04-01',
      fourthServiceDate: '2024-05-01',
      timeSlot: 'AM - Time Slot: 9.30am - 12.30pm',
      agreedToTerms: 'Yes',
      personalInfoConsent: 'Yes'
    },
    {
      id: 'mock-2',
      timestamp: new Date('2024-01-16T14:20:00').toISOString(),
      email: 'jane.smith@example.com',
      block: '5',
      unit: '#10-15',
      salutation: 'Ms',
      fullName: 'JANE SMITH',
      handphone: '+65 9876 5432',
      firstServiceDate: '2024-02-05',
      secondServiceDate: '2024-03-05',
      thirdServiceDate: '2024-04-05',
      fourthServiceDate: '2024-05-05',
      timeSlot: 'PM - Time Slot: 1.30pm - 5.00pm',
      agreedToTerms: 'Yes',
      personalInfoConsent: 'Yes'
    },
    {
      id: 'mock-3',
      timestamp: new Date('2024-01-17T09:15:00').toISOString(),
      email: 'robert.wong@example.com',
      block: '7',
      unit: '#08-22',
      salutation: 'Mr',
      fullName: 'ROBERT WONG',
      handphone: '+65 9234 5678',
      firstServiceDate: '2024-02-10',
      secondServiceDate: '2024-03-10',
      thirdServiceDate: '2024-04-10',
      fourthServiceDate: '2024-05-10',
      timeSlot: 'AM - Time Slot: 9.30am - 12.30pm',
      agreedToTerms: 'Yes',
      personalInfoConsent: 'Yes'
    },
    {
      id: 'mock-4',
      timestamp: new Date('2024-01-18T16:45:00').toISOString(),
      email: 'sarah.tan@example.com',
      block: '9',
      unit: '#12-08',
      salutation: 'Ms',
      fullName: 'SARAH TAN',
      handphone: '+65 9456 7890',
      firstServiceDate: '2024-02-15',
      secondServiceDate: '2024-03-15',
      thirdServiceDate: '2024-04-15',
      fourthServiceDate: '2024-05-15',
      timeSlot: 'PM - Time Slot: 1.30pm - 5.00pm',
      agreedToTerms: 'Yes',
      personalInfoConsent: 'Yes'
    },
    {
      id: 'mock-5',
      timestamp: new Date('2024-01-19T11:30:00').toISOString(),
      email: 'michael.lee@example.com',
      block: '11',
      unit: '#15-11',
      salutation: 'Mr',
      fullName: 'MICHAEL LEE',
      handphone: '+65 9567 8901',
      firstServiceDate: '2024-02-20',
      secondServiceDate: '2024-03-20',
      thirdServiceDate: '2024-04-20',
      fourthServiceDate: '2024-05-20',
      timeSlot: 'AM - Time Slot: 9.30am - 12.30pm',
      agreedToTerms: 'Yes',
      personalInfoConsent: 'Yes'
    }
  ];
}

