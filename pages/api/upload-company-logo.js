import { getSupabaseAdmin } from '../../lib/supabase/server';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../lib/services/auditLog';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const admin = getSupabaseAdmin();
    const { path, fileData, contentType } = req.body;

    if (!path || !fileData) {
      return res.status(400).json({ 
        error: 'Missing required fields: path and fileData are required' 
      });
    }

    // Convert base64 string to buffer
    // fileData should be in format: "data:image/jpeg;base64,/9j/4AAQ..." or just the base64 part
    let base64Data = fileData;
    if (fileData.includes(',')) {
      base64Data = fileData.split(',')[1];
    }
    
    const fileBuffer = Buffer.from(base64Data, 'base64');

    // Upload file using admin client (bypasses RLS)
    const { data, error } = await admin.storage
      .from('company')
      .upload(path, fileBuffer, { 
        upsert: true,
        contentType: contentType || 'image/jpeg'
      });
    
    if (error) {
      console.error('Storage upload error:', error);
      throw error;
    }
    
    // Get public URL
    const { data: urlData } = admin.storage
      .from('company')
      .getPublicUrl(path);
    
    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      category: AUDIT_CATEGORIES.SETTINGS,
      description: 'Company logo uploaded',
      details: { area: 'company', path: data.path },
      status: AUDIT_STATUS.SUCCESS,
    });

    res.status(200).json({ 
      success: true,
      url: urlData.publicUrl,
      path: data.path
    });
  } catch (error) {
    console.error('Error uploading company logo:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to upload company logo' 
    });
  }
}

