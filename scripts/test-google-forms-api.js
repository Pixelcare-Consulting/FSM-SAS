/**
 * Test script for Google Forms API integration
 * 
 * This script tests the service account authentication and API access
 * to help debug issues with the Google Forms API.
 * 
 * Usage: node scripts/test-google-forms-api.js
 */

require('dotenv').config({ path: '.env.local' });
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Configuration
// You can pass form ID as command line argument: node scripts/test-google-forms-api.js <FORM_ID>
const FORM_ID = process.argv[2] || '1hKxmEOkqvR9NWxju979x6xBVNOGU39pBe24hBLn0cWw';
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function main() {
  logSection('Google Forms API Test Script');
  
  // Step 1: Check environment variables
  logSection('Step 1: Checking Environment Variables');
  
  if (!SERVICE_ACCOUNT_EMAIL) {
    logError('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set in .env.local');
    process.exit(1);
  }
  logSuccess(`Service Account Email: ${SERVICE_ACCOUNT_EMAIL}`);
  
  if (!PRIVATE_KEY) {
    logError('GOOGLE_PRIVATE_KEY is not set in .env.local');
    process.exit(1);
  }
  logSuccess('Private Key is set');
  
  // Step 2: Validate private key format
  logSection('Step 2: Validating Private Key Format');
  
  let cleanPrivateKey = PRIVATE_KEY.trim().replace(/\\n/g, '\n');
  
  if (!cleanPrivateKey.includes('BEGIN PRIVATE KEY') && !cleanPrivateKey.includes('BEGIN RSA PRIVATE KEY')) {
    logError('Private key does not have proper BEGIN/END markers');
    process.exit(1);
  }
  logSuccess('Private key format is valid');
  
  // Step 3: Generate JWT token
  logSection('Step 3: Generating JWT Token');
  
  const now = Math.floor(Date.now() / 1000);
  // Include Drive API scope to check file permissions
  const scopes = 'https://www.googleapis.com/auth/forms.body.readonly https://www.googleapis.com/auth/forms.responses.readonly https://www.googleapis.com/auth/drive.readonly';
  
  const claimSet = {
    iss: SERVICE_ACCOUNT_EMAIL,
    sub: SERVICE_ACCOUNT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: scopes
  };
  
  logInfo(`Requesting scopes: ${scopes}`);
  
  let jwtToken;
  try {
    jwtToken = jwt.sign(claimSet, cleanPrivateKey, {
      algorithm: 'RS256'
    });
    logSuccess('JWT token generated successfully');
    logInfo(`JWT token length: ${jwtToken.length} characters`);
  } catch (error) {
    logError(`Failed to generate JWT token: ${error.message}`);
    process.exit(1);
  }
  
  // Step 4: Exchange JWT for access token
  logSection('Step 4: Exchanging JWT for Access Token');
  
  let accessToken;
  try {
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
      logError(`Failed to get access token: ${tokenResponse.status} ${tokenResponse.statusText}`);
      logError(`Response: ${errorText}`);
      process.exit(1);
    }
    
    const tokenData = await tokenResponse.json();
    accessToken = tokenData.access_token;
    
    logSuccess('Access token obtained successfully');
    logInfo(`Token expires in: ${tokenData.expires_in} seconds`);
    
    if (tokenData.scope) {
      logSuccess(`Granted scopes: ${tokenData.scope}`);
      const grantedScopes = tokenData.scope.split(' ');
      const requiredScopes = [
        'https://www.googleapis.com/auth/forms.body.readonly',
        'https://www.googleapis.com/auth/forms.responses.readonly'
      ];
      
      requiredScopes.forEach(required => {
        if (grantedScopes.includes(required)) {
          logSuccess(`  ✓ ${required}`);
        } else {
          logError(`  ✗ ${required} - MISSING!`);
        }
      });
    } else {
      logWarning('No scope information in token response');
      logInfo('This is normal for service accounts - scopes are granted based on JWT claims');
    }
    
    // Try to introspect the token to see what scopes it actually has
    try {
      const tokenInfoUrl = `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`;
      const tokenInfoResponse = await fetch(tokenInfoUrl);
      if (tokenInfoResponse.ok) {
        const tokenInfo = await tokenInfoResponse.json();
        if (tokenInfo.scope) {
          logInfo(`Token introspection shows scopes: ${tokenInfo.scope}`);
        }
        logInfo(`Token issued to: ${tokenInfo.issued_to || 'N/A'}`);
        logInfo(`Token audience: ${tokenInfo.audience || 'N/A'}`);
      }
    } catch (error) {
      // Token introspection failed, that's okay
    }
    
    logInfo(`Access token (first 20 chars): ${accessToken.substring(0, 20)}...`);
  } catch (error) {
    logError(`Error getting access token: ${error.message}`);
    process.exit(1);
  }
  
  // Step 5: Test form access
  logSection('Step 5: Testing Form Access');
  
  logInfo(`Form ID: ${FORM_ID}`);
  logInfo(`Form URL: https://docs.google.com/forms/d/e/${FORM_ID}/viewform`);
  
  try {
    const formUrl = `https://forms.googleapis.com/v1/forms/${FORM_ID}`;
    logInfo(`Testing: GET ${formUrl}`);
    
    const formResponse = await fetch(formUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (formResponse.ok) {
      const formData = await formResponse.json();
      logSuccess('Form access successful!');
      logInfo(`Form title: ${formData.info?.title || 'N/A'}`);
      logInfo(`Form document title: ${formData.info?.documentTitle || 'N/A'}`);
    } else {
      const errorText = await formResponse.text();
      logError(`Form access failed: ${formResponse.status} ${formResponse.statusText}`);
      logError(`Response: ${errorText}`);
      
      if (formResponse.status === 404) {
        logWarning('\nPossible causes:');
        logWarning('1. Form ID is incorrect');
        logWarning('2. Form is not shared with the service account');
        logWarning(`3. Service account email: ${SERVICE_ACCOUNT_EMAIL}`);
        logWarning('4. Wait a few minutes after sharing for permissions to propagate');
      } else if (formResponse.status === 403) {
        logWarning('\nPossible causes:');
        logWarning('1. Insufficient OAuth scopes');
        logWarning('2. Service account lacks necessary permissions');
        logWarning('3. Google Forms API not enabled in project');
      }
    }
  } catch (error) {
    logError(`Error accessing form: ${error.message}`);
  }
  
  // Step 6: Test responses access
  logSection('Step 6: Testing Responses Access');
  
  try {
    const responsesUrl = `https://forms.googleapis.com/v1/forms/${FORM_ID}/responses`;
    logInfo(`Testing: GET ${responsesUrl}`);
    
    const responsesResponse = await fetch(responsesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (responsesResponse.ok) {
      const responsesData = await responsesResponse.json();
      logSuccess('Responses access successful!');
      logInfo(`Total responses: ${responsesData.responses?.length || 0}`);
      
      if (responsesData.responses && responsesData.responses.length > 0) {
        logInfo('\nFirst response sample:');
        const firstResponse = responsesData.responses[0];
        console.log(JSON.stringify(firstResponse, null, 2).substring(0, 500) + '...');
      } else {
        logWarning('No responses found in the form');
      }
    } else {
      const errorText = await responsesResponse.text();
      logError(`Responses access failed: ${responsesResponse.status} ${responsesResponse.statusText}`);
      logError(`Response: ${errorText}`);
      
      if (responsesResponse.status === 404) {
        logWarning('\nPossible causes:');
        logWarning('1. Form ID is incorrect');
        logWarning('2. Form is not shared with the service account');
        logWarning(`3. Service account email: ${SERVICE_ACCOUNT_EMAIL}`);
        logWarning('4. Form has no responses');
        logWarning('5. Wait a few minutes after sharing for permissions to propagate');
      } else if (responsesResponse.status === 403) {
        logWarning('\nPossible causes:');
        logWarning('1. Insufficient OAuth scopes (need forms.responses.readonly)');
        logWarning('2. Service account lacks necessary permissions');
        logWarning('3. Google Forms API not enabled in project');
      }
    }
  } catch (error) {
    logError(`Error accessing responses: ${error.message}`);
  }
  
  // Step 7: Try accessing via Drive API (forms are stored in Drive)
  logSection('Step 7: Testing Drive API Access (Alternative Method)');
  
  logInfo('Forms are stored in Google Drive. Testing Drive API access...');
  
  try {
    // Try to get the form file via Drive API
    // The form file ID is the same as the form ID
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${FORM_ID}?fields=id,name,mimeType,permissions`;
    logInfo(`Testing: GET ${driveUrl}`);
    
    const driveResponse = await fetch(driveUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (driveResponse.ok) {
      const driveData = await driveResponse.json();
      logSuccess('Drive API access successful!');
      logInfo(`File name: ${driveData.name || 'N/A'}`);
      logInfo(`MIME type: ${driveData.mimeType || 'N/A'}`);
      
      if (driveData.permissions) {
        logInfo(`\nPermissions (${driveData.permissions.length}):`);
        driveData.permissions.forEach(perm => {
          logInfo(`  - ${perm.emailAddress || perm.id}: ${perm.role}`);
        });
        
        const hasServiceAccount = driveData.permissions.some(
          p => p.emailAddress === SERVICE_ACCOUNT_EMAIL
        );
        
        if (hasServiceAccount) {
          logSuccess(`Service account (${SERVICE_ACCOUNT_EMAIL}) has access via Drive`);
        } else {
          logError(`Service account (${SERVICE_ACCOUNT_EMAIL}) NOT found in permissions!`);
          logWarning('This confirms the form is not shared with the service account.');
        }
      }
    } else {
      const errorText = await driveResponse.text();
      logError(`Drive API access failed: ${driveResponse.status} ${driveResponse.statusText}`);
      logError(`Response: ${errorText}`);
      
      if (driveResponse.status === 404) {
        logWarning('Form file not found in Drive. This confirms the service account cannot access the form.');
      } else if (driveResponse.status === 403) {
        logWarning('Drive API access denied. You may need to enable Drive API or check permissions.');
      }
    }
  } catch (error) {
    logError(`Error accessing Drive API: ${error.message}`);
    logWarning('Note: Drive API might not be enabled. This is optional for Forms API.');
  }
  
  // Step 8: Additional debugging
  logSection('Step 8: Additional Debugging Information');
  
  logInfo('Form ID being used: ' + FORM_ID);
  logInfo('Service Account Email: ' + SERVICE_ACCOUNT_EMAIL);
  logInfo('\nTo verify form sharing:');
  logInfo('1. Open the form: https://docs.google.com/forms/d/e/' + FORM_ID + '/viewform');
  logInfo('2. Click the "Share" button');
  logInfo('3. Add this email with "Editor" permission: ' + SERVICE_ACCOUNT_EMAIL);
  logInfo('4. Make sure to click "Send" or "Done" after adding');
  logInfo('\nNote: It may take 2-5 minutes for permissions to propagate after sharing.');
  
  // Step 9: Summary
  logSection('Test Summary');
  
  logInfo('Test completed. Review the results above.');
  logInfo('\nTroubleshooting checklist:');
  logInfo('□ Form is shared with service account (' + SERVICE_ACCOUNT_EMAIL + ')');
  logInfo('□ Service account has "Editor" permission (not just "Viewer")');
  logInfo('□ Form ID is correct: ' + FORM_ID);
  logInfo('□ Google Forms API is enabled in Google Cloud Console');
  logInfo('□ Waited 2-5 minutes after sharing for permissions to propagate');
  logInfo('□ Form has responses (if testing responses endpoint)');
  
  console.log('\n');
}

// Run the test
main().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});

