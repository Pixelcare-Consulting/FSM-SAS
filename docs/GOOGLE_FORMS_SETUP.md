# Google Forms Integration Setup Guide

This guide explains how to set up the Google Forms API integration to fetch form responses from The Botany at Dairy Farm Aircon Service Form.

## Overview

The Google Forms integration allows you to:
- Fetch form responses from Google Forms
- Display responses in a tabbed interface
- Filter responses by status (All, Pending, Completed)
- Export responses to CSV

## Form Details

- **Form ID**: `1FAIpQLSfgCQmpEgCIzeuzLmwrZeV_lLwj1VFTL5aahjK49QAQX9MBuA`
- **Form URL**: https://docs.google.com/forms/d/e/1FAIpQLSfgCQmpEgCIzeuzLmwrZeV_lLwj1VFTL5aahjK49QAQX9MBuA/viewform

## Setup Instructions

### Option 1: Using Google API Key (Simpler, but limited)

1. **Create a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable Google Forms API**
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Forms API"
   - Click "Enable"

3. **Create API Key**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the API key

4. **Set Environment Variable**
   ```bash
   GOOGLE_API_KEY=your_api_key_here
   ```

### Option 2: Using Service Account (Recommended for production)

1. **Create Service Account**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Fill in the details and create the account

2. **Create and Download Key**
   - Click on the service account
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose JSON format
   - Download the key file

3. **Share Form with Service Account**
   - Open your Google Form
   - Click "Settings" (gear icon)
   - Go to "Responses" tab
   - Enable "Collect email addresses" if needed
   - Click "Get pre-filled link" or share the form with the service account email

4. **Set Environment Variables**
   ```bash
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

   Or if using a key file:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```

## Environment Variables

Add the following to your `.env.local` file:

```env
# Option 1: API Key
GOOGLE_API_KEY=your_api_key_here

# Option 2: Service Account (recommended)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Form ID (optional, defaults to the form in the code)
GOOGLE_FORMS_FORM_ID=1FAIpQLSfgCQmpEgCIzeuzLmwrZeV_lLwj1VFTL5aahjK49QAQX9MBuA
```

## Development Mode

If no Google API credentials are configured, the system will return mock data for development and testing purposes. This allows you to:
- Test the UI without API setup
- Develop features without API access
- See sample data structure

## API Endpoint

The API endpoint is available at:
```
GET /api/google-forms-responses
```

### Response Format

```json
{
  "responses": [
    {
      "id": "response-id",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "email": "user@example.com",
      "block": "3",
      "unit": "#05-03",
      "salutation": "Mr",
      "fullName": "JOHN DOE",
      "handphone": "+65 9123 4567",
      "firstServiceDate": "2024-02-01",
      "secondServiceDate": "2024-03-01",
      "thirdServiceDate": "2024-04-01",
      "fourthServiceDate": "2024-05-01",
      "timeSlot": "AM - Time Slot: 9.30am - 12.30pm",
      "agreedToTerms": "Yes",
      "personalInfoConsent": "Yes"
    }
  ],
  "total": 1,
  "formId": "1FAIpQLSfgCQmpEgCIzeuzLmwrZeV_lLwj1VFTL5aahjK49QAQX9MBuA"
}
```

## Page Access

Once set up, access the Google Forms page at:
```
/dashboard/google-forms
```

Or through the dashboard menu: **Google Forms**

## Features

### Tabs
- **All Responses**: Shows all form submissions
- **Pending Services**: Shows responses with upcoming service dates
- **Completed Services**: Shows responses with all services completed

### Actions
- **Refresh**: Manually refresh the data
- **Export CSV**: Download all responses as a CSV file

## Troubleshooting

### Issue: "Using mock data" message
**Solution**: Configure Google API credentials as described above.

### Issue: "Authentication required" error
**Solution**: 
- Verify your API key or service account credentials
- Ensure the Google Forms API is enabled
- Check that the service account has access to the form

### Issue: "Form not found" error
**Solution**:
- Verify the form ID is correct
- Ensure the form is shared with the service account (if using service account)
- Check that the form is not deleted

### Issue: Empty responses
**Solution**:
- Check if the form has any responses
- Verify form sharing settings
- Ensure the service account has "Viewer" access to the form

## Security Notes

- Never commit API keys or service account credentials to version control
- Use environment variables for all sensitive credentials
- Rotate API keys regularly
- Use service accounts with minimal required permissions

## Additional Resources

- [Google Forms API Documentation](https://developers.google.com/forms/api)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)

