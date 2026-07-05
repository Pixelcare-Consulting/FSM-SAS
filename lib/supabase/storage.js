/**
 * Supabase Storage service
 * Provides file upload/download functionality similar to Firebase Storage
 */

import { getSupabaseClient } from './client';
import { getSupabaseAdmin } from './server';

/**
 * Get storage client
 */
function getStorageClient(useAdmin = false) {
  if (useAdmin || typeof window === 'undefined') {
    return getSupabaseAdmin().storage;
  }
  return getSupabaseClient().storage;
}

/**
 * Upload a file to Supabase Storage
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @param {File|Blob} file - File to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with URL
 */
export async function uploadFile(bucket, path, file, options = {}) {
  const storage = getStorageClient(options.useAdmin);
  
  const {
    data,
    error
  } = await storage.from(bucket).upload(path, file, {
    cacheControl: options.cacheControl || '31536000',
    upsert: options.upsert || false,
    contentType: options.contentType || file.type
  });

  if (error) {
    throw error;
  }

  // Get public URL
  const { data: urlData } = storage.from(bucket).getPublicUrl(path);

  return {
    path: data.path,
    url: urlData.publicUrl,
    fullPath: `${bucket}/${path}`
  };
}

/**
 * Upload file with progress tracking
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @param {File} file - File to upload
 * @param {Function} onProgress - Progress callback
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
export async function uploadFileWithProgress(bucket, path, file, onProgress, options = {}) {
  const storage = getStorageClient(options.useAdmin);
  
  // Supabase doesn't have built-in progress tracking like Firebase
  // We'll simulate it or use a workaround
  return new Promise(async (resolve, reject) => {
    try {
      if (onProgress) {
        onProgress({ bytesTransferred: 0, totalBytes: file.size });
      }

      const result = await uploadFile(bucket, path, file, options);
      
      if (onProgress) {
        onProgress({ bytesTransferred: file.size, totalBytes: file.size });
      }

      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get download URL for a file
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path
 * @param {Object} options - Options
 * @returns {string} Public URL
 */
export function getDownloadURL(bucket, path, options = {}) {
  const storage = getStorageClient(options.useAdmin);
  const { data } = storage.from(bucket).getPublicUrl(path, {
    transform: options.transform
  });
  return data.publicUrl;
}

/**
 * Delete a file from storage
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
export async function deleteFile(bucket, path, options = {}) {
  const storage = getStorageClient(options.useAdmin);
  const { error } = await storage.from(bucket).remove([path]);
  
  if (error) {
    throw error;
  }
}

/**
 * List files in a bucket path
 * @param {string} bucket - Storage bucket name
 * @param {string} path - Path to list
 * @param {Object} options - Options
 * @returns {Promise<Array>} List of files
 */
export async function listFiles(bucket, path = '', options = {}) {
  const storage = getStorageClient(options.useAdmin);
  const { data, error } = await storage.from(bucket).list(path, {
    limit: options.limit || 100,
    offset: options.offset || 0,
    sortBy: options.sortBy || { column: 'name', order: 'asc' }
  });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Create a storage bucket (admin only)
 * @param {string} bucketName - Bucket name
 * @param {Object} options - Bucket options
 * @returns {Promise<void>}
 */
export async function createBucket(bucketName, options = {}) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.createBucket(bucketName, {
    public: options.public || false,
    allowedMimeTypes: options.allowedMimeTypes || null,
    fileSizeLimit: options.fileSizeLimit || null
  });

  if (error) {
    throw error;
  }

  return data;
}

