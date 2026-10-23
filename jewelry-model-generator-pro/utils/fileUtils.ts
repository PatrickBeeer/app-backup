/**
 * Converts a base64 string to a raw base64 string (removes the data URL prefix)
 */
export const cleanBase64 = (base64Data: string): string => {
  return base64Data.split(',')[1] || base64Data;
};

/**
 * Gets the MIME type from a base64 data URL
 */
export const getMimeType = (base64Data: string): string => {
  const match = base64Data.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
  return match ? match[1] : 'image/jpeg';
};

