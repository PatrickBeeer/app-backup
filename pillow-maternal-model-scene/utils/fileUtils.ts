interface GenerativePart {
    inlineData: {
        data: string;
        mimeType: string;
    };
}

export const fileToGenerativePart = (file: File): Promise<GenerativePart> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, data] = dataUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] ?? file.type;
      
      if (!data || !mimeType) {
        reject(new Error("Could not parse file data URL."));
        return;
      }
      
      resolve({
        inlineData: {
          data,
          mimeType,
        },
      });
    };
    reader.onerror = (error) => reject(error);
  });
};

