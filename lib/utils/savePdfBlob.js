/**
 * Parse filename from Content-Disposition header with fallback.
 *
 * @param {string|null} contentDisposition
 * @param {string} fallbackFilename
 * @returns {string}
 */
export function parsePdfFilenameFromHeader(contentDisposition, fallbackFilename) {
  if (!contentDisposition) {
    return fallbackFilename;
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  const unquotedMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (unquotedMatch) {
    return unquotedMatch[1].trim();
  }

  return fallbackFilename;
}

function downloadPdfViaAnchor(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Save a PDF blob via the File System Access API (Chrome/Edge) or anchor download fallback.
 * Avoids Mark-of-the-Web on Windows by letting the user pick a save location in supported browsers.
 *
 * @param {Blob} blob - PDF blob to save
 * @param {string} filename - Suggested filename (e.g. jobsheet-123.pdf)
 * @returns {Promise<{ method: 'picker' | 'download' | 'cancelled' }>}
 */
export async function savePdfBlob(blob, filename) {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        startIn: 'downloads',
        types: [
          {
            description: 'PDF',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { method: 'picker' };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { method: 'cancelled' };
      }
      if (error.name === 'SecurityError' || error.name === 'NotAllowedError') {
        downloadPdfViaAnchor(blob, filename);
        return { method: 'download' };
      }
      throw error;
    }
  }

  downloadPdfViaAnchor(blob, filename);
  return { method: 'download' };
}
