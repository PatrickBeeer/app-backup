export const fileToBase64 = (file: File): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const mimeType = result.substring(result.indexOf(':') + 1, result.indexOf(';'));
      const base64 = result.substring(result.indexOf(',') + 1);
      resolve({ base64, mimeType });
    };
    reader.onerror = (error) => reject(error);
  });
};

